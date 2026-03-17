export interface CompressCliFlags {
  recursive?: boolean;
  max?: boolean;
  stripMeta?: boolean;
  dryRun?: boolean;
  keepTime?: boolean;
  concurrency?: number;
  installDeps?: boolean;
  verbose?: boolean;
  threshold?: number;
  inPlace?: boolean;
}

export interface CompressCommandOptions {
  patterns: string[];
  recursive: boolean;
  max: boolean;
  stripMeta: boolean;
  dryRun: boolean;
  keepTime: boolean;
  concurrency: number;
  installDeps: boolean;
  verbose: boolean;
  threshold: number;
  inPlace: boolean;
  cwd: string;
}
