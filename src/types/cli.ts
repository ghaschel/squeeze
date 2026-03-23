export interface CompressCliFlags {
  recursive?: boolean;
  max?: boolean;
  stripMeta?: boolean;
  exif?: boolean;
  dryRun?: boolean;
  keepTime?: boolean;
  concurrency?: number;
  installDeps?: boolean;
  verbose?: boolean;
  threshold?: number;
  inPlace?: boolean;
  update?: boolean;
  checkUpdate?: boolean;
  pm?: string;
}

export interface CompressCommandOptions {
  patterns: string[];
  recursive: boolean;
  max: boolean;
  stripMeta: boolean;
  exifOnly: boolean;
  dryRun: boolean;
  keepTime: boolean;
  concurrency: number;
  installDeps: boolean;
  verbose: boolean;
  threshold: number;
  inPlace: boolean;
  cwd: string;
}
