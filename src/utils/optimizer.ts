import { readdir, readFile, stat, unlink, utimes } from "node:fs/promises";
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
import {
  runCheckedCommand,
  runCommand,
  writeCommandStdoutToFile,
} from "./exec";

const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

const EXTENSION_FORMAT_HINTS: Partial<Record<string, SupportedFormat>> = {
  ".apng": "apng",
  ".bmp": "bmp",
  ".gif": "gif",
  ".heic": "heif",
  ".heif": "heif",
  ".ico": "ico",
  ".jxl": "jxl",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".svg": "svg",
  ".tif": "tiff",
  ".tiff": "tiff",
  ".webp": "webp",
  ".avif": "avif",
};

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
  "image/jxl": "jxl",
  "image/vnd.microsoft.icon": "ico",
  "image/x-icon": "ico",
};

interface PipelineResult {
  outputPath: string;
  targetPath?: string;
  label: string;
}

interface CandidateResult {
  outputPath: string;
}

interface IcoEntry {
  index: number;
  width: number;
  height: number;
  bitDepth?: number;
}

class SkippableOptimizationError extends Error {}

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
    if (options.exifOnly) {
      const originalStats = await stat(input.absolutePath);
      const workDir = await createWorkDirectory(
        input.absolutePath,
        options.inPlace
      );
      const workingInputPath = join(workDir, basename(input.absolutePath));
      await copy(input.absolutePath, workingInputPath, { overwrite: true });

      try {
        return await stripExifOnly(
          input.absolutePath,
          workingInputPath,
          originalStats,
          options
        );
      } finally {
        await remove(workDir);
      }
    }

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
    if (error instanceof SkippableOptimizationError) {
      return skippedResult(input.absolutePath, "[SKIP]", error.message);
    }

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
  let format =
    MIME_TO_FORMAT[mimeType] ?? EXTENSION_FORMAT_HINTS[rawExtension] ?? null;

  if (!format) {
    return null;
  }

  let animated = false;

  if (format === "png" || format === "apng") {
    animated = await isAnimatedPng(filePath);
    format = rawExtension === ".apng" || animated ? "apng" : "png";
  } else if (format === "gif") {
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
}): Promise<PipelineResult> {
  const { detected, originalPath, workingInputPath, workDir, options } = params;

  switch (detected.format) {
    case "png":
      return optimizePng(workingInputPath, workDir, options);
    case "apng":
      return optimizeApng(workingInputPath, workDir, options);
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
    case "jxl":
      return optimizeJxl(workingInputPath, workDir, options);
    case "ico":
      return optimizeIco(workingInputPath, workDir, options);
    case "raw":
      return optimizeRaw(originalPath, workingInputPath, workDir, options);
  }
}

async function optimizePng(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
  return optimizePngLike(inputPath, workDir, options, false, "[PNG]");
}

async function optimizeApng(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
  return optimizePngLike(inputPath, workDir, options, true, "[APNG]");
}

async function optimizePngLike(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions,
  animated: boolean,
  label: string
): Promise<PipelineResult> {
  const candidates: CandidateResult[] = [
    await optimizeWithOxipng(
      inputPath,
      join(workDir, animated ? "optimized.apng" : "optimized-oxipng.png"),
      {
        effort: options.max ? "max" : "4",
        stripMetadata: options.stripMeta,
      }
    ),
  ];

  if (options.max && !animated) {
    candidates.push(await optimizePngLegacy(inputPath, workDir, options));
  }

  const best =
    candidates.length === 1
      ? candidates[0]!
      : await selectSmallestCandidate(candidates);
  return {
    outputPath: best.outputPath,
    label,
  };
}

async function optimizePngLegacy(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<CandidateResult> {
  const crushedPath = join(workDir, "stage-1.png");
  const optipngOutput = join(
    workDir,
    options.max ? "stage-2.png" : "optimized-legacy.png"
  );
  const optimizedPath = join(workDir, "optimized-legacy-max.png");

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
    return { outputPath: optipngOutput };
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
  return { outputPath: optimizedPath };
}

async function optimizeWithOxipng(
  inputPath: string,
  outputPath: string,
  options: {
    effort: string;
    stripMetadata: boolean;
  }
): Promise<CandidateResult> {
  const args = ["-o", options.effort];

  if (options.stripMetadata) {
    args.push("--strip", "all");
  }

  args.push("--out", outputPath, inputPath);
  await runCheckedCommand("oxipng", args);
  return { outputPath };
}

async function optimizeJpeg(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
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
  const jpegrescanArgs = [jpegtranOutput, optimizedPath];
  if (options.max) {
    jpegrescanArgs.unshift("-i");
  }
  await runCheckedCommand("jpegrescan", jpegrescanArgs);

  if (options.max) {
    const jpegoptimArgs = ["--retry", "--all-progressive"];
    if (options.stripMeta) {
      jpegoptimArgs.push("--strip-all");
    }
    jpegoptimArgs.push(optimizedPath);
    await runCheckedCommand("jpegoptim", jpegoptimArgs);
  } else if (options.stripMeta) {
    await runCheckedCommand("jpegoptim", ["--strip-all", optimizedPath]);
  }
  return { outputPath: optimizedPath, label: "[JPEG]" };
}

async function optimizeGif(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions,
  animated: boolean
): Promise<PipelineResult> {
  const optimizedPath = join(workDir, "optimized.gif");
  const args = [options.max ? "-O3" : "-O2"];
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
): Promise<PipelineResult> {
  const optimizedPath = join(workDir, "optimized.svg");
  const args = [inputPath, "-o", optimizedPath];
  if (options.max) {
    args.unshift("--multipass");
  }
  await runCheckedCommand("svgo", args);
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
): Promise<PipelineResult> {
  const optimizedPath = join(workDir, "optimized.webp");

  if (animated) {
    const tempGif = join(workDir, "stage.gif");
    await runCheckedCommand("magick", [inputPath, tempGif]);
    const gif2webpArgs = ["-lossless", "-m", options.max ? "6" : "4"];
    if (options.max) {
      gif2webpArgs.push("-min_size");
    }
    gif2webpArgs.push(tempGif, "-o", optimizedPath);
    await runCheckedCommand("gif2webp", gif2webpArgs);
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
    options.max ? "9" : "6",
    "-m",
    options.max ? "6" : "4",
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
): Promise<PipelineResult> {
  const optimizedPath = join(workDir, "optimized.tiff");
  await runCheckedCommand("tiffcp", [
    "-c",
    options.max ? "zip:2:p9" : "zip:2:p6",
    inputPath,
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[TIFF]" };
}

async function optimizeHeif(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
  const pngPath = join(workDir, "stage.png");
  const optimizedPath = join(workDir, "optimized.heif");
  await runCheckedCommand("magick", [inputPath, pngPath]);
  await runCheckedCommand("heif-enc", [
    "-L",
    "-p",
    `preset=${options.max ? "veryslow" : "medium"}`,
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
): Promise<PipelineResult> {
  const pngPath = join(workDir, "stage.png");
  const optimizedPath = join(workDir, "optimized.avif");
  await runCheckedCommand("magick", [inputPath, pngPath]);
  await runCheckedCommand("avifenc", [
    "--lossless",
    "-s",
    options.max ? "0" : "6",
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
): Promise<PipelineResult> {
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

async function optimizeJxl(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
  const optimizedPath = join(workDir, "optimized.jxl");
  await runCheckedCommand("cjxl", [
    "--distance=0",
    `--effort=${options.max ? "10" : "7"}`,
    inputPath,
    optimizedPath,
  ]);
  if (options.stripMeta) {
    await stripMetadata(optimizedPath);
  }
  return { outputPath: optimizedPath, label: "[JXL]" };
}

async function optimizeIco(
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
  try {
    const entries = await listIcoEntries(inputPath);

    if (entries.length === 0) {
      throw new SkippableOptimizationError("unsupported or malformed ICO");
    }

    const rebuiltEntries: string[] = [];

    for (const entry of entries) {
      const extractDirectory = join(workDir, `ico-entry-${entry.index}`);
      const extractedPath = await extractIcoEntry(
        inputPath,
        entry.index,
        extractDirectory
      );
      await stripMetadata(extractedPath);

      const optimizedPath = await optimizeEmbeddedIcoFrame(
        extractedPath,
        join(workDir, `ico-frame-${entry.index}`),
        options
      );

      rebuiltEntries.push(optimizedPath);
    }

    const optimizedPath = join(workDir, "optimized.ico");
    await runCheckedCommand("icotool", [
      "-c",
      "-o",
      optimizedPath,
      ...rebuiltEntries.map((filePath) => `--raw=${filePath}`),
    ]);

    return { outputPath: optimizedPath, label: "[ICO]" };
  } catch (error) {
    if (error instanceof SkippableOptimizationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const icoMessage = toSkippableIcoMessage(message);
    if (icoMessage) {
      throw new SkippableOptimizationError(icoMessage);
    }

    throw error;
  }
}

async function optimizeEmbeddedIcoFrame(
  inputPath: string,
  candidateRoot: string,
  options: CompressCommandOptions
): Promise<string> {
  await ensureDir(candidateRoot);

  const baseline = inputPath;
  const candidates: CandidateResult[] = [{ outputPath: baseline }];

  candidates.push(
    await optimizeWithOxipng(
      inputPath,
      join(candidateRoot, "optimized-oxipng.png"),
      {
        effort: options.max ? "max" : "4",
        stripMetadata: true,
      }
    )
  );

  if (options.max) {
    candidates.push(
      await optimizePngLegacy(inputPath, candidateRoot, {
        ...options,
        stripMeta: true,
        max: true,
      })
    );
  }

  const best = await selectSmallestCandidate(candidates);
  return best.outputPath;
}

async function optimizeRaw(
  originalPath: string,
  inputPath: string,
  workDir: string,
  options: CompressCommandOptions
): Promise<PipelineResult> {
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

async function stripExifOnly(
  originalPath: string,
  workingInputPath: string,
  originalStats: Awaited<ReturnType<typeof stat>>,
  options: CompressCommandOptions
): Promise<OptimizationResult> {
  await stripMetadata(workingInputPath);

  const optimizedStats = await stat(workingInputPath);
  const changed = !(await filesAreIdentical(originalPath, workingInputPath));
  const originalSize = Number(originalStats.size);
  const optimizedSize = Number(optimizedStats.size);
  const savedBytes = originalSize - optimizedSize;

  if (!changed) {
    return {
      filePath: originalPath,
      label: "[EXIF]",
      status: "skipped",
      originalSize,
      optimizedSize,
      savedBytes: Math.max(savedBytes, 0),
      message: "no removable metadata",
    };
  }

  if (savedBytes < 0) {
    return {
      filePath: originalPath,
      label: "[EXIF]",
      status: "skipped",
      originalSize,
      optimizedSize,
      savedBytes: 0,
      message: describeSkipReason(savedBytes, 0),
    };
  }

  if (options.dryRun) {
    return {
      filePath: originalPath,
      label: "[EXIF]",
      status: "dry-run",
      originalSize,
      optimizedSize,
      savedBytes: Math.max(savedBytes, 0),
    };
  }

  await applyReplacement({
    sourcePath: workingInputPath,
    originalPath,
    targetPath: originalPath,
    keepTime: options.keepTime,
    originalAtime: originalStats.atime,
    originalMtime: originalStats.mtime,
  });

  return {
    filePath: originalPath,
    label: "[EXIF]",
    status: "optimized",
    originalSize,
    optimizedSize,
    savedBytes: Math.max(savedBytes, 0),
  };
}

async function stripMetadata(filePath: string): Promise<void> {
  await runCheckedCommand("exiftool", [
    "-overwrite_original",
    "-all=",
    filePath,
  ]);
}

async function selectSmallestCandidate(
  candidates: CandidateResult[]
): Promise<CandidateResult> {
  const [first, ...rest] = candidates;

  if (!first) {
    throw new Error("No optimization candidates were produced");
  }

  let selected = first;
  let smallest = (await stat(selected.outputPath)).size;

  for (const candidate of rest) {
    const size = (await stat(candidate.outputPath)).size;
    if (size < smallest) {
      selected = candidate;
      smallest = size;
    }
  }

  return selected;
}

async function listIcoEntries(filePath: string): Promise<IcoEntry[]> {
  const result = await runCheckedCommand("icotool", ["-l", filePath]);
  return parseIcoEntries(result.stdout);
}

async function extractIcoEntry(
  filePath: string,
  index: number,
  outputDirectory: string
): Promise<string> {
  await ensureDir(outputDirectory);

  const result = await runCommand("icotool", [
    "-x",
    `--index=${index}`,
    "-o",
    outputDirectory,
    filePath,
  ]);

  const extractedPath = await findExtractedIcoImage(outputDirectory);
  if (result.exitCode === 0) {
    return extractedPath;
  }

  if (shouldAcceptIcoExtraction(result.all)) {
    return extractedPath;
  }

  throw new Error(result.all.trim() || `Failed to extract ICO entry ${index}`);
}

async function findExtractedIcoImage(directory: string): Promise<string> {
  const entries = (await readdir(directory)).sort();
  const match = entries.find((entry) => entry.toLowerCase().endsWith(".png"));

  if (!match) {
    throw new Error(`No PNG image extracted from ICO entry in ${directory}`);
  }

  return join(directory, match);
}

export function parseIcoEntries(output: string): IcoEntry[] {
  const entries: IcoEntry[] = [];

  for (const line of output.split(/\r?\n/).map((value) => value.trim())) {
    if (!line) {
      continue;
    }

    const index = extractNumber(line, "index");
    const width = extractNumber(line, "width");
    const height = extractNumber(line, "height");
    const bitDepth = extractOptionalNumber(line, "bit-depth");

    if (index === null || width === null || height === null) {
      continue;
    }

    entries.push({
      index,
      width,
      height,
      bitDepth: bitDepth ?? undefined,
    });
  }

  return entries;
}

function extractNumber(line: string, key: string): number | null {
  const value = extractOptionalNumber(line, key);
  return value === null ? null : value;
}

function extractOptionalNumber(line: string, key: string): number | null {
  const match = line.match(new RegExp(`--${key}=(\\d+)`));
  const value = match?.[1];

  if (!value) {
    return null;
  }

  return Number.parseInt(value, 10);
}

async function filesAreIdentical(
  leftPath: string,
  rightPath: string
): Promise<boolean> {
  const [left, right] = await Promise.all([
    readFile(leftPath),
    readFile(rightPath),
  ]);

  return left.equals(right);
}

function toSkippableIcoMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  const malformedMarkers = [
    "clr_important field in bitmap should be zero",
    "incorrect total size of bitmap",
    "bytes of garbage",
    "no png image extracted from ico entry",
  ];

  if (malformedMarkers.some((marker) => normalized.includes(marker))) {
    return "unsupported or malformed ICO";
  }

  return null;
}

export function shouldAcceptIcoExtraction(message: string): boolean {
  const normalized = message.toLowerCase();

  if (normalized.includes("no png image extracted from ico entry")) {
    return false;
  }

  return [
    "clr_important field in bitmap should be zero",
    "incorrect total size of bitmap",
    "bytes of garbage",
  ].some((marker) => normalized.includes(marker));
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

async function isAnimatedPng(filePath: string): Promise<boolean> {
  const buffer = await readFile(filePath);
  return hasApngAnimation(buffer);
}

export function hasApngAnimation(buffer: Uint8Array): boolean {
  if (buffer.length < 8) {
    return false;
  }

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (!Buffer.from(buffer.subarray(0, 8)).equals(signature)) {
    return false;
  }

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = Buffer.from(buffer).readUInt32BE(offset);
    const type = Buffer.from(buffer.subarray(offset + 4, offset + 8)).toString(
      "ascii"
    );

    if (type === "acTL") {
      return true;
    }

    if (type === "IEND") {
      return false;
    }

    offset += length + 12;
  }

  return false;
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
