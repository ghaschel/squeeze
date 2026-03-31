import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { resolveInputs } from "../../src/core";
import { cleanupWorkspace } from "../helpers/temp";

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("input discovery", () => {
  test("discovers .cur files during default scanning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "squeezit-discovery-"));
    workspaces.push(workspace);
    await writeFile(join(workspace, "cursor.cur"), Buffer.from("00", "hex"));

    const inputs = await resolveInputs({
      cwd: workspace,
      patterns: [],
      recursive: false,
    });

    expect(inputs.map((input) => input.displayPath)).toEqual(["cursor.cur"]);
  });
});
