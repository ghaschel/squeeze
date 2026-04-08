import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import { glob } from "glob";
import type { NormalizedOutputOptions, Plugin as RollupPlugin } from "rollup";
import { rollup } from "rollup";
import { afterEach, describe, expect, test } from "vitest";

import {
  createRollupOptimizationOptions,
  squeezitRollup,
} from "../../src/integrations/rollup";
import {
  hasRepresentativeFixture,
  representativeFixtures,
} from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const rollupFixtureKeys = [
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
  "cur",
  "jxl",
] as const;
const rawFixtureKeys = ["arw", "cr2", "nef", "orf", "raf"] as const;
const rollupAssetPattern =
  "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("rollup integration", () => {
  test("creates a plugin that uses default mode with metadata stripping", () => {
    const plugin = squeezitRollup();
    const options = createRollupOptimizationOptions("/tmp/rollup-out", false);

    expect(plugin.name).toBe("squeezit:rollup");
    expect(typeof plugin.generateBundle).toBe("function");
    expect(typeof plugin.writeBundle).toBe("function");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getRollupFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(
      rollupFixtureKeys.filter((key) => hasRepresentativeFixture(key))
    );
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during rollup build", async () => {
    const workspace = await createWorkspace();
    await scaffoldRollupProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-optimized", [squeezitRollup()]);

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, "dist-optimized")
    );

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing total emitted image asset size", async () => {
    const workspace = await createWorkspace();
    await scaffoldRollupProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-disabled", [
      squeezitRollup({ enabled: false }),
    ]);

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline")
    );
    const disabledAssets = await findBuiltAssets(
      join(workspace, "dist-disabled")
    );

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });

  test("updates hashed asset file names and chunk references when in-memory optimization changes bytes", async () => {
    const workspace = await createWorkspace();
    await scaffoldRollupProject(workspace);

    await buildProject(workspace, "dist-baseline-hashed", [], true);
    await buildProject(
      workspace,
      "dist-optimized-hashed",
      [squeezitRollup()],
      true
    );

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline-hashed")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, "dist-optimized-hashed")
    );
    const baselineNames = baselineAssets.map((asset) => asset.split("/").pop());
    const optimizedNames = optimizedAssets.map((asset) =>
      asset.split("/").pop()
    );

    expect(optimizedNames).not.toEqual(baselineNames);

    const chunkCode = await readBuiltChunk(
      join(workspace, "dist-optimized-hashed")
    );
    for (const assetPath of optimizedAssets) {
      const fileName = assetPath.split("/").pop();
      if (fileName) {
        expect(chunkCode).toContain(fileName);
      }
    }
  });

  test("optimizes post-write fallback files that were not part of the rollup bundle", async () => {
    const workspace = await createWorkspace();
    await scaffoldRollupProject(workspace);

    await buildProject(workspace, "dist-post-write", [
      squeezitRollup(),
      createPostWriteAssetPlugin(workspace),
    ]);

    const fallbackAsset = join(workspace, "dist-post-write", "post-write.png");
    expect((await stat(fallbackAsset)).size).toBeLessThan(
      (await stat(representativeFixtures.png)).size
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-rollup-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldRollupProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "fixtures"), { recursive: true });
  await writeFile(
    join(workspace, "entry.js"),
    "export const ready = true;\n",
    "utf8"
  );

  for (const fixture of getRollupFixtures()) {
    await cp(fixture.sourcePath, join(workspace, "fixtures", fixture.fileName));
  }
}

async function buildProject(
  workspace: string,
  outDir: string,
  extraPlugins: RollupPlugin[] = [],
  hashed = false
): Promise<void> {
  const bundle = await rollup({
    input: join(workspace, "entry.js"),
    plugins: [createFixtureEmitterPlugin(workspace), ...extraPlugins],
  });

  try {
    await bundle.write({
      dir: join(workspace, outDir),
      format: "esm",
      entryFileNames: hashed ? "bundle-[hash].js" : "bundle.js",
      assetFileNames: hashed
        ? "assets/[name]-[hash][extname]"
        : "assets/[name][extname]",
    });
  } finally {
    await bundle.close();
  }
}

function createFixtureEmitterPlugin(workspace: string): RollupPlugin {
  const fixtureIds: string[] = [];

  return {
    name: "test:fixture-emitter",
    buildStart() {
      fixtureIds.splice(0, fixtureIds.length);
      for (const fixture of getRollupFixtures()) {
        fixtureIds.push(
          this.emitFile({
            type: "asset",
            name: fixture.fileName,
            source: readFileSync(join(workspace, "fixtures", fixture.fileName)),
          })
        );
      }
    },
    load(id) {
      if (id !== join(workspace, "entry.js")) {
        return null;
      }

      const references = fixtureIds.map(
        (referenceId) => `import.meta.ROLLUP_FILE_URL_${referenceId}`
      );

      return [
        `export const assets = [${references.join(", ")}];`,
        'console.log("squeezit-rollup-test", assets);',
        "",
      ].join("\n");
    },
  };
}

function createPostWriteAssetPlugin(workspace: string): RollupPlugin {
  return {
    name: "test:post-write-asset",
    async generateBundle(outputOptions: NormalizedOutputOptions) {
      const outDir =
        outputOptions.dir ??
        (outputOptions.file ? dirname(outputOptions.file) : null);
      if (!outDir) {
        throw new Error("Missing Rollup output directory in test plugin.");
      }

      await mkdir(outDir, { recursive: true });
      await cp(representativeFixtures.png, join(outDir, "post-write.png"));
    },
  };
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(rollupAssetPattern, {
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

async function readBuiltChunk(directory: string): Promise<string> {
  const matches = await glob("*.js", {
    cwd: directory,
    absolute: true,
    nodir: true,
  });
  const [firstChunk] = matches.sort();
  if (!firstChunk) {
    throw new Error(`Expected a built chunk in ${directory}`);
  }

  return readFile(firstChunk, "utf8");
}

function getRollupFixtures(): Array<{
  key: string;
  sourcePath: string;
  fileName: string;
}> {
  return rollupFixtureKeys
    .filter((key) => hasRepresentativeFixture(key))
    .map((key) => {
      const sourcePath = representativeFixtures[key];

      return {
        key,
        sourcePath,
        fileName: `${key}${extname(sourcePath)}`,
      };
    });
}
