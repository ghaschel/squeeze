import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";

import chalk from "chalk";
import ora from "ora";

import type {
  CompressCommandOptions,
  DependencySpec,
  ResolvedInput,
} from "../types";
import { commandExists, runCheckedCommand } from "./exec";
import { confirmDependencyInstall } from "./prompts";

const BASE_DEPENDENCIES: DependencySpec[] = [
  {
    binary: "file",
    required: true,
    brewPackage: "file-formula",
    aptPackage: "file",
  },
  {
    binary: "jpegtran",
    required: true,
    brewPackage: "mozjpeg",
    aptPackage: "libjpeg-turbo-progs",
  },
  {
    binary: "jpegrescan",
    required: true,
    brewPackage: "jpegrescan",
    aptPackage: "jpegrescan",
  },
  {
    binary: "jpegoptim",
    required: true,
    brewPackage: "jpegoptim",
    aptPackage: "jpegoptim",
  },
  {
    binary: "pngcrush",
    required: true,
    brewPackage: "pngcrush",
    aptPackage: "pngcrush",
  },
  {
    binary: "optipng",
    required: true,
    brewPackage: "optipng",
    aptPackage: "optipng",
  },
  {
    binary: "zopflipng",
    required: true,
    brewPackage: "zopfli",
    aptPackage: "zopfli",
  },
  {
    binary: "gifsicle",
    required: true,
    brewPackage: "gifsicle",
    aptPackage: "gifsicle",
  },
  {
    binary: "svgo",
    required: true,
    brewPackage: "svgo",
    aptPackage: "node-svgo",
  },
  { binary: "cwebp", required: true, brewPackage: "webp", aptPackage: "webp" },
  { binary: "dwebp", required: true, brewPackage: "webp", aptPackage: "webp" },
  {
    binary: "webpinfo",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  {
    binary: "gif2webp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
  },
  {
    binary: "heif-enc",
    required: true,
    brewPackage: "libheif",
    aptPackage: "libheif-examples",
  },
  {
    binary: "avifenc",
    required: true,
    brewPackage: "libavif",
    aptPackage: "libavif-bin",
  },
  {
    binary: "tiffcp",
    required: true,
    brewPackage: "libtiff",
    aptPackage: "libtiff-tools",
  },
  {
    binary: "magick",
    required: true,
    brewPackage: "imagemagick",
    aptPackage: "imagemagick",
  },
  {
    binary: "exiftool",
    required: true,
    brewPackage: "exiftool",
    aptPackage: "libimage-exiftool-perl",
  },
];

const DNGLAB_DEPENDENCY: DependencySpec = {
  binary: "dnglab",
  required: true,
  brewPackage: "dnglab",
  aptPackage: "dnglab",
};

const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

export async function ensureDependencies(
  options: CompressCommandOptions,
  requireDngLab: boolean
): Promise<void> {
  const spinner = ora("Checking required system tools").start();
  const platform = await detectPlatform();

  if (!platform) {
    spinner.fail("Unsupported OS");
    throw new Error("squeezit supports macOS and Debian/Ubuntu Linux only.");
  }

  const dependencies = requireDngLab
    ? [...BASE_DEPENDENCIES, DNGLAB_DEPENDENCY]
    : BASE_DEPENDENCIES.slice();
  let missing = await findMissingDependencies(dependencies);

  if (missing.length === 0) {
    spinner.succeed("System tools are available");
    return;
  }

  if (!options.installDeps) {
    spinner.fail("Missing required system tools");
    throw new Error(buildMissingDependencyMessage(missing, platform));
  }

  const packages = uniquePackages(missing, platform);
  spinner.stop();

  const confirmed = await confirmDependencyInstall(platform, packages);
  if (!confirmed) {
    throw new Error("Dependency installation cancelled.");
  }

  spinner.start(
    `Installing ${packages.length} package${packages.length === 1 ? "" : "s"}`
  );
  spinner.stop();
  await installDependencies(platform, packages);
  spinner.start("Re-checking required system tools");

  missing = await findMissingDependencies(dependencies);
  if (missing.length > 0) {
    spinner.fail("Dependencies are still missing after installation");
    throw new Error(buildMissingDependencyMessage(missing, platform));
  }

  spinner.succeed("System tools are available");
}

export function requiresDngLab(
  inputs: ResolvedInput[],
  maxMode: boolean
): boolean {
  if (!maxMode) {
    return false;
  }

  return inputs.some((input) => {
    const extension = input.absolutePath
      .slice(input.absolutePath.lastIndexOf("."))
      .toLowerCase();
    return RAW_EXTENSIONS.has(extension);
  });
}

async function detectPlatform(): Promise<"macos" | "debian" | null> {
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

async function findMissingDependencies(
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

async function installDependencies(
  platform: "macos" | "debian",
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

function uniquePackages(
  dependencies: DependencySpec[],
  platform: "macos" | "debian"
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

function buildMissingDependencyMessage(
  missing: DependencySpec[],
  platform: "macos" | "debian"
): string {
  const binaries = missing.map((dependency) => dependency.binary).join(", ");
  const packages = uniquePackages(missing, platform).join(", ");

  return [
    `Missing required tools: ${binaries}`,
    `Install with ${chalk.cyan("--install-deps")} or install these packages manually: ${packages}`,
  ].join("\n");
}
