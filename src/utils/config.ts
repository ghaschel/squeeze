import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import fsExtra from "fs-extra";

const { ensureDir, pathExists } = fsExtra;

import type { InstallerConfig, PackageManager } from "../types";

const APP_NAME = "squeezit";

export function detectPackageManagerFromUserAgent(
  userAgent?: string
): PackageManager | null {
  const normalized = userAgent?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("bun/")) {
    return "bun";
  }

  if (normalized.startsWith("npm/")) {
    return "npm";
  }

  return null;
}

export function resolveConfigDirectory(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, APP_NAME);
  }

  return join(homedir(), ".config", APP_NAME);
}

export function resolveConfigPath(): string {
  return join(resolveConfigDirectory(), "config.json");
}

export async function readInstallerConfig(): Promise<InstallerConfig | null> {
  const configPath = resolveConfigPath();
  if (!(await pathExists(configPath))) {
    return null;
  }

  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<
    string,
    unknown
  >;
  if (
    !config ||
    typeof config !== "object" ||
    (config.packageManager !== "npm" && config.packageManager !== "bun")
  ) {
    return null;
  }

  return {
    packageManager: config.packageManager,
    packageName:
      typeof config.packageName === "string" ? config.packageName : APP_NAME,
    updatedAt:
      typeof config.updatedAt === "string"
        ? config.updatedAt
        : new Date(0).toISOString(),
  };
}

export async function writeInstallerConfig(
  config: InstallerConfig
): Promise<void> {
  const configDirectory = resolveConfigDirectory();
  await ensureDir(configDirectory);
  await writeFile(resolveConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
}
