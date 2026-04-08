import { cp, mkdir, stat, symlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { execa } from "execa";
import { glob } from "glob";
import { afterEach, describe, expect, test } from "vitest";

import { squeezitAstro } from "../../src/integrations/astro";
import {
  hasRepresentativeFixture,
  representativeFixtures,
} from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const astroFixtureKeys = [
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
const astroAssetPattern =
  "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("astro integration", () => {
  test("exports a callable astro integration wrapper", () => {
    const integration = squeezitAstro();

    expect(integration.name).toBe("squeezit:astro");
    expect(typeof integration.hooks["astro:config:setup"]).toBe("function");
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getAstroFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(
      astroFixtureKeys.filter((key) => hasRepresentativeFixture(key))
    );
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during astro build", async () => {
    const workspace = await createWorkspace();
    await scaffoldAstroProject(workspace);

    await buildProject(workspace, "baseline");
    await buildProject(workspace, "optimized");

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-baseline")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, "dist-optimized")
    );

    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing total emitted image asset size", async () => {
    const workspace = await createWorkspace();
    await scaffoldAstroProject(workspace);

    await buildProject(workspace, "baseline");
    await buildProject(workspace, "disabled");

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
  const workspace = await createTempWorkspace("squeezit-astro-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldAstroProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src", "pages"), { recursive: true });
  await mkdir(join(workspace, "src", "fixtures"), { recursive: true });
  await symlink(
    join(process.cwd(), "node_modules"),
    join(workspace, "node_modules"),
    "dir"
  );

  const fixtures = getAstroFixtures();
  for (const fixture of fixtures) {
    await cp(
      fixture.sourcePath,
      join(workspace, "src", "fixtures", fixture.fileName)
    );
  }

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "squeezit-astro-test",
        private: true,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    join(workspace, "src", "pages", "index.astro"),
    buildPageSource(fixtures),
    "utf8"
  );
}

async function buildProject(
  workspace: string,
  mode: "baseline" | "optimized" | "disabled"
): Promise<void> {
  await writeFile(
    join(workspace, "astro.config.mjs"),
    buildAstroConfigSource(mode),
    "utf8"
  );

  await execa(
    "node",
    [join(process.cwd(), "node_modules", "astro", "astro.js"), "build"],
    {
      cwd: workspace,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
      },
      reject: true,
    }
  );
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(astroAssetPattern, {
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

function getAstroFixtures(): Array<{
  key: string;
  sourcePath: string;
  fileName: string;
}> {
  return astroFixtureKeys
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

function buildPageSource(
  fixtures: Array<{ key: string; fileName: string }>
): string {
  const imports = fixtures.map(
    (fixture, index) =>
      `import asset${index} from "../fixtures/${fixture.fileName}?url";`
  );
  const assetEntries = fixtures.map(
    (fixture, index) => `  { label: "${fixture.key}", src: asset${index} },`
  );

  return [
    "---",
    ...imports,
    "const assets = [",
    ...assetEntries,
    "];",
    "---",
    "",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Squeezit Astro Test</title>",
    "  </head>",
    "  <body>",
    "    {assets.map((asset) => (",
    "      <img src={asset.src} alt={asset.label} />",
    "    ))}",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

function buildAstroConfigSource(
  mode: "baseline" | "optimized" | "disabled"
): string {
  const usesIntegration = mode !== "baseline";
  const integration =
    mode === "optimized"
      ? "squeezitAstro()"
      : "squeezitAstro({ enabled: false })";
  const astroIntegrationPath = join(process.cwd(), "dist", "astro.js");

  return [
    'import { defineConfig } from "astro/config";',
    ...(usesIntegration
      ? [
          `import { squeezitAstro } from ${JSON.stringify(
            astroIntegrationPath
          )};`,
        ]
      : []),
    "",
    "export default defineConfig({",
    '  output: "static",',
    `  outDir: "./dist-${mode}",`,
    "  vite: {",
    "    assetsInclude: [",
    "      /\\.(png|gif|webp|svg|heif|heic|avif|bmp|ico|cur|jxl)$/i,",
    "    ],",
    "  },",
    ...(usesIntegration ? [`  integrations: [${integration}],`] : []),
    "});",
    "",
  ].join("\n");
}
