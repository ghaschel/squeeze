import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { glob } from "glob";
import { afterEach, describe, expect, test } from "vitest";
import type { Configuration, Stats, WebpackPluginInstance } from "webpack";
import webpack from "webpack";

import {
  createWebpackOptimizationOptions,
  squeezitWebpack,
} from "../../src/integrations/webpack";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const webpackFixtureKeys = [
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
const webpackAssetPattern =
  "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("webpack integration", () => {
  test("creates a build-time plugin that uses default mode with metadata stripping", () => {
    const plugin = squeezitWebpack();
    const options = createWebpackOptimizationOptions("/tmp/webpack-out", false);

    expect(typeof plugin.apply).toBe("function");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getWebpackFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(webpackFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during webpack build", async () => {
    const workspace = await createWorkspace();
    await scaffoldWebpackProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-optimized", [squeezitWebpack()]);

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline", "assets")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, "dist-optimized", "assets")
    );

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing total emitted image asset size", async () => {
    const workspace = await createWorkspace();
    await scaffoldWebpackProject(workspace);

    await buildProject(workspace, "dist-baseline");
    await buildProject(workspace, "dist-disabled", [
      squeezitWebpack({ enabled: false }),
    ]);

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline", "assets")
    );
    const disabledAssets = await findBuiltAssets(
      join(workspace, "dist-disabled", "assets")
    );

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-webpack-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldWebpackProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src", "fixtures"), { recursive: true });

  const fixtures = getWebpackFixtures();
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
  plugins: WebpackPluginInstance[] = []
): Promise<Stats> {
  const config: Configuration = {
    mode: "production",
    context: workspace,
    entry: "./src/index.js",
    output: {
      path: join(workspace, outDir),
      filename: "bundle.js",
      assetModuleFilename: "assets/[name][ext]",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.(png|gif|webp|svg|heif|heic|avif|bmp|ico|jxl)$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins,
    target: "web",
  };

  const compiler = webpack(config);

  return new Promise<Stats>((resolve, reject) => {
    compiler.run((error, stats) => {
      void compiler.close((closeError) => {
        if (error ?? closeError) {
          reject(error ?? closeError);
          return;
        }

        if (!stats) {
          reject(new Error("Webpack build completed without stats."));
          return;
        }

        if (stats.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })));
          return;
        }

        resolve(stats);
      });
    });
  });
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(webpackAssetPattern, {
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

function getWebpackFixtures(): Array<{
  key: (typeof webpackFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return webpackFixtureKeys.map((key) => {
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
    "for (const asset of assets) {",
    '  const image = document.createElement("img");',
    "  image.src = asset.src;",
    "  image.alt = asset.label;",
    "  document.body.append(image);",
    "}",
    "",
  ].join("\n");
}
