export type SupportedFormat =
  | "jpeg"
  | "png"
  | "apng"
  | "gif"
  | "webp"
  | "svg"
  | "tiff"
  | "heif"
  | "avif"
  | "bmp"
  | "jxl"
  | "ico"
  | "cur"
  | "raw";

export interface ResolvedInput {
  absolutePath: string;
  displayPath: string;
  outputPath?: string;
  preserveOriginal?: boolean;
}

export interface DependencySpec {
  binary: string;
  required: boolean;
  brewPackage?: string;
  aptPackage?: string;
}

export interface DetectedImage {
  format: SupportedFormat;
  mimeType: string;
  animated: boolean;
}

export interface OptimizationResult {
  filePath: string;
  label: string;
  status: "optimized" | "skipped" | "failed" | "dry-run";
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  message?: string;
  targetPath?: string;
}

export interface Summary {
  processed: number;
  optimized: number;
  dryRunEligible: number;
  failed: number;
  skipped: number;
  savedBytes: number;
  startedAt: number;
}
