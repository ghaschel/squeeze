import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import type { CompressCliFlags, CompressCommandOptions } from "../types";
import {
  ensureDependencies,
  logOptimizationResult,
  optimizeImages,
  printSummary,
  resolveCompressOptions,
  resolveInputs,
} from "../utils";
import { handleUpdateFlags } from "./update";

export function registerCompressCommand(program: Command): Command {
  program
    .usage("[patterns...] [options]")
    .argument(
      "[patterns...]",
      "Files, directories, or unexpanded shell/glob patterns. If omitted, scans supported image extensions in the current directory."
    )
    .option("-r, --recursive", "Recurse into directories")
    .option(
      "-m, --max",
      "Enable the heaviest lossless compression passes and strip metadata"
    )
    .option("-s, --strip-meta", "Remove EXIF/IPTC/XMP metadata")
    .option("--exif", "Only strip EXIF/IPTC/XMP metadata without recompressing")
    .option("-d, --dry-run", "Report potential savings without modifying files")
    .option("-k, --keep-time", "Preserve original atime/mtime")
    .option(
      "-c, --concurrency <n>",
      "Worker count (default: CPU count, or 2 with --max)",
      parsePositiveInteger
    )
    .option("-I, --install-deps", "Attempt to install missing system tools")
    .option("-U, --update", "Update squeezit to the latest published version")
    .option("--check-update", "Check whether a newer published version exists")
    .option("--pm <manager>", "Package manager to use for self-update")
    .option("-v, --verbose", "Print extra details")
    .option(
      "-t, --threshold <bytes>",
      "Minimum bytes saved before replacement",
      parseNonNegativeInteger,
      100
    )
    .option(
      "-i, --in-place",
      "Create temporary work artifacts next to source files"
    )
    .action(async (patterns: string[], flags: CompressCliFlags) => {
      if (await handleUpdateFlags(flags)) {
        return;
      }

      const options = resolveCompressOptions(patterns, flags, process.cwd());
      await runCompressCommand(options);
    });

  return program;
}

async function runCompressCommand(
  options: CompressCommandOptions
): Promise<void> {
  try {
    const discoverySpinner = ora("Resolving image inputs").start();
    const inputs = await resolveInputs(options);

    if (inputs.length === 0) {
      if (options.installDeps) {
        discoverySpinner.warn(
          "No matching image files found. Installing the full supported toolchain because --install-deps was requested."
        );
        await ensureDependencies(options, []);
        return;
      }

      discoverySpinner.warn("No matching image files found.");
      return;
    }

    discoverySpinner.succeed(
      `Found ${chalk.bold(inputs.length.toString())} candidate files`
    );

    await ensureDependencies(options, inputs);

    console.log("");
    console.log(
      chalk.dim(
        `${options.dryRun ? "Dry run" : "Processing"} ${inputs.length} file${inputs.length === 1 ? "" : "s"} with concurrency ${options.concurrency}`
      )
    );
    console.log("");

    const summary = await optimizeImages(inputs, options, (result) => {
      logOptimizationResult(result);
    });

    printSummary(summary, { dryRun: options.dryRun });
    process.exitCode = summary.failed > 0 ? 1 : 0;
  } catch (error) {
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exitCode = 1;
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Value must be a positive integer");
  }

  return parsed;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Value must be a non-negative integer");
  }

  return parsed;
}
