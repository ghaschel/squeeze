import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";

import { Optimizer } from "@parcel/plugin";
import type { Blob, Config, NamedBundle, PluginOptions } from "@parcel/types";

import {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  createBufferAsset,
  detectPlatform,
  findMissingDependencies,
  optimizeAsset,
} from "../core";
import type {
  CoreOptimizationOptions,
  OptimizeFilesOptions,
  ResolvedInput,
} from "../types";

const supportedParcelBundleTypes = new Set([
  "png",
  "gif",
  "webp",
  "svg",
  "heif",
  "heic",
  "avif",
  "bmp",
  "ico",
  "cur",
  "jxl",
]);

interface SqueezitParcelPackageJson {
  squeezit?: {
    parcel?: unknown;
  };
}

export interface SqueezitParcelPluginOptions {
  enabled: boolean;
  checkDependencies: boolean;
  productionOnly: boolean;
}

export function createParcelOptimizationOptions(
  cwd: string,
  checkDependencies = true
): OptimizeFilesOptions {
  return {
    cwd,
    recursive: true,
    mode: "default",
    stripMetadata: true,
    checkDependencies,
  };
}

export function createParcelCoreOptions(): CoreOptimizationOptions {
  return {
    max: false,
    stripMeta: true,
    exifOnly: false,
    dryRun: false,
    keepTime: false,
    concurrency: cpus().length || 1,
    threshold: 100,
    inPlace: false,
  };
}

export function normalizeParcelPluginConfig(
  raw: unknown
): SqueezitParcelPluginOptions {
  const defaults: SqueezitParcelPluginOptions = {
    enabled: true,
    checkDependencies: true,
    productionOnly: true,
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const candidate = raw as Record<string, unknown>;

  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : defaults.enabled,
    checkDependencies:
      typeof candidate.checkDependencies === "boolean"
        ? candidate.checkDependencies
        : defaults.checkDependencies,
    productionOnly:
      typeof candidate.productionOnly === "boolean"
        ? candidate.productionOnly
        : defaults.productionOnly,
  };
}

export async function loadParcelPluginConfigFromProjectRoot(
  projectRoot: string
): Promise<SqueezitParcelPluginOptions> {
  try {
    const contents = JSON.parse(
      await readFile(join(projectRoot, "package.json"), "utf8")
    ) as SqueezitParcelPackageJson;

    return normalizeParcelPluginConfig(contents.squeezit?.parcel);
  } catch {
    return normalizeParcelPluginConfig(undefined);
  }
}

export async function loadParcelPluginConfig(
  config: Config
): Promise<SqueezitParcelPluginOptions> {
  const packageJson = await config.getConfig<SqueezitParcelPackageJson>([
    "package.json",
  ]);

  return normalizeParcelPluginConfig(packageJson?.contents.squeezit?.parcel);
}

export const squeezitParcel = new Optimizer<SqueezitParcelPluginOptions, void>({
  async loadConfig({ config }) {
    return loadParcelPluginConfig(config);
  },
  async optimize({ bundle, contents, map, options, config }) {
    if (config.enabled === false) {
      return {
        contents,
        map,
        type: bundle.type,
      };
    }

    if (config.productionOnly && options.mode !== "production") {
      return {
        contents,
        map,
        type: bundle.type,
      };
    }

    if (!supportedParcelBundleTypes.has(bundle.type)) {
      return {
        contents,
        map,
        type: bundle.type,
      };
    }

    const input = toResolvedInput(bundle, options);
    if (config.checkDependencies) {
      await assertDependencies([input]);
    }

    const optimized = await optimizeAsset(
      createBufferAsset(
        basename(input.absolutePath),
        await normalizeParcelContents(contents)
      ),
      createParcelCoreOptions()
    );

    if (optimized.result.status === "failed") {
      throw new Error(
        `squeezit parcel optimization failed for ${bundle.displayName}: ${optimized.result.message ?? "unknown error"}`
      );
    }

    if (optimized.result.status !== "optimized") {
      return {
        contents,
        map,
        type: bundle.type,
      };
    }

    return {
      contents: optimized.contents,
      map: null,
      type: bundle.type,
    };
  },
});

function toResolvedInput(
  bundle: NamedBundle,
  options: PluginOptions
): ResolvedInput {
  const fileName = basename(bundle.displayName || bundle.name);

  return {
    absolutePath: join(options.projectRoot, fileName),
    displayPath: fileName,
  };
}

async function assertDependencies(inputs: ResolvedInput[]): Promise<void> {
  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, createParcelCoreOptions())
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

async function normalizeParcelContents(contents: Blob): Promise<Buffer> {
  if (Buffer.isBuffer(contents)) {
    return contents;
  }

  if (typeof contents === "string") {
    return Buffer.from(contents);
  }

  return readableToBuffer(contents);
}

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default squeezitParcel;
