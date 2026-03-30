import { cpus } from "node:os";
import { resolve } from "node:path";

import type { Plugin, ResolvedConfig } from "vite";

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

export interface SqueezitVitePluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
}

export interface ViteOptimizationRun {
  results: OptimizationResult[];
  summary: Summary;
}

export function createViteOptimizationOptions(
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

export function createViteCoreOptions(): CoreOptimizationOptions {
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

export async function optimizeViteOutputDirectory(
  outDir: string,
  options: SqueezitVitePluginOptions = {}
): Promise<ViteOptimizationRun> {
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
    createViteCoreOptions(),
    (result) => {
      results.push(result);
    }
  );

  return { results, summary };
}

export function squeezitVite(options: SqueezitVitePluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;

  return {
    name: "squeezit:vite",
    apply: "build",
    enforce: "post",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async closeBundle() {
      if (options.enabled === false || !config) {
        return;
      }

      if (config.build.write === false) {
        config.logger.warn(
          "[squeezit:vite] Skipping optimization because build.write is false."
        );
        return;
      }

      const outDir = resolve(config.root, config.build.outDir);
      const run = await optimizeViteOutputDirectory(outDir, options);

      const failures = run.results.filter(
        (result) => result.status === "failed"
      );
      if (failures.length > 0) {
        const details = failures
          .map(
            (result) =>
              `${result.filePath}: ${result.message ?? "unknown error"}`
          )
          .join("\n");
        throw new Error(`squeezit vite optimization failed:\n${details}`);
      }
    },
  };
}

async function assertDependencies(inputs: ResolvedInput[]): Promise<void> {
  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, createViteCoreOptions())
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

export default squeezitVite;
