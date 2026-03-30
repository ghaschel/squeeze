import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { build } from "esbuild";
import { glob } from "glob";
import { afterEach, describe, expect, test } from "vitest";

import {
  createEsbuildOptimizationOptions,
  squeezitEsbuild,
} from "../../src/integrations/esbuild";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const esbuildFixtureKeys = [
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
const esbuildAssetPattern =
  "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("esbuild integration", () => {
  test("creates a build-time plugin that uses default mode with metadata stripping", () => {
    const plugin = squeezitEsbuild();
    const options = createEsbuildOptimizationOptions("/tmp/esbuild-out", false);

    expect(plugin.name).toBe("squeezit:esbuild");
    expect(typeof plugin.setup).toBe("function");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getEsbuildFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(esbuildFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during esbuild build", async () => {
    const workspace = await createWorkspace();
    await scaffoldEsbuildProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-optimized", [squeezitEsbuild()]);

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
    await scaffoldEsbuildProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-disabled", [
      squeezitEsbuild({ enabled: false }),
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

  test("fails clearly when outputs are not written to disk", async () => {
    const workspace = await createWorkspace();
    await scaffoldEsbuildProject(workspace);

    await expect(
      buildProject(workspace, "dist-memory", [squeezitEsbuild()], false)
    ).rejects.toThrow(/write is false/i);
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-esbuild-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldEsbuildProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src", "fixtures"), { recursive: true });

  const fixtures = getEsbuildFixtures();
  for (const fixture of fixtures) {
    await cp(
      fixture.sourcePath,
      join(workspace, "src", "fixtures", fixture.fileName)
    );
  }

  await writeFile(
    join(workspace, "src", "index.js"),
    buildEntrySource(fixtures),
    "utf8"
  );
}

async function buildProject(
  workspace: string,
  outDir: string,
  plugins: ReturnType<typeof squeezitEsbuild>[] = [],
  write = true
): Promise<void> {
  await build({
    absWorkingDir: workspace,
    entryPoints: ["./src/index.js"],
    outdir: outDir,
    bundle: true,
    format: "esm",
    platform: "browser",
    write,
    logLevel: "silent",
    entryNames: "bundle",
    assetNames: "assets/[name]",
    loader: {
      ".png": "file",
      ".gif": "file",
      ".webp": "file",
      ".svg": "file",
      ".heif": "file",
      ".heic": "file",
      ".avif": "file",
      ".bmp": "file",
      ".ico": "file",
      ".jxl": "file",
    },
    plugins,
  });
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(esbuildAssetPattern, {
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

function getEsbuildFixtures(): Array<{
  key: (typeof esbuildFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return esbuildFixtureKeys.map((key) => {
    const sourcePath = representativeFixtures[key];

    return {
      key,
      sourcePath,
      fileName: `${key}${extname(sourcePath)}`,
    };
  });
}

function buildEntrySource(
  fixtures: Array<{ key: string; fileName: string }>
): string {
  const imports = fixtures.map(
    (fixture, index) =>
      `import asset${index} from "./fixtures/${fixture.fileName}";`
  );
  const assetEntries = fixtures.map(
    (fixture, index) => `  { label: "${fixture.key}", src: asset${index} },`
  );

  return [
    ...imports,
    "",
    "const assets = [",
    ...assetEntries,
    "];",
    "",
    'console.log("squeezit-esbuild-test", assets.map((asset) => asset.src));',
    "",
  ].join("\n");
}
