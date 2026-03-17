import { basename, relative } from "node:path";

import chalk from "chalk";

import type { OptimizationResult, Summary } from "../types";

export function logOptimizationResult(result: OptimizationResult): void {
  const label = colorizeLabel(
    result.status,
    result.status === "dry-run" ? "[DRY]" : result.label
  );
  const filePath = toDisplayPath(result.filePath);
  const targetSuffix =
    result.targetPath && result.targetPath !== result.filePath
      ? chalk.dim(` -> ${basename(result.targetPath)}`)
      : "";

  if (result.status === "skipped") {
    console.log(
      `${label} ${chalk.white(filePath)}${targetSuffix} ${chalk.dim(`(${result.message ?? "skipped"})`)}`
    );
    return;
  }

  if (result.status === "failed") {
    console.log(
      `${label} ${chalk.white(filePath)} ${chalk.red(result.message ?? "unknown error")}`
    );
    return;
  }

  const percent =
    result.originalSize > 0
      ? `${((result.savedBytes / result.originalSize) * 100).toFixed(1)}%`
      : "0.0%";
  const stats = `${formatBytes(result.originalSize)} -> ${formatBytes(result.optimizedSize)}`;

  console.log(
    `${label} ${chalk.white(filePath)}${targetSuffix} ${chalk.green(`-${percent}`)} ${chalk.dim(`(${stats})`)}`
  );
}

export function printSummary(summary: Summary): void {
  const durationSeconds = Math.round((Date.now() - summary.startedAt) / 1000);

  console.log("");
  console.log(chalk.bold("Summary"));
  console.log(`Processed: ${chalk.white(summary.processed.toString())}`);
  console.log(`Optimized: ${chalk.green(summary.optimized.toString())}`);
  console.log(
    `Dry-run matches: ${chalk.blue(summary.dryRunEligible.toString())}`
  );
  console.log(`Skipped: ${chalk.yellow(summary.skipped.toString())}`);
  console.log(
    `Failed: ${summary.failed > 0 ? chalk.red(summary.failed.toString()) : chalk.white("0")}`
  );
  console.log(`Saved: ${chalk.green(formatBytes(summary.savedBytes))}`);
  console.log(`Duration: ${chalk.white(formatDuration(durationSeconds))}`);
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function colorizeLabel(
  status: OptimizationResult["status"],
  label: string
): string {
  switch (status) {
    case "optimized":
      return chalk.green(label);
    case "dry-run":
      return chalk.blue(label);
    case "skipped":
      return chalk.yellow(label);
    case "failed":
      return chalk.red(label);
  }
}

function toDisplayPath(filePath: string): string {
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }

  return filePath;
}
