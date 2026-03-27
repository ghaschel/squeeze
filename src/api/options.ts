import { cpus } from "node:os";
import { basename, join, resolve } from "node:path";

import type {
  ApiOptimizationMode,
  CoreOptimizationOptions,
  OptimizeFileOptions,
  OptimizeFilesOptions,
  ResolvedInput,
} from "../types";

interface NormalizedApiOptions {
  mode: ApiOptimizationMode;
  cwd: string;
  outputDir?: string;
  recursive: boolean;
  checkDependencies: boolean;
  core: CoreOptimizationOptions;
}

export function normalizeFileOptions(
  options: OptimizeFileOptions = {},
  cwd = process.cwd()
): NormalizedApiOptions {
  return normalizeSharedOptions(options, cwd, false);
}

export function normalizeFilesOptions(
  options: OptimizeFilesOptions = {},
  cwd = process.cwd()
): NormalizedApiOptions {
  return normalizeSharedOptions(options, cwd, options.recursive ?? false);
}

export function attachOutputTargets(
  inputs: ResolvedInput[],
  outputDir: string | undefined,
  cwd: string
): ResolvedInput[] {
  if (!outputDir) {
    return inputs;
  }

  return inputs.map((input) => {
    const relativeOutput = toOutputRelativePath(
      input.displayPath,
      input.absolutePath,
      cwd
    );

    return {
      ...input,
      outputPath: join(outputDir, relativeOutput),
      preserveOriginal: true,
    };
  });
}

function normalizeSharedOptions(
  options: OptimizeFileOptions | OptimizeFilesOptions,
  cwd: string,
  recursive: boolean
): NormalizedApiOptions {
  const mode = options.mode ?? "default";
  const max = mode === "max";
  const exifOnly = mode === "exif";
  const stripMeta = max || exifOnly || (options.stripMetadata ?? false);
  const threshold = max ? 0 : (options.threshold ?? 100);
  const concurrency =
    "concurrency" in options && typeof options.concurrency === "number"
      ? options.concurrency
      : max
        ? Math.min(cpus().length || 1, 2)
        : cpus().length || 1;

  return {
    mode,
    cwd: options.cwd ? resolve(options.cwd) : cwd,
    outputDir: options.outputDir ? resolve(options.outputDir) : undefined,
    recursive,
    checkDependencies: options.checkDependencies ?? true,
    core: {
      max,
      stripMeta,
      exifOnly,
      dryRun: options.dryRun ?? false,
      keepTime: options.keepTime ?? false,
      concurrency,
      threshold,
      inPlace: false,
    },
  };
}

function toOutputRelativePath(
  displayPath: string,
  absolutePath: string,
  cwd: string
): string {
  const candidate = normalizeRelativeSegments(displayPath);
  if (candidate.length > 0) {
    return candidate;
  }

  const fromCwd = normalizeRelativeSegments(
    absolutePath.startsWith(cwd) ? absolutePath.slice(cwd.length + 1) : ""
  );
  if (fromCwd.length > 0) {
    return fromCwd;
  }

  return basename(absolutePath);
}

function normalizeRelativeSegments(value: string): string {
  const parts = value
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "." && part !== "..");

  return parts.join("/");
}
