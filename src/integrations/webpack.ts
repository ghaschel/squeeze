import { cpus } from "node:os";
import { resolve } from "node:path";

import type { Compiler, WebpackPluginInstance } from "webpack";

import {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  optimizeImages,
  resolveInputs,
} from "../core";
import type {
  CoreOptimizationOptions,
  OptimizationResult,
  OptimizeFilesOptions,
  ResolvedInput,
  Summary,
} from "../types";

export interface SqueezitWebpackPluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

export interface WebpackOptimizationRun {
  results: OptimizationResult[];
  summary: Summary;
}

export function createWebpackOptimizationOptions(
  cwd: string,
  checkDependencies = true
): OptimizeFilesOptions {
  return {
    cwd,
    recursive: true,
    mode: "default",
    stripMetadata: true,
    checkDependencies,
  };
}

export function createWebpackCoreOptions(): CoreOptimizationOptions {
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

export async function optimizeWebpackOutputDirectory(
  outDir: string,
  options: SqueezitWebpackPluginOptions = {}
): Promise<WebpackOptimizationRun> {
  const inputs = await resolveInputs({
    patterns: [],
    recursive: true,
    cwd: outDir,
  });

  if (inputs.length === 0) {
    return {
      results: [],
      summary: {
        processed: 0,
        optimized: 0,
        dryRunEligible: 0,
        failed: 0,
        skipped: 0,
        savedBytes: 0,
        startedAt: Date.now(),
      },
    };
  }

  if (options.checkDependencies ?? true) {
    await assertDependencies(inputs);
  }

  const results: OptimizationResult[] = [];
  const summary = await optimizeImages(
    inputs,
    createWebpackCoreOptions(),
    (result) => {
      results.push(result);
    }
  );

  return { results, summary };
}

export function squeezitWebpack(
  options: SqueezitWebpackPluginOptions = {}
): WebpackPluginInstance {
  return {
    apply(compiler: Compiler) {
      compiler.hooks.afterEmit.tapPromise("squeezit:webpack", async () => {
        if (options.enabled === false) {
          return;
        }

        const outputPath = compiler.options.output.path;
        if (!outputPath) {
          throw new Error(
            "[squeezit:webpack] Cannot optimize emitted assets because output.path is not set."
          );
        }

        const outDir = resolve(outputPath);
        const run = await optimizeWebpackOutputDirectory(outDir, options);
        const failures = run.results.filter(
          (result) => result.status === "failed"
        );

        if (failures.length === 0) {
          return;
        }

        const details = failures
          .map(
            (result) =>
              `${result.filePath}: ${result.message ?? "unknown error"}`
          )
          .join("\n");
        throw new Error(`squeezit webpack optimization failed:\n${details}`);
      });
    },
  };
}

async function assertDependencies(inputs: ResolvedInput[]): Promise<void> {
  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, createWebpackCoreOptions())
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

export default squeezitWebpack;
