import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname } from "node:path";

import type {
  CoreOptimizationOptions,
  DependencySpec,
  ResolvedInput,
} from "../types";
import { commandExists, runCheckedCommand } from "../utils/exec";

export type DependencyName =
  | "file"
  | "jpegtran"
  | "jpegrescan"
  | "jpegoptim"
  | "pngcrush"
  | "optipng"
  | "zopflipng"
  | "oxipng"
  | "gifsicle"
  | "svgo"
  | "cwebp"
  | "dwebp"
  | "webpinfo"
  | "gif2webp"
  | "heif-enc"
  | "avifenc"
  | "tiffcp"
  | "magick"
  | "exiftool"
  | "dnglab"
  | "cjxl"
  | "icotool";

export type SupportedPlatform = "macos" | "debian";

export const DEPENDENCY_CATALOG: Record<DependencyName, DependencySpec> = {
  file: {
    binary: "file",
    required: true,
    brewPackage: "file-formula",
    aptPackage: "file",
  },
  jpegtran: {
    binary: "jpegtran",
    required: true,
    brewPackage: "mozjpeg",
    aptPackage: "libjpeg-turbo-progs",
  },
  jpegrescan: {
    binary: "jpegrescan",
    required: true,
    brewPackage: "jpegrescan",
    aptPackage: "jpegrescan",
  },
  jpegoptim: {
    binary: "jpegoptim",
    required: true,
    brewPackage: "jpegoptim",
    aptPackage: "jpegoptim",
  },
  pngcrush: {
    binary: "pngcrush",
    required: true,
    brewPackage: "pngcrush",
    aptPackage: "pngcrush",
  },
  optipng: {
    binary: "optipng",
    required: true,
    brewPackage: "optipng",
    aptPackage: "optipng",
  },
  zopflipng: {
    binary: "zopflipng",
    required: true,
    brewPackage: "zopfli",
    aptPackage: "zopfli",
  },
  oxipng: {
    binary: "oxipng",
    required: true,
    brewPackage: "oxipng",
    aptPackage: "oxipng",
  },
  gifsicle: {
    binary: "gifsicle",
    required: true,
    brewPackage: "gifsicle",
    aptPackage: "gifsicle",
  },
  svgo: {
    binary: "svgo",
    required: true,
    brewPackage: "svgo",
    aptPackage: "node-svgo",
  },
  cwebp: {
    binary: "cwebp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  dwebp: {
    binary: "dwebp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  webpinfo: {
    binary: "webpinfo",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  gif2webp: {
    binary: "gif2webp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  "heif-enc": {
    binary: "heif-enc",
    required: true,
    brewPackage: "libheif",
    aptPackage: "libheif-examples",
  },
  avifenc: {
    binary: "avifenc",
    required: true,
    brewPackage: "libavif",
    aptPackage: "libavif-bin",
  },
  tiffcp: {
    binary: "tiffcp",
    required: true,
    brewPackage: "libtiff",
    aptPackage: "libtiff-tools",
  },
  magick: {
    binary: "magick",
    required: true,
    brewPackage: "imagemagick",
    aptPackage: "imagemagick",
  },
  exiftool: {
    binary: "exiftool",
    required: true,
    brewPackage: "exiftool",
    aptPackage: "libimage-exiftool-perl",
  },
  dnglab: {
    binary: "dnglab",
    required: true,
    brewPackage: "dnglab",
    aptPackage: "dnglab",
  },
  cjxl: {
    binary: "cjxl",
    required: true,
    brewPackage: "jpeg-xl",
    aptPackage: "libjxl-tools",
  },
  icotool: {
    binary: "icotool",
    required: true,
    brewPackage: "icoutils",
    aptPackage: "icoutils",
  },
};

const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

const FORMAT_DEPENDENCIES: Record<string, DependencyName[]> = {
  jpeg: ["jpegtran", "jpegrescan", "jpegoptim"],
  png: ["pngcrush", "optipng", "oxipng"],
  apng: ["oxipng"],
  gif: ["gifsicle"],
  webp: ["cwebp", "dwebp", "webpinfo", "gif2webp", "magick"],
  svg: ["svgo"],
  tiff: ["tiffcp"],
  heif: ["magick", "heif-enc"],
  avif: ["magick", "avifenc"],
  bmp: ["magick"],
  jxl: ["cjxl"],
  ico: ["icotool", "oxipng", "exiftool"],
  raw: [],
};

const STRIP_METADATA_FORMATS = new Set([
  "png",
  "apng",
  "gif",
  "webp",
  "tiff",
  "heif",
  "avif",
  "jxl",
  "raw",
]);

export function collectRequiredDependencies(
  inputs: ResolvedInput[],
  options: CoreOptimizationOptions,
  installAllWhenEmpty = false
): DependencySpec[] {
  if (inputs.length === 0) {
    return installAllWhenEmpty
      ? Object.values(DEPENDENCY_CATALOG)
      : [DEPENDENCY_CATALOG.file];
  }

  if (options.exifOnly) {
    const required = new Set<DependencyName>(["file"]);

    for (const input of inputs) {
      const format = formatFamilyFromExtension(input.absolutePath);
      if (!format) {
        continue;
      }

      if (format === "svg") {
        required.add("svgo");
        continue;
      }

      if (format === "ico") {
        continue;
      }

      if (format === "bmp") {
        continue;
      }

      required.add("exiftool");
    }

    return Array.from(required).map((name) => DEPENDENCY_CATALOG[name]);
  }

  const required = new Set<DependencyName>(["file"]);

  for (const input of inputs) {
    const format = formatFamilyFromExtension(input.absolutePath);
    if (!format) {
      continue;
    }

    for (const dependency of FORMAT_DEPENDENCIES[format] ?? []) {
      required.add(dependency);
    }

    if (format === "png" && options.max) {
      required.add("zopflipng");
    }

    if (format === "raw" && options.max) {
      required.add("dnglab");
    }

    if (options.stripMeta && STRIP_METADATA_FORMATS.has(format)) {
      required.add("exiftool");
    }
  }

  return Array.from(required).map((name) => DEPENDENCY_CATALOG[name]);
}

export async function detectPlatform(): Promise<SupportedPlatform | null> {
  if (process.platform === "darwin") {
    return "macos";
  }

  if (process.platform !== "linux") {
    return null;
  }

  try {
    await access("/etc/debian_version", constants.F_OK);
    return "debian";
  } catch {
    try {
      const osRelease = (
        await readFile("/etc/os-release", "utf8")
      ).toLowerCase();
      if (osRelease.includes("id=ubuntu") || osRelease.includes("id=debian")) {
        return "debian";
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function findMissingDependencies(
  dependencies: DependencySpec[]
): Promise<DependencySpec[]> {
  const missing: DependencySpec[] = [];

  for (const dependency of dependencies) {
    if (!(await commandExists(dependency.binary))) {
      missing.push(dependency);
    }
  }

  return missing;
}

export async function installDependencies(
  platform: SupportedPlatform,
  packages: string[]
): Promise<void> {
  if (platform === "macos") {
    await runCheckedCommand("brew", ["install", ...packages], {
      stdio: "inherit",
    });
    return;
  }

  await runCheckedCommand("sudo", ["apt", "update"], { stdio: "inherit" });
  await runCheckedCommand("sudo", ["apt", "install", "-y", ...packages], {
    stdio: "inherit",
  });
}

export function uniquePackages(
  dependencies: DependencySpec[],
  platform: SupportedPlatform
): string[] {
  return Array.from(
    new Set(
      dependencies
        .map((dependency) =>
          platform === "macos" ? dependency.brewPackage : dependency.aptPackage
        )
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function buildMissingDependencyMessage(
  missing: DependencySpec[],
  platform: SupportedPlatform | null
): string {
  const binaries = missing.map((dependency) => dependency.binary).join(", ");

  if (!platform) {
    return `Missing required tools: ${binaries}`;
  }

  const packages = uniquePackages(missing, platform).join(", ");
  return [
    `Missing required tools: ${binaries}`,
    `Install these packages manually: ${packages}`,
  ].join("\n");
}

function formatFamilyFromExtension(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "jpeg";
    case ".png":
      return "png";
    case ".apng":
      return "apng";
    case ".gif":
      return "gif";
    case ".webp":
      return "webp";
    case ".svg":
      return "svg";
    case ".tif":
    case ".tiff":
      return "tiff";
    case ".heic":
    case ".heif":
      return "heif";
    case ".avif":
      return "avif";
    case ".bmp":
      return "bmp";
    case ".jxl":
      return "jxl";
    case ".ico":
      return "ico";
    default:
      return RAW_EXTENSIONS.has(extension) ? "raw" : null;
  }
}
