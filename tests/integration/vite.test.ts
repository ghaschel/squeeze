import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { glob } from "glob";
import type { PluginOption } from "vite";
import { build } from "vite";
import { afterEach, describe, expect, test } from "vitest";

import {
  createViteOptimizationOptions,
  squeezitVite,
} from "../../src/integrations/vite";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const viteFixtureKeys = [
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
const viteAssetExtensionPattern =
  ".{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";
const viteAssetsInclude = /\.(png|gif|webp|svg|heif|heic|avif|bmp|ico|jxl)$/i;

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("vite integration", () => {
  test("creates a build-only plugin that uses default mode with metadata stripping", () => {
    const plugin = squeezitVite();
    const options = createViteOptimizationOptions("/tmp/vite-out", false);

    expect(plugin.name).toBe("squeezit:vite");
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("post");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getViteFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(viteFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during vite build", async () => {
    const workspace = await createWorkspace();
    await scaffoldViteProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-optimized", [squeezitVite()]);

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
    await scaffoldViteProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-disabled", [
      squeezitVite({ enabled: false }),
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
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-vite-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldViteProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src"), { recursive: true });
  await mkdir(join(workspace, "src", "fixtures"), { recursive: true });

  const fixtures = getViteFixtures();
  for (const fixture of fixtures) {
    await cp(
      fixture.sourcePath,
      join(workspace, "src", "fixtures", fixture.fileName)
    );
  }

  await writeFile(
    join(workspace, "index.html"),
    [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="UTF-8" />',
      "    <title>Squeezit Vite Test</title>",
      "  </head>",
      "  <body>",
      '    <script type="module" src="/src/main.ts"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    join(workspace, "src", "main.ts"),
    buildMainSource(fixtures),
    "utf8"
  );
}

async function buildProject(
  workspace: string,
  outDir: string,
  plugins: PluginOption[] = []
): Promise<void> {
  const previousCwd = process.cwd();
  process.chdir(workspace);

  try {
    await build({
      configFile: false,
      root: ".",
      logLevel: "silent",
      assetsInclude: viteAssetsInclude,
      plugins,
      build: {
        outDir,
        emptyOutDir: true,
        assetsInlineLimit: 0,
      },
    });
  } finally {
    process.chdir(previousCwd);
  }
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(`**/*${viteAssetExtensionPattern}`, {
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

function getViteFixtures(): Array<{
  key: (typeof viteFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return viteFixtureKeys.map((key) => {
    const sourcePath = representativeFixtures[key];
    const fileName = `${key}${extname(sourcePath) || extname(basename(sourcePath))}`;

    return {
      key,
      sourcePath,
      fileName,
    };
  });
}

function buildMainSource(
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
    "for (const asset of assets) {",
    '  const image = document.createElement("img");',
    "  image.src = asset.src;",
    "  image.alt = asset.label;",
    "  document.body.append(image);",
    "}",
    "",
  ].join("\n");
}
