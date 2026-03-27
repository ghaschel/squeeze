import { basename, resolve } from "node:path";

import {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  optimizeImages,
  resolveInputs,
} from "../core";
import type {
  ApiBatchResult,
  ApiOptimizationMode,
  ApiOptimizationResult,
  FixtureValueBatchReport,
  FixtureValueReport,
  OptimizationResult,
  OptimizeFileOptions,
  OptimizeFilesOptions,
  ResolvedInput,
} from "../types";
import {
  attachOutputTargets,
  normalizeFileOptions,
  normalizeFilesOptions,
} from "./options";
import { toReportedPath } from "./paths";

export async function optimizeFile(
  input: string,
  options: OptimizeFileOptions = {}
): Promise<ApiOptimizationResult> {
  const normalized = normalizeFileOptions(options);
  const resolvedInputs = attachOutputTargets(
    [
      {
        absolutePath: resolve(normalized.cwd, input),
        displayPath: input.startsWith("/") ? basename(input) : input,
      },
    ],
    normalized.outputDir,
    normalized.cwd
  );

  await assertDependencies(resolvedInputs, normalized);

  const inputByAbsolutePath = new Map(
    resolvedInputs.map((entry) => [entry.absolutePath, entry] as const)
  );
  const results: ApiOptimizationResult[] = [];
  await optimizeImages(resolvedInputs, normalized.core, (result) => {
    results.push(
      toApiResult(
        result,
        normalized.mode,
        normalized.cwd,
        inputByAbsolutePath.get(result.filePath)
      )
    );
  });

  const [first] = results;
  if (!first) {
    throw new Error("No optimization result was produced");
  }

  return first;
}

export async function optimizeFiles(
  inputs: string[],
  options: OptimizeFilesOptions = {}
): Promise<ApiBatchResult> {
  const normalized = normalizeFilesOptions(options);
  const resolvedInputs = attachOutputTargets(
    await resolveInputs({
      patterns: inputs,
      recursive: normalized.recursive,
      cwd: normalized.cwd,
    }),
    normalized.outputDir,
    normalized.cwd
  );

  await assertDependencies(resolvedInputs, normalized);

  const inputByAbsolutePath = new Map(
    resolvedInputs.map((entry) => [entry.absolutePath, entry] as const)
  );
  const results: ApiOptimizationResult[] = [];
  const summary = await optimizeImages(
    resolvedInputs,
    normalized.core,
    (result) => {
      results.push(
        toApiResult(
          result,
          normalized.mode,
          normalized.cwd,
          inputByAbsolutePath.get(result.filePath)
        )
      );
    }
  );

  return {
    ...summary,
    mode: normalized.mode,
    results,
  };
}

export async function stripMetadata(
  input: string,
  options: Omit<OptimizeFileOptions, "mode"> = {}
): Promise<ApiOptimizationResult> {
  return optimizeFile(input, { ...options, mode: "exif" });
}

export async function getOptimizationFixtureValues(
  input: string,
  options: OptimizeFileOptions = {}
): Promise<FixtureValueReport> {
  const result = await optimizeFile(input, options);

  return {
    filePath: result.filePath,
    outputPath: result.outputPath,
    mode: result.mode,
    status: result.status,
    originalSize: result.originalSize,
    optimizedSize: result.optimizedSize,
    savedBytes: result.savedBytes,
    changed: result.changed,
    wroteOutput: result.wroteOutput,
  };
}

export async function getOptimizationFixtureValuesForFiles(
  inputs: string[],
  options: OptimizeFilesOptions = {}
): Promise<FixtureValueBatchReport> {
  const result = await optimizeFiles(inputs, options);

  return {
    mode: result.mode,
    values: result.results.map((entry) => ({
      filePath: entry.filePath,
      outputPath: entry.outputPath,
      mode: entry.mode,
      status: entry.status,
      originalSize: entry.originalSize,
      optimizedSize: entry.optimizedSize,
      savedBytes: entry.savedBytes,
      changed: entry.changed,
      wroteOutput: entry.wroteOutput,
    })),
  };
}

async function assertDependencies(
  inputs: ResolvedInput[],
  normalized: ReturnType<typeof normalizeFileOptions>
): Promise<void> {
  if (!normalized.checkDependencies) {
    return;
  }

  const missing = await findMissingDependencies(
    collectRequiredDependencies(inputs, normalized.core)
  );

  if (missing.length === 0) {
    return;
  }

  const platform = await detectPlatform();
  throw new Error(buildMissingDependencyMessage(missing, platform));
}

function toApiResult(
  result: OptimizationResult,
  mode: ApiOptimizationMode,
  cwd: string,
  resolvedInput?: ResolvedInput
): ApiOptimizationResult {
  const outputPath = result.targetPath ?? result.filePath;
  const wroteOutput =
    result.status !== "dry-run" &&
    (result.status === "optimized" || outputPath !== result.filePath);

  return {
    filePath: toReportedPath(result.filePath, cwd, resolvedInput),
    outputPath: toReportedPath(outputPath, cwd, resolvedInput),
    label: result.label,
    mode,
    status: result.status,
    originalSize: result.originalSize,
    optimizedSize: result.optimizedSize,
    savedBytes: result.savedBytes,
    changed: result.status === "optimized" || result.status === "dry-run",
    wroteOutput,
    message: result.message,
  };
}

export type {
  ApiBatchResult,
  ApiOptimizationMode,
  ApiOptimizationResult,
  FixtureValueBatchReport,
  FixtureValueReport,
  OptimizeFileOptions,
  OptimizeFilesOptions,
} from "../types";
export { toReportedPath } from "./paths";
