import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fsExtra from "fs-extra";

const { ensureDir, pathExists } = fsExtra;

export async function createTempWorkspace(
  prefix = "squeezit-test-"
): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function copyFixtureToWorkspace(
  fixturePath: string,
  workspace: string
): Promise<string> {
  if (!(await pathExists(fixturePath))) {
    throw new Error(`Fixture missing: ${fixturePath}`);
  }

  const targetPath = join(
    workspace,
    fixturePath.split("/tests/fixtures/formats/").pop() ??
      fixturePath.split(/[\\/]/).pop() ??
      "fixture"
  );
  await ensureDir(dirname(targetPath));
  await cp(fixturePath, targetPath);
  return targetPath;
}

export async function cleanupWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
}
