import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fsExtra from "fs-extra";
import { afterEach, describe, expect, test } from "vitest";

import {
  getOptimizationFixtureValues,
  optimizeFile,
  optimizeFiles,
  stripMetadata,
} from "../../../src/api";
import {
  formatFixtures,
  representativeFixtures,
} from "../../helpers/fixture-manifest";
import { cleanupWorkspace, copyFixtureToWorkspace } from "../../helpers/temp";

const { pathExists } = fsExtra;

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("api integration", () => {
  for (const fixture of formatFixtures) {
    test(`${fixture.format}: default mode in place`, async () => {
      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await optimizeFile(inputPath, { mode: "default" });
      const expected = fixture.expectations.default;

      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });

    test(`${fixture.format}: exif mode in place`, async () => {
      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await stripMetadata(inputPath);
      const expected = fixture.expectations.exif;

      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });

    test(`${fixture.format}: max mode in place`, async () => {
      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await optimizeFile(inputPath, { mode: "max" });
      const expected = fixture.expectations.max;

      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });
  }

  test("writes to an output directory without mutating the source", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const outputDir = join(workspace, "out");
    const originalStats = await stat(inputPath);

    const result = await optimizeFile(inputPath, {
      mode: "default",
      cwd: workspace,
      outputDir,
      keepTime: true,
    });

    expect(result.outputPath.startsWith("out/")).toBe(true);
    expect(await pathExists(join(workspace, result.outputPath))).toBe(true);
    expect((await stat(inputPath)).size).toBe(originalStats.size);
  });

  test("supports dry run without writing output files", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const outputDir = join(workspace, "dry-run-out");

    const result = await optimizeFile(inputPath, {
      mode: "max",
      cwd: workspace,
      outputDir,
      dryRun: true,
    });

    expect(result.status).toBe("dry-run");
    expect(await pathExists(join(workspace, result.outputPath))).toBe(false);
  });

  test("supports batch processing with recursive discovery", async () => {
    const workspace = await createWorkspace();
    await copyFixtureToWorkspace(representativeFixtures.png, workspace);
    await copyFixtureToWorkspace(representativeFixtures.jpeg, workspace);

    const result = await optimizeFiles([], {
      cwd: workspace,
      recursive: true,
      mode: "default",
    });

    expect(result.results.length).toBeGreaterThanOrEqual(2);
  });

  test("exposes fixture helper values for assertion updates", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );

    const values = await getOptimizationFixtureValues(inputPath, {
      mode: "default",
    });

    expect(values.filePath.endsWith("png/sample.png")).toBe(true);
    expect(typeof values.originalSize).toBe("number");
    expect(typeof values.optimizedSize).toBe("number");
    expect(typeof values.savedBytes).toBe("number");
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-api-"));
  workspaces.push(workspace);
  return workspace;
}
