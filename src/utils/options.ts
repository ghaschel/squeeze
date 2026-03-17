import { cpus } from "node:os";

import type { CompressCliFlags, CompressCommandOptions } from "../types";

export function resolveCompressOptions(
  patterns: string[],
  flags: CompressCliFlags,
  cwd: string
): CompressCommandOptions {
  const max = flags.max ?? false;
  const defaultConcurrency = max
    ? Math.min(cpus().length || 1, 2)
    : cpus().length || 1;

  return {
    patterns,
    recursive: flags.recursive ?? false,
    max,
    stripMeta: flags.stripMeta ?? false,
    dryRun: flags.dryRun ?? false,
    keepTime: flags.keepTime ?? false,
    concurrency: flags.concurrency ?? defaultConcurrency,
    installDeps: flags.installDeps ?? false,
    verbose: flags.verbose ?? false,
    threshold: flags.threshold ?? 100,
    inPlace: flags.inPlace ?? false,
    cwd,
  };
}
