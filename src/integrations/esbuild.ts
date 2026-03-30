import { cpus } from "node:os";
import { dirname, resolve } from "node:path";

import type { BuildOptions, Plugin as EsbuildPlugin } from "esbuild";

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

export interface SqueezitEsbuildPluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

export interface EsbuildOptimizationRun {
  results: OptimizationResult[];
  summary: Summary;
}

export function createEsbuildOptimizationOptions(
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

export function createEsbuildCoreOptions(): CoreOptimizationOptions {
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

export async function optimizeEsbuildOutputDirectory(
  outDir: string,
  options: SqueezitEsbuildPluginOptions = {}
): Promise<EsbuildOptimizationRun> {
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
    createEsbuildCoreOptions(),
    (result) => {
      results.push(result);
    }
  );

  return { results, summary };
}

export function squeezitEsbuild(
  options: SqueezitEsbuildPluginOptions = {}
): EsbuildPlugin {
  return {
    name: "squeezit:esbuild",
    setup(build) {
      build.onEnd(async (result) => {
        if (options.enabled === false || result.errors.length > 0) {
          return;
        }

        const outDir = resolveEsbuildOutputDirectory(build.initialOptions);
        const run = await optimizeEsbuildOutputDirectory(outDir, options);
        const failures = run.results.filter(
          (entry) => entry.status === "failed"
        );

        if (failures.length > 0) {
          throw new Error(
            formatEsbuildFailure(
              "squeezit esbuild optimization failed",
              failures
                .map(
                  (entry) =>
                    `${entry.filePath}: ${entry.message ?? "unknown error"}`
                )
                .join("\n")
            )
          );
        }
      });
    },
  };
}

function resolveEsbuildOutputDirectory(initialOptions: BuildOptions): string {
  if (initialOptions.write === false) {
    throw new Error(
      "[squeezit:esbuild] Cannot optimize emitted assets when write is false."
    );
  }

  const cwd = initialOptions.absWorkingDir ?? process.cwd();

  if (initialOptions.outdir) {
    return resolve(cwd, initialOptions.outdir);
  }

  if (initialOptions.outfile) {
    return dirname(resolve(cwd, initialOptions.outfile));
  }

  throw new Error(
    "[squeezit:esbuild] Cannot optimize emitted assets because neither outdir nor outfile is set."
  );
}

function formatEsbuildFailure(prefix: string, details: string): string {
  return `${prefix}:\n${details}`;
}

async function assertDependencies(inputs: ResolvedInput[]): Promise<void> {
  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, createEsbuildCoreOptions())
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

export default squeezitEsbuild;
