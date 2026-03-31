import { lstat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

import fsExtra from "fs-extra";
import { glob } from "glob";

import type { CoreInputResolutionOptions, ResolvedInput } from "../types";

const { pathExists } = fsExtra;

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".apng",
  ".gif",
  ".webp",
  ".svg",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
  ".bmp",
  ".jxl",
  ".ico",
  ".cur",
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

export async function resolveInputs(
  options: CoreInputResolutionOptions
): Promise<ResolvedInput[]> {
  if (options.patterns.length === 0) {
    return resolveDefaultInputs(options.cwd, options.recursive);
  }

  const resolved = new Map<string, ResolvedInput>();

  for (const rawPattern of options.patterns) {
    const absoluteInput = resolve(options.cwd, rawPattern);

    if (await pathExists(absoluteInput)) {
      const stats = await lstat(absoluteInput);
      if (stats.isDirectory()) {
        const children = await resolveDirectory(
          absoluteInput,
          options.cwd,
          options.recursive
        );
        for (const child of children) {
          resolved.set(child.absolutePath, child);
        }
      } else if (stats.isFile() && isSupportedImagePath(absoluteInput)) {
        resolved.set(
          absoluteInput,
          toResolvedInput(absoluteInput, options.cwd)
        );
      }
      continue;
    }

    const matches = await resolvePattern(rawPattern, options.cwd);
    for (const match of matches) {
      resolved.set(match.absolutePath, match);
    }
  }

  return sortInputs(Array.from(resolved.values()));
}

export async function resolvePattern(
  pattern: string,
  cwd: string
): Promise<ResolvedInput[]> {
  const matches = await glob(pattern, {
    cwd,
    absolute: true,
    nodir: true,
    nocase: true,
    dot: false,
  });

  return sortInputs(
    matches
      .filter((filePath) => isSupportedImagePath(filePath))
      .map((filePath) => toResolvedInput(filePath, cwd))
  );
}

async function resolveDefaultInputs(
  cwd: string,
  recursive: boolean
): Promise<ResolvedInput[]> {
  const pattern = recursive ? "**/*" : "*";
  const matches = await glob(pattern, {
    cwd,
    absolute: true,
    nodir: true,
    nocase: true,
    dot: false,
  });

  return sortInputs(
    matches
      .filter((filePath) => isSupportedImagePath(filePath))
      .map((filePath) => toResolvedInput(filePath, cwd))
  );
}

async function resolveDirectory(
  directory: string,
  displayRoot: string,
  recursive: boolean
): Promise<ResolvedInput[]> {
  const pattern = recursive ? "**/*" : "*";
  const matches = await glob(pattern, {
    cwd: directory,
    absolute: true,
    nodir: true,
    nocase: true,
    dot: false,
  });

  return sortInputs(
    matches
      .filter((filePath) => isSupportedImagePath(filePath))
      .map((filePath) => ({
        absolutePath: filePath,
        displayPath: relative(displayRoot, filePath) || basename(filePath),
      }))
  );
}

function isSupportedImagePath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function sortInputs(inputs: ResolvedInput[]): ResolvedInput[] {
  const unique = inputs.reduce(
    (map, input) => map.set(input.absolutePath, input),
    new Map<string, ResolvedInput>()
  );

  return Array.from(unique.values()).sort((left, right) =>
    left.displayPath.localeCompare(right.displayPath)
  );
}

function toResolvedInput(filePath: string, cwd: string): ResolvedInput {
  return {
    absolutePath: filePath,
    displayPath: relative(cwd, filePath) || basename(filePath),
  };
}
