import { basename, resolve } from "node:path";

import {
  getOptimizationFixtureValues,
  getOptimizationFixtureValuesForFiles,
} from "../src/api";
import type { ApiOptimizationMode } from "../src/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = extractMode(args);
  const outputDir = extractFlagValue(args, "--output-dir");
  const cwd = extractFlagValue(args, "--cwd");
  const files = args.filter((value) => !value.startsWith("-"));

  if (files.length === 0) {
    throw new Error("Pass at least one fixture path.");
  }

  if (files.length === 1) {
    const report = await getOptimizationFixtureValues(files[0]!, {
      mode,
      outputDir: outputDir ? resolve(outputDir) : undefined,
      cwd: cwd ? resolve(cwd) : process.cwd(),
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const report = await getOptimizationFixtureValuesForFiles(files, {
    mode,
    outputDir: outputDir ? resolve(outputDir) : undefined,
    cwd: cwd ? resolve(cwd) : process.cwd(),
  });

  console.log(JSON.stringify(report, null, 2));
}

function extractMode(args: string[]): ApiOptimizationMode {
  const flagValue = extractFlagValue(args, "--mode");
  if (flagValue === "default" || flagValue === "exif" || flagValue === "max") {
    return flagValue;
  }

  return "default";
}

function extractFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  args.splice(index, 2);
  return value;
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
  console.error(
    `fixture-values failed for ${basename(process.cwd())}: ${message}`
  );
  process.exitCode = 1;
});
