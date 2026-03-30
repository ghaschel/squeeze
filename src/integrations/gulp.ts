import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { Transform } from "node:stream";

import { optimizeFile } from "../api";
import type { CoreOptimizationOptions, OptimizeFileOptions } from "../types";

interface VinylLike {
  path?: string;
  history?: string[];
  relative?: string;
  stat?: { size?: number };
  contents: Buffer | NodeJS.ReadableStream | null;
  isBuffer(): boolean;
  isStream(): boolean;
}

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

export interface SqueezitGulpPluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

export function createGulpOptimizationOptions(
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

export function createGulpCoreOptions(): CoreOptimizationOptions {
  return {
    max: false,
    stripMeta: true,
    exifOnly: false,
    dryRun: false,
    keepTime: false,
    concurrency: 1,
    threshold: 100,
    inPlace: false,
  };
}

export function squeezitGulp(
  options: SqueezitGulpPluginOptions = {}
): Transform {
  return new Transform({
    objectMode: true,
    transform(file: VinylLike, _encoding, callback) {
      void handleGulpFile(file, options)
        .then((result) => {
          callback(null, result);
        })
        .catch((error) => {
          callback(error as Error);
        });
    },
  });
}

async function handleGulpFile(
  file: VinylLike,
  options: SqueezitGulpPluginOptions
): Promise<VinylLike> {
  if (options.enabled === false || !isSupportedGulpFile(file)) {
    return file;
  }

  if (file.isStream()) {
    throw new Error(
      "[squeezit:gulp] Streaming Vinyl contents are not supported yet."
    );
  }

  const tempWorkspace = await mkdtemp(join(tmpdir(), "squeezit-gulp-"));

  try {
    const fileName = getVinylFileName(file);
    const tempPath = join(tempWorkspace, fileName);

    if (file.path) {
      await cp(file.path, tempPath);
    } else if (file.isBuffer() && Buffer.isBuffer(file.contents)) {
      await writeFile(tempPath, file.contents);
    } else {
      return file;
    }

    const result = await optimizeFile(
      tempPath,
      createGulpOptimizationOptions(
        tempWorkspace,
        options.checkDependencies ?? true
      )
    );

    if (result.status === "failed") {
      throw new Error(
        result.message ?? `[squeezit:gulp] Failed to optimize ${fileName}.`
      );
    }

    const optimizedContents = await readFile(tempPath);
    file.contents = optimizedContents;

    if (file.stat) {
      file.stat.size = optimizedContents.byteLength;
    }

    return file;
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
}

function isSupportedGulpFile(file: VinylLike): boolean {
  return supportedExtensions.has(extname(getVinylFileName(file)).toLowerCase());
}

function getVinylFileName(file: VinylLike): string {
  return basename(file.path || file.history?.[0] || file.relative || "file");
}

export default squeezitGulp;
