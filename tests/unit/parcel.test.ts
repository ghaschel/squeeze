import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createParcelOptimizationOptions,
  loadParcelPluginConfigFromProjectRoot,
  normalizeParcelPluginConfig,
} from "../../src/integrations/parcel";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("parcel integration helpers", () => {
  test("creates default optimization options with metadata stripping enabled", () => {
    const options = createParcelOptimizationOptions("/tmp/parcel-out", false);

    expect(options.cwd).toBe("/tmp/parcel-out");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("normalizes parcel config with defaults", () => {
    expect(normalizeParcelPluginConfig(undefined)).toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
    expect(normalizeParcelPluginConfig("invalid")).toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
  });

  test("normalizes only valid boolean parcel config values", () => {
    expect(
      normalizeParcelPluginConfig({
        enabled: false,
        checkDependencies: "nope",
        productionOnly: false,
      })
    ).toEqual({
      enabled: false,
      checkDependencies: true,
      productionOnly: false,
    });
  });

  test("loads parcel config from package.json", async () => {
    const workspace = await createWorkspace();
    await mkdir(workspace, { recursive: true });
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify(
        {
          name: "parcel-config-test",
          squeezit: {
            parcel: {
              enabled: false,
              checkDependencies: false,
              productionOnly: false,
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(
      loadParcelPluginConfigFromProjectRoot(workspace)
    ).resolves.toEqual({
      enabled: false,
      checkDependencies: false,
      productionOnly: false,
    });
  });

  test("falls back to defaults when package.json is missing or invalid", async () => {
    const missingWorkspace = await createWorkspace();
    const invalidWorkspace = await createWorkspace();
    await writeFile(join(invalidWorkspace, "package.json"), "{", "utf8");

    await expect(
      loadParcelPluginConfigFromProjectRoot(missingWorkspace)
    ).resolves.toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });

    await expect(
      loadParcelPluginConfigFromProjectRoot(invalidWorkspace)
    ).resolves.toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-parcel-unit-");
  workspaces.push(workspace);
  return workspace;
}
