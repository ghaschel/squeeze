import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { execa } from "execa";
import { glob } from "glob";
import { afterEach, describe, expect, test } from "vitest";

import {
  createGruntOptimizationOptions,
  registerSqueezitTask,
} from "../../src/integrations/grunt";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const gruntFixtureKeys = [
  "png",
  "apng",
  "gif",
  "webp",
  "svg",
  "heif",
  "heic",
  "avif",
  "bmp",
  "ico",
  "jxl",
] as const;
const rawFixtureKeys = ["arw", "cr2", "nef", "orf", "raf"] as const;
const gruntAssetPattern = "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("grunt integration", () => {
  test("registers a multi-task that uses default mode with metadata stripping", () => {
    let registration:
      | {
          name: string;
          description: string;
          task: unknown;
        }
      | undefined;

    registerSqueezitTask(
      {
        registerMultiTask(name, description, task) {
          registration = { name, description, task };
        },
        log: {
          error() {},
        },
      },
      "squeezit"
    );

    const options = createGruntOptimizationOptions("/tmp/grunt-out", false);

    expect(registration?.name).toBe("squeezit");
    expect(typeof registration?.task).toBe("function");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getGruntFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(gruntFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size for dest mappings", async () => {
    const workspace = await createWorkspace();
    await scaffoldGruntProject(workspace);

    await runGruntMode(workspace, "baseline");
    await runGruntMode(workspace, "optimized");

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const optimizedAssets = await findBuiltAssets(join(workspace, "optimized"));

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing dest-mapped output size", async () => {
    const workspace = await createWorkspace();
    await scaffoldGruntProject(workspace);

    await runGruntMode(workspace, "baseline");
    await runGruntMode(workspace, "disabled");

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const disabledAssets = await findBuiltAssets(join(workspace, "disabled"));

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });

  test("supports in-place mappings", async () => {
    const workspace = await createWorkspace();
    await scaffoldGruntProject(workspace);

    const beforeAssets = await findBuiltAssets(join(workspace, "inplace"));
    const beforeSize = await totalAssetSize(beforeAssets);

    await runGruntMode(workspace, "inplace");

    const afterAssets = await findBuiltAssets(join(workspace, "inplace"));
    expect(afterAssets).toHaveLength(beforeAssets.length);
    expect(await totalAssetSize(afterAssets)).toBeLessThan(beforeSize);
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-grunt-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldGruntProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "input"), { recursive: true });
  await mkdir(join(workspace, "inplace"), { recursive: true });

  const fixtures = getGruntFixtures();
  for (const fixture of fixtures) {
    await cp(fixture.sourcePath, join(workspace, "input", fixture.fileName));
    await cp(fixture.sourcePath, join(workspace, "inplace", fixture.fileName));
  }

  await writeFile(
    join(workspace, "run-grunt.cjs"),
    buildGruntRunnerSource(fixtures.map((fixture) => fixture.fileName)),
    "utf8"
  );
}

async function runGruntMode(
  workspace: string,
  mode: "baseline" | "optimized" | "disabled" | "inplace"
): Promise<void> {
  await execa("node", [join(workspace, "run-grunt.cjs"), mode, workspace], {
    cwd: process.cwd(),
    reject: true,
  });
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(gruntAssetPattern, {
    cwd: directory,
    absolute: true,
    nodir: true,
  });

  const assets = matches.sort();
  if (assets.length === 0) {
    throw new Error(`Expected built image assets in ${directory}, found none.`);
  }

  return assets;
}

async function totalAssetSize(paths: string[]): Promise<number> {
  const sizes = await Promise.all(
    paths.map(async (path) => (await stat(path)).size)
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function getGruntFixtures(): Array<{
  key: (typeof gruntFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return gruntFixtureKeys.map((key) => {
    const sourcePath = representativeFixtures[key];

    return {
      key,
      sourcePath,
      fileName: `${key}${extname(sourcePath)}`,
    };
  });
}

function buildGruntRunnerSource(fileNames: string[]): string {
  return `
const fs = require("node:fs/promises");
const path = require("node:path");
const grunt = require(${JSON.stringify(
    join(process.cwd(), "node_modules", "grunt")
  )});
const { registerSqueezitTask } = require(${JSON.stringify(
    join(process.cwd(), "dist", "grunt.cjs")
  )});

const mode = process.argv[2];
const workspace = process.argv[3];
const fixtureFiles = ${JSON.stringify(fileNames)};

registerSqueezitTask(grunt);

grunt.registerMultiTask("copy_assets", "Copy fixture assets.", function() {
  const done = this.async();

  Promise.all(
    this.files.flatMap((mapping) =>
      mapping.src.filter(Boolean).map(async (srcPath) => {
        const target = resolveMappedDestination(
          path.resolve(srcPath),
          mapping.dest,
          mapping.src.length
        );

        if (!target) {
          return;
        }

        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(srcPath, target);
      })
    )
  )
    .then(() => done())
    .catch((error) => {
      grunt.log.error(error.stack || String(error));
      done(false);
    });
});

const mappedFiles = [
  {
    src: fixtureFiles.map((fileName) => path.join(workspace, "input", fileName)),
    dest: path.join(workspace, mode === "baseline" ? "baseline" : mode === "disabled" ? "disabled" : "optimized"),
  },
];

const inplaceFiles = fixtureFiles.map((fileName) => ({
  src: [path.join(workspace, "inplace", fileName)],
  dest: path.join(workspace, "inplace", fileName),
}));

grunt.initConfig({
  copy_assets: {
    baseline: {
      files: mappedFiles,
    },
  },
  squeezit: {
    optimized: {
      files: mappedFiles,
    },
    disabled: {
      options: {
        enabled: false,
      },
      files: mappedFiles,
    },
    inplace: {
      files: inplaceFiles,
    },
  },
});

const taskByMode = {
  baseline: "copy_assets:baseline",
  optimized: "squeezit:optimized",
  disabled: "squeezit:disabled",
  inplace: "squeezit:inplace",
};

grunt.tasks([taskByMode[mode]], { gruntfile: false, color: false }, function() {
  process.exit(grunt.fail.errorcount > 0 ? 1 : 0);
});

function resolveMappedDestination(source, dest, sourceCount) {
  if (!dest) {
    return null;
  }

  const resolvedDest = path.resolve(dest);
  if (resolvedDest === source) {
    return null;
  }

  if (sourceCount > 1 || isDirectoryStylePath(dest)) {
    return path.resolve(resolvedDest, path.basename(source));
  }

  return resolvedDest;
}

function isDirectoryStylePath(filePath) {
  return filePath.endsWith("/") || filePath.endsWith("\\\\") || path.extname(filePath) === "";
}
`;
}
