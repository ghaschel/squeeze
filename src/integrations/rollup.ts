import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { dirname, extname, posix, resolve } from "node:path";

import type {
  NormalizedOutputOptions,
  OutputAsset,
  OutputBundle,
  OutputChunk,
  Plugin as RollupPlugin,
} from "rollup";

import {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  createBufferAsset,
  detectPlatform,
  findMissingDependencies,
  optimizeAsset,
  optimizeImages,
  resolveInputs,
} from "../core";
import type {
  CoreOptimizationOptions,
  OptimizationResult,
  OptimizeFilesOptions,
  ResolvedInput,
  Summary,
} from "../types";

const supportedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".apng",
  ".gif",
  ".webp",
  ".svg",
  ".heif",
  ".heic",
  ".avif",
  ".bmp",
  ".jxl",
  ".ico",
  ".cur",
  ".tif",
  ".tiff",
]);

export interface SqueezitRollupPluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

export interface RollupOptimizationRun {
  results: OptimizationResult[];
  summary: Summary;
}

export function createRollupOptimizationOptions(
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

export function createRollupCoreOptions(): CoreOptimizationOptions {
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

export async function optimizeRollupOutputDirectory(
  outDir: string,
  options: SqueezitRollupPluginOptions = {},
  excludedPaths: string[] = []
): Promise<RollupOptimizationRun> {
  const excluded = new Set(excludedPaths.map((value) => resolve(value)));
  const allInputs = await resolveInputs({
    patterns: [],
    recursive: true,
    cwd: outDir,
  });
  const inputs = allInputs.filter(
    (input) => !excluded.has(resolve(input.absolutePath))
  );

  if (inputs.length === 0) {
    return {
      results: [],
      summary: {
        processed: 0,
        optimized: 0,
        dryRunEligible: 0,
        failed: 0,
        skipped: 0,
        savedBytes: 0,
        startedAt: Date.now(),
      },
    };
  }

  if (options.checkDependencies ?? true) {
    await assertDependencies(inputs);
  }

  const results: OptimizationResult[] = [];
  const summary = await optimizeImages(
    inputs,
    createRollupCoreOptions(),
    (result) => {
      results.push(result);
    }
  );

  return { results, summary };
}

export function squeezitRollup(
  options: SqueezitRollupPluginOptions = {}
): RollupPlugin {
  const seenBundleImageFiles = new Set<string>();

  return {
    name: "squeezit:rollup",
    async generateBundle(_outputOptions, bundle) {
      if (options.enabled === false) {
        return;
      }

      const imageAssets = collectRollupImageAssets(bundle);
      if (imageAssets.length === 0) {
        return;
      }

      if (options.checkDependencies ?? true) {
        await assertDependencies(
          imageAssets.map((asset) => toResolvedInput(asset.fileName))
        );
      }

      const failures: string[] = [];

      for (const asset of imageAssets) {
        seenBundleImageFiles.add(asset.fileName);

        const source = normalizeRollupAssetSource(asset.source);
        const optimized = await optimizeAsset(
          createBufferAsset(posix.basename(asset.fileName), source),
          createRollupCoreOptions()
        );

        if (optimized.result.status === "failed") {
          failures.push(
            `${asset.fileName}: ${optimized.result.message ?? "unknown error"}`
          );
          continue;
        }

        if (optimized.result.status !== "optimized") {
          continue;
        }

        asset.source = optimized.contents;

        const renamedFileName = resolveRenamedRollupAssetFileName(
          asset,
          asset.fileName,
          optimized.contents
        );

        if (renamedFileName && renamedFileName !== asset.fileName) {
          renameRollupBundleAsset(bundle, asset.fileName, renamedFileName);
          seenBundleImageFiles.delete(asset.fileName);
          seenBundleImageFiles.add(renamedFileName);
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `squeezit rollup optimization failed:\n${failures.join("\n")}`
        );
      }
    },
    async writeBundle(outputOptions, bundle) {
      if (options.enabled === false) {
        return;
      }

      const outDir = resolveRollupOutputDirectory(outputOptions);
      const excluded = Array.from(seenBundleImageFiles).map((fileName) =>
        resolve(outDir, fileName)
      );
      const run = await optimizeRollupOutputDirectory(
        outDir,
        options,
        excluded
      );
      const failures = run.results.filter(
        (result) => result.status === "failed"
      );

      if (failures.length === 0) {
        return;
      }

      const details = failures
        .map(
          (result) => `${result.filePath}: ${result.message ?? "unknown error"}`
        )
        .join("\n");
      throw new Error(`squeezit rollup optimization failed:\n${details}`);
    },
  };
}

function resolveRollupOutputDirectory(
  outputOptions: NormalizedOutputOptions
): string {
  if (outputOptions.dir) {
    return resolve(outputOptions.dir);
  }

  if (outputOptions.file) {
    return dirname(resolve(outputOptions.file));
  }

  throw new Error(
    "[squeezit:rollup] Cannot optimize emitted assets because neither output.dir nor output.file is set."
  );
}

function collectRollupImageAssets(bundle: OutputBundle): OutputAsset[] {
  return Object.values(bundle).filter(
    (entry): entry is OutputAsset =>
      entry.type === "asset" && isSupportedRollupAssetFileName(entry.fileName)
  );
}

function isSupportedRollupAssetFileName(fileName: string): boolean {
  return supportedExtensions.has(extname(fileName).toLowerCase());
}

function normalizeRollupAssetSource(source: string | Uint8Array): Buffer {
  return typeof source === "string" ? Buffer.from(source) : Buffer.from(source);
}

function toResolvedInput(fileName: string): ResolvedInput {
  return {
    absolutePath: posix.join("/virtual", fileName),
    displayPath: fileName,
  };
}

async function assertDependencies(inputs: ResolvedInput[]): Promise<void> {
  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, createRollupCoreOptions())
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

export function resolveRenamedRollupAssetFileName(
  asset: OutputAsset,
  currentFileName: string,
  contents: Buffer
): string | null {
  const extension = posix.extname(currentFileName);
  const baseName = posix.basename(currentFileName, extension);
  const directory = posix.dirname(currentFileName);
  const nameHints = extractRollupAssetNameHints(asset);

  for (const hint of nameHints) {
    const hintedBase = posix.basename(hint, posix.extname(hint));
    if (!baseName.startsWith(hintedBase)) {
      continue;
    }

    const suffix = baseName.slice(hintedBase.length);
    const hashMatch = findHashSegment(suffix);
    if (!hashMatch) {
      continue;
    }

    const nextHash = createHash("sha256")
      .update(contents)
      .digest("hex")
      .slice(0, hashMatch.hash.length);
    const nextBase =
      hintedBase +
      suffix.slice(0, hashMatch.index) +
      nextHash +
      suffix.slice(hashMatch.index + hashMatch.hash.length);
    return directory === "."
      ? `${nextBase}${extension}`
      : `${directory}/${nextBase}${extension}`;
  }

  const genericHashMatch = findHashSegment(baseName);
  if (!genericHashMatch) {
    return null;
  }

  const nextHash = createHash("sha256")
    .update(contents)
    .digest("hex")
    .slice(0, genericHashMatch.hash.length);
  const nextBase =
    baseName.slice(0, genericHashMatch.index) +
    nextHash +
    baseName.slice(genericHashMatch.index + genericHashMatch.hash.length);
  return directory === "."
    ? `${nextBase}${extension}`
    : `${directory}/${nextBase}${extension}`;
}

export function renameRollupBundleAsset(
  bundle: OutputBundle,
  currentFileName: string,
  nextFileName: string
): void {
  if (currentFileName === nextFileName) {
    return;
  }

  const asset = bundle[currentFileName];
  if (!asset || asset.type !== "asset") {
    return;
  }

  delete bundle[currentFileName];
  asset.fileName = nextFileName;
  bundle[nextFileName] = asset;

  rewriteRollupBundleReferences(bundle, currentFileName, nextFileName);
}

export function rewriteRollupBundleReferences(
  bundle: OutputBundle,
  currentFileName: string,
  nextFileName: string
): void {
  for (const entry of Object.values(bundle)) {
    if (entry.type === "chunk") {
      rewriteChunkReferences(entry, currentFileName, nextFileName);
      continue;
    }

    if (entry.fileName === currentFileName) {
      entry.fileName = nextFileName;
    }

    if (typeof entry.source === "string") {
      entry.source = entry.source.split(currentFileName).join(nextFileName);
      continue;
    }

    const text = Buffer.from(entry.source).toString("utf8");
    if (text.includes(currentFileName)) {
      entry.source = Buffer.from(
        text.split(currentFileName).join(nextFileName),
        "utf8"
      );
    }
  }
}

function rewriteChunkReferences(
  chunk: OutputChunk,
  currentFileName: string,
  nextFileName: string
): void {
  chunk.code = chunk.code.split(currentFileName).join(nextFileName);
  chunk.fileName =
    chunk.fileName === currentFileName ? nextFileName : chunk.fileName;
  chunk.referencedFiles = chunk.referencedFiles.map((fileName) =>
    fileName === currentFileName ? nextFileName : fileName
  );
  chunk.imports = chunk.imports.map((fileName) =>
    fileName === currentFileName ? nextFileName : fileName
  );
  chunk.dynamicImports = chunk.dynamicImports.map((fileName) =>
    fileName === currentFileName ? nextFileName : fileName
  );
}

function extractRollupAssetNameHints(asset: OutputAsset): string[] {
  const hints = new Set<string>();
  const maybeNames = [
    ...(asset.names ?? []),
    ...(asset.originalFileNames ?? []),
    ...(asset.name ? [asset.name] : []),
  ];

  for (const hint of maybeNames) {
    if (hint) {
      hints.add(posix.basename(hint));
    }
  }

  return Array.from(hints).sort((left, right) => right.length - left.length);
}

function findHashSegment(
  value: string
): { index: number; hash: string } | null {
  const matches = [...value.matchAll(/([A-Za-z0-9]{8,})/g)];
  const match = matches.at(-1);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    index: match.index,
    hash: match[1] ?? "",
  };
}

export default squeezitRollup;
