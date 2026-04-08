import type { AstroIntegration } from "astro";

import { squeezitVite, type SqueezitVitePluginOptions } from "./vite";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SqueezitAstroOptions extends SqueezitVitePluginOptions {}

export function squeezitAstro(
  options: SqueezitAstroOptions = {}
): AstroIntegration {
  return {
    name: "squeezit:astro",
    hooks: {
      "astro:config:setup"({ command, config, logger, updateConfig }) {
        if (command !== "build") {
          return;
        }

        if (config.output === "server") {
          logger.warn(
            "[squeezit:astro] Skipping optimization because only static Astro builds are supported."
          );
          return;
        }

        updateConfig({
          vite: {
            plugins: [squeezitVite(options) as never],
          },
        });
      },
    },
  };
}

export default squeezitAstro;
