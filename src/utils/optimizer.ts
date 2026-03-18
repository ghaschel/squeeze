import { stat, unlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, parse } from "node:path";

import { copy, ensureDir, mkdtemp, move, pathExists, remove } from "fs-extra";

import type {
  CompressCommandOptions,
  DetectedImage,
  OptimizationResult,
  ResolvedInput,
  Summary,
  SupportedFormat,
} from "../types";
import { runCheckedCommand, writeCommandStdoutToFile } from "./exec";

const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

const MIME_TO_FORMAT: Record<string, SupportedFormat> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

export async function optimizeImages(
  inputs: ResolvedInput[],
  options: CompressCommandOptions,
  onResult?: (result: OptimizationResult) => void
): Promise<Summary> {
  const summary: Summary = {
    processed: 0,
    optimized: 0,
    dryRunEligible: 0,
    failed: 0,
    skipped: 0,
    savedBytes: 0,
    startedAt: Date.now(),
  };

  await runWithConcurrency(options.concurrency, inputs, async (input) => {
    const result = await optimizeSingleImage(input, options);
    summary.processed += 1;

    if (result.status === "optimized") {
      summary.optimized += 1;
      summary.savedBytes += result.savedBytes;
    } else if (result.status === "dry-run") {
      summary.dryRunEligible += 1;
      summary.savedBytes += result.savedBytes;
    } else if (result.status === "failed") {
      summary.failed += 1;
    } else {
      summary.skipped += 1;
    }

    onResult?.(result);
  });

  return summary;
}

async function optimizeSingleImage(
  input: ResolvedInput,
  options: CompressCommandOptions
): Promise<OptimizationResult> {
  try {
    const detected = await detectImage(input.absolutePath);
    if (!detected) {
      return skippedResult(input.absolutePath, "[SKIP]", "unsupported format");
    }

    if (detected.format === "raw" && !options.max && !options.stripMeta) {
      return skippedResult(
        input.absolutePath,
        "[SKIP]",
        "raw files require --max or --strip-meta"
      );
    }

    const originalStats = await stat(input.absolutePath);
    const workDir = await createWorkDirectory(
      input.absolutePath,
      options.inPlace
    );
    const workingInputPath = join(workDir, basename(input.absolutePath));
    await copy(input.absolutePath, workingInputPath, { overwrite: true });

    try {
      const pipeline = await runPipeline({
        detected,
        originalPath: input.absolutePath,
        workingInputPath,
        workDir,
        options,
      });

      const optimizedStats = await stat(pipeline.outputPath);
      const savedBytes = originalStats.size - optimizedStats.size;
      const targetPath = pipeline.targetPath ?? input.absolutePath;

      if (optimizedStats.size >= originalStats.size - options.threshold) {
        return {
          filePath: input.absolutePath,
          label: pipeline.label,
          status: "skipped",
          originalSize: originalStats.size,
          optimizedSize: optimizedStats.size,
          savedBytes: Math.max(savedBytes, 0),
          message: describeSkipReason(savedBytes, options.threshold),
          targetPath,
        };
      }

      if (options.dryRun) {
        return {
          filePath: input.absolutePath,
          label: pipeline.label,
          status: "dry-run",
          originalSize: originalStats.size,
          optimizedSize: optimizedStats.size,
          savedBytes,
          targetPath,
        };
      }

      await applyReplacement({
        sourcePath: pipeline.outputPath,
        originalPath: input.absolutePath,
        targetPath,
        keepTime: options.keepTime,
        originalAtime: originalStats.atime,
        originalMtime: originalStats.mtime,
      });

      return {
        filePath: input.absolutePath,
        label: pipeline.label,
        status: "optimized",
        originalSize: originalStats.size,
        optimizedSize: optimizedStats.size,
        savedBytes,
        targetPath,
      };
    } finally {
      await remove(workDir);
    }
  } catch (error) {
    return {
      filePath: input.absolutePath,
      label: "[FAIL]",
      status: "failed",
      originalSize: 0,
      optimizedSize: 0,
      savedBytes: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function detectImage(
  filePath: string
): Promise<DetectedImage | null> {
  const rawExtension = extname(filePath).toLowerCase();
  if (RAW_EXTENSIONS.has(rawExtension)) {
    return {
      format: "raw",
      mimeType: "image/x-raw",
      animated: false,
    };
  }

  const mimeType = (
    await runCheckedCommand("file", ["--mime-type", "-b", filePath])
  ).stdout.trim();
  const format = MIME_TO_FORMAT[mimeType];

  if (!format) {
    return null;
  }

  let animated = false;
  if (format === "gif") {
    animated = await isAnimatedGif(filePath);
  } else if (format === "webp") {
    animated = await isAnimatedWebp(filePath);
  }

  return {
    format,
    mimeType,
    animated,
  };
}

async function runPipeline(params: {
  detected: DetectedImage;
  originalPath: string;
  workingInputPath: string;
  workDir: string;
  options: CompressCommandOptions;
}): Promise<{ outputPath: string; targetPath?: string; label: string }> {
  const { detected, originalPath, workingInputPath, workDir, options } = params;

  switch (detected.format) {
    case "png":
      return optimizePng(workingInputPath, workDir, options);
    case "jpeg":
      return optimizeJpeg(workingInputPath, workDir, options);
    case "gif":
      return optimizeGif(workingInputPath, workDir, options, detected.animated);
    case "svg":
      return optimizeSvg(workingInputPath, workDir, options);
    case "webp":
      return optimizeWebp(
        workingInputPath,
        workDir,
        options,
        detected.animated
      );
    case "tiff":
      return optimizeTiff(workingInputPath, workDir, options);
    case "heif":
      return optimizeHeif(workingInputPath, workDir, options);
    case "avif":
      return optimizeAvif(workingInputPath, workDir, options);
    case "bmp":
      return optimizeBmp(workingInputPath, workDir, options);
    case "raw":
      return optimizeRaw(originalPath, workingInputPath, workDir, options);
  }
}

async function optimizePng(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const crushedPath = join(workDir, "stage-1.png");
  const optipngOutput = join(
    workDir,
    options.max ? "stage-2.png" : "optimized.png"
  );
  const optimizedPath = join(workDir, "optimized.png");

  await runCheckedCommand("pngcrush", [
    "-brute",
    "-reduce",
    inputPath,
    crushedPath,
  ]);
  await runCheckedCommand("optipng", [
    "-o7",
    crushedPath,
    "-out",
    optipngOutput,
  ]);

  if (!options.max) {
    if (options.stripMeta) {
      await stripMetadata(optipngOutput);
    }
    return { outputPath: optipngOutput, label: "[PNG]" };
  }

  await runCheckedCommand("zopflipng", [
    "--iterations=500",
    "--filters=01234mepb",
    optipngOutput,
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[PNG]" };
}

async function optimizeJpeg(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const jpegtranOutput = join(workDir, "stage-1.jpg");
  const optimizedPath = join(workDir, "optimized.jpg");

  await writeCommandStdoutToFile(
    "jpegtran",
    [
      "-copy",
      options.stripMeta ? "none" : "all",
      "-optimize",
      "-progressive",
      inputPath,
    ],
    jpegtranOutput
  );
  await runCheckedCommand("jpegrescan", [jpegtranOutput, optimizedPath]);
  if (options.stripMeta) {
    await runCheckedCommand("jpegoptim", ["--strip-all", optimizedPath]);
  }
  return { outputPath: optimizedPath, label: "[JPEG]" };
}

async function optimizeGif(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions,
  animated: boolean
): Promise<{ outputPath: string; label: string }> {
  const optimizedPath = join(workDir, "optimized.gif");
  const args = ["-O3"];
  if (options.stripMeta) {
    args.push("--no-comments", "--no-names");
  }
  args.push(inputPath, "-o", optimizedPath);
  await runCheckedCommand("gifsicle", args);
  return {
    outputPath: optimizedPath,
    label: animated ? "[GIF-ANIM]" : "[GIF]",
  };
}

async function optimizeSvg(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const optimizedPath = join(workDir, "optimized.svg");
  await runCheckedCommand("svgo", [
    "--multipass",
    inputPath,
    "-o",
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[SVG]" };
}

async function optimizeWebp(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions,
  animated: boolean
): Promise<{ outputPath: string; label: string }> {
  const optimizedPath = join(workDir, "optimized.webp");

  if (animated) {
    const tempGif = join(workDir, "stage.gif");
    await runCheckedCommand("magick", [inputPath, tempGif]);
    await runCheckedCommand("gif2webp", [
      "-lossless",
      tempGif,
      "-o",
      optimizedPath,
    ]);
    if (options.stripMeta) {
      await stripMetadata(optimizedPath);
    }
    return { outputPath: optimizedPath, label: "[WEBP-ANIM]" };
  }

  const tempPng = join(workDir, "stage.png");
  await runCheckedCommand("dwebp", [inputPath, "-o", tempPng]);
  await runCheckedCommand("cwebp", [
    "-lossless",
    "-z",
    "9",
    "-m",
    "6",
    tempPng,
    "-o",
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[WEBP]" };
}

async function optimizeTiff(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const optimizedPath = join(workDir, "optimized.tiff");
  await runCheckedCommand("tiffcp", ["-c", "zip:9", inputPath, optimizedPath]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[TIFF]" };
}

async function optimizeHeif(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const pngPath = join(workDir, "stage.png");
  const optimizedPath = join(workDir, "optimized.heif");
  await runCheckedCommand("magick", [inputPath, pngPath]);
  await runCheckedCommand("heif-enc", [
    "--lossless",
    pngPath,
    "-o",
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[HEIF]" };
}

async function optimizeAvif(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const pngPath = join(workDir, "stage.png");
  const optimizedPath = join(workDir, "optimized.avif");
  await runCheckedCommand("magick", [inputPath, pngPath]);
  await runCheckedCommand("avifenc", [
    "--lossless",
    "--min",
    "0",
    "--max",
    "0",
    "--m",
    "8",
    pngPath,
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[AVIF]" };
}

async function optimizeBmp(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; label: string }> {
  const optimizedPath = join(workDir, "optimized.bmp");
  await runCheckedCommand("magick", [
    inputPath,
    "-compress",
    "zip",
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[BMP]" };
}

async function optimizeRaw(
  originalPath: string,
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<{ outputPath: string; targetPath?: string; label: string }> {
  if (!options.max) {
    await stripMetadata(inputPath);
    return { outputPath: inputPath, label: "[RAW]" };
  }

  const parsed = parse(originalPath);
  const optimizedPath = join(workDir, `${parsed.name}.dng`);
  await runCheckedCommand("dnglab", ["convert", inputPath, optimizedPath]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return {
    outputPath: optimizedPath,
    targetPath: join(dirname(originalPath), `${parsed.name}.dng`),
    label: "[RAW->DNG]",
  };
}

async function stripMetadata(filePath: string): Promise<void> {
  await runCheckedCommand("exiftool", [
    "-overwrite_original",
    "-all=",
    filePath,
  ]);
}

export async function applyReplacement(params: {
  sourcePath: string;
  originalPath: string;
  targetPath: string;
  keepTime: boolean;
  originalAtime: Date;
  originalMtime: Date;
}): Promise<void> {
  const {
    sourcePath,
    originalPath,
    targetPath,
    keepTime,
    originalAtime,
    originalMtime,
  } = params;

  if (targetPath !== originalPath) {
    if (await pathExists(targetPath)) {
      throw new Error(`target already exists: ${targetPath}`);
    }

    await move(sourcePath, targetPath, { overwrite: false });
    await unlink(originalPath);
    if (keepTime) {
      await utimes(targetPath, originalAtime, originalMtime);
    }
    return;
  }

  await move(sourcePath, originalPath, { overwrite: true });

  if (keepTime) {
    await utimes(originalPath, originalAtime, originalMtime);
  }
}

async function createWorkDirectory(
  filePath: string,
  inPlace: boolean
): Promise<string> {
  const baseDirectory = inPlace ? dirname(filePath) : tmpdir();
  await ensureDir(baseDirectory);
  return mkdtemp(join(baseDirectory, ".squeezit-"));
}

async function isAnimatedGif(filePath: string): Promise<boolean> {
  const result = await runCheckedCommand("gifsicle", ["--info", filePath]);
  return /\b([2-9]|\d{2,})\s+images?\b/i.test(result.all);
}

async function isAnimatedWebp(filePath: string): Promise<boolean> {
  const result = await runCheckedCommand("webpinfo", [filePath]);
  return result.all.includes("Animation:");
}

function skippedResult(
  filePath: string,
  label: string,
  message: string
): OptimizationResult {
  return {
    filePath,
    label,
    status: "skipped",
    originalSize: 0,
    optimizedSize: 0,
    savedBytes: 0,
    message,
  };
}

export function describeSkipReason(
  savedBytes: number,
  threshold: number
): string {
  if (savedBytes < 0) {
    return `grew by ${formatByteCount(Math.abs(savedBytes))}`;
  }

  if (savedBytes === 0) {
    return "no size change";
  }

  if (savedBytes < threshold) {
    return `saved ${formatByteCount(savedBytes)} below threshold ${formatByteCount(threshold)}`;
  }

  return "no gain";
}

function formatByteCount(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  const kilobytes = bytes / 1024;
  return `${kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)}KB`;
}

async function runWithConcurrency<T>(
  limit: number,
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  const concurrency = Math.max(1, limit);
  const iterator = items[Symbol.iterator]();

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length || 1) },
      async () => {
        while (true) {
          const next = iterator.next();
          if (next.done) {
            return;
          }

          await worker(next.value);
        }
      }
    )
  );
}
