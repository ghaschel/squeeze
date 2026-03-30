import type { NextConfig } from "next";

import { squeezitWebpack, type SqueezitWebpackPluginOptions } from "./webpack";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SqueezitNextOptions extends SqueezitWebpackPluginOptions {}

type NextConfigFactory = (
  ...args: unknown[]
) => NextConfig | Promise<NextConfig>;

export function withSqueezit(
  nextConfig: NextConfig | NextConfigFactory = {},
  options: SqueezitNextOptions = {}
): NextConfig | NextConfigFactory {
  if (typeof nextConfig === "function") {
    return async (...args: unknown[]) =>
      enhanceNextConfig(await nextConfig(...args), options);
  }

  return enhanceNextConfig(nextConfig, options);
}

function enhanceNextConfig(
  nextConfig: NextConfig,
  options: SqueezitNextOptions
): NextConfig {
  const userWebpack = nextConfig.webpack;

  return {
    ...nextConfig,
    webpack(config, context) {
      const configured = userWebpack ? userWebpack(config, context) : config;

      const finalize = (resolvedConfig: typeof config) => {
        resolvedConfig.plugins ??= [];
        resolvedConfig.plugins.push(squeezitWebpack(options));
        return resolvedConfig;
      };

      if (
        configured &&
        typeof (configured as Promise<typeof config>).then === "function"
      ) {
        return (configured as Promise<typeof config>).then(finalize);
      }

      return finalize(configured);
    },
  };
}

export default withSqueezit;
