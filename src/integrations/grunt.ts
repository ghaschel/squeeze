import { cp, mkdir } from "node:fs/promises";
import { cpus } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";

import { optimizeFile } from "../api";
import type { CoreOptimizationOptions, OptimizeFileOptions } from "../types";

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
  ".arw",
  ".cr2",
  ".nef",
  ".orf",
  ".raf",
  ".rw2",
  ".tif",
  ".tiff",
]);

export interface SqueezitGruntTaskOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

interface GruntFileMapping {
  src: string[];
  dest?: string;
}

interface GruntTaskContextLike {
  files: GruntFileMapping[];
  options<T>(defaults?: T): T;
  async(): (success?: boolean) => void;
}

interface GruntLike {
  registerMultiTask(
    name: string,
    description: string,
    task: (this: GruntTaskContextLike) => void
  ): void;
  log: {
    error(message: string): void;
  };
}

export function createGruntOptimizationOptions(
  cwd: string,
  checkDependencies = true
): OptimizeFileOptions {
  return {
    cwd,
    mode: "default",
    stripMetadata: true,
    checkDependencies,
  };
}

export function createGruntCoreOptions(): CoreOptimizationOptions {
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

export function registerSqueezitTask(
  grunt: GruntLike,
  taskName = "squeezit"
): void {
  grunt.registerMultiTask(
    taskName,
    "Optimize image files with squeezit.",
    function () {
      const done = this.async();
      const options = this.options<SqueezitGruntTaskOptions>({
        enabled: true,
        checkDependencies: true,
      });

      void runGruntTask(this.files, options)
        .then(() => {
          done();
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          grunt.log.error(message);
          done(false);
        });
    }
  );
}

async function runGruntTask(
  files: GruntFileMapping[],
  options: SqueezitGruntTaskOptions
): Promise<void> {
  for (const mapping of files) {
    const sources = mapping.src.filter(Boolean);

    for (const source of sources) {
      await processGruntFile(source, mapping.dest, sources.length, options);
    }
  }
}

async function processGruntFile(
  source: string,
  dest: string | undefined,
  sourceCount: number,
  options: SqueezitGruntTaskOptions
): Promise<void> {
  const resolvedSource = resolve(source);
  const targetPath = resolveMappedDestination(
    resolvedSource,
    dest,
    sourceCount
  );

  if (!isSupportedImagePath(resolvedSource)) {
    if (targetPath) {
      await mkdir(dirname(targetPath), { recursive: true });
      await cp(resolvedSource, targetPath);
    }
    return;
  }

  if (options.enabled === false) {
    if (targetPath) {
      await mkdir(dirname(targetPath), { recursive: true });
      await cp(resolvedSource, targetPath);
    }
    return;
  }

  const optimizationTarget = targetPath ?? resolvedSource;

  if (targetPath) {
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(resolvedSource, targetPath);
  }

  const result = await optimizeFile(
    optimizationTarget,
    createGruntOptimizationOptions(
      dirname(optimizationTarget),
      options.checkDependencies ?? true
    )
  );

  if (result.status === "failed") {
    throw new Error(
      result.message ??
        `[squeezit:grunt] Failed to optimize ${basename(optimizationTarget)}.`
    );
  }
}

function isSupportedImagePath(filePath: string): boolean {
  return supportedExtensions.has(extname(filePath).toLowerCase());
}

function resolveMappedDestination(
  source: string,
  dest: string | undefined,
  sourceCount: number
): string | null {
  if (!dest) {
    return null;
  }

  const resolvedDest = resolve(dest);
  if (resolvedDest === source) {
    return null;
  }

  if (sourceCount > 1 || isDirectoryStylePath(dest)) {
    return resolve(resolvedDest, basename(source));
  }

  return resolvedDest;
}

function isDirectoryStylePath(filePath: string): boolean {
  return (
    filePath.endsWith("/") ||
    filePath.endsWith("\\") ||
    extname(filePath) === ""
  );
}

export default registerSqueezitTask;
