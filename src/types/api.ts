import type { Summary } from "./optimization";

export type ApiOptimizationMode = "default" | "exif" | "max";

export interface OptimizeFileOptions {
  mode?: ApiOptimizationMode;
  stripMetadata?: boolean;
  outputDir?: string;
  dryRun?: boolean;
  keepTime?: boolean;
  threshold?: number;
  checkDependencies?: boolean;
  cwd?: string;
}

export interface OptimizeFilesOptions extends OptimizeFileOptions {
  recursive?: boolean;
  concurrency?: number;
}

export interface ApiOptimizationResult {
  filePath: string;
  outputPath: string;
  label: string;
  mode: ApiOptimizationMode;
  status: "optimized" | "skipped" | "failed" | "dry-run";
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  changed: boolean;
  wroteOutput: boolean;
  message?: string;
}

export interface ApiBatchResult extends Summary {
  mode: ApiOptimizationMode;
  results: ApiOptimizationResult[];
}

export interface FixtureValueReport {
  filePath: string;
  outputPath: string;
  mode: ApiOptimizationMode;
  status: ApiOptimizationResult["status"];
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  changed: boolean;
  wroteOutput: boolean;
}

export interface FixtureValueBatchReport {
  mode: ApiOptimizationMode;
  values: FixtureValueReport[];
}
