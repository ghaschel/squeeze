export interface CoreInputResolutionOptions {
  patterns: string[];
  recursive: boolean;
  cwd: string;
}

export interface CoreOptimizationOptions {
  max: boolean;
  stripMeta: boolean;
  exifOnly: boolean;
  dryRun: boolean;
  keepTime: boolean;
  concurrency: number;
  threshold: number;
  inPlace: boolean;
}

export interface CoreBatchOptions
  extends CoreInputResolutionOptions, CoreOptimizationOptions {}
