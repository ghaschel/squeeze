import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";

import type { Cache } from "@parcel/cache";
import { FSCache } from "@parcel/cache";
import Parcel from "@parcel/core";
import { NodeFS } from "@parcel/fs";
import { glob } from "glob";
import { afterEach, describe, expect, test } from "vitest";

import { squeezitParcel } from "../../src/integrations/parcel";
import {
  hasRepresentativeFixture,
  representativeFixtures,
} from "../helpers/fixture-manifest";
import { cleanupWorkspace } from "../helpers/temp";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const workspaces: string[] = [];
const parcelFixtureKeys = [
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
const parcelAssetPattern =
  "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("parcel integration", () => {
  test("exports a parcel optimizer plugin module", () => {
    expect(typeof squeezitParcel).toBe("object");
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getParcelFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(
      parcelFixtureKeys.filter((key) => hasRepresentativeFixture(key))
    );
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during production parcel builds", async () => {
    const workspace = await createWorkspace();
    await scaffoldParcelProject(workspace);

    await buildProject(workspace, "dist-baseline", {
      mode: "production",
      usePlugin: false,
    });
    await buildProject(workspace, "dist-optimized", {
      mode: "production",
      usePlugin: true,
    });

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

  test("matches the baseline output when disabled via package.json config", async () => {
    const workspace = await createWorkspace();
    await scaffoldParcelProject(workspace);

    await buildProject(workspace, "dist-baseline", {
      mode: "production",
      usePlugin: false,
    });
    await buildProject(workspace, "dist-disabled", {
      mode: "production",
      usePlugin: true,
      pluginConfig: {
        enabled: false,
      },
    });

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

  test("is a no-op in non-production builds by default", async () => {
    const workspace = await createWorkspace();
    await scaffoldParcelProject(workspace);

    await buildProject(workspace, "dist-dev-baseline", {
      mode: "development",
      usePlugin: false,
    });
    await buildProject(workspace, "dist-dev-default", {
      mode: "development",
      usePlugin: true,
    });

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-dev-baseline")
    );
    const defaultAssets = await findBuiltAssets(
      join(workspace, "dist-dev-default")
    );

    expect(defaultAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(defaultAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can optimize non-production builds when productionOnly is false", async () => {
    const workspace = await createWorkspace();
    await scaffoldParcelProject(workspace);

    await buildProject(workspace, "dist-dev-baseline", {
      mode: "development",
      usePlugin: false,
    });
    await buildProject(workspace, "dist-dev-optimized", {
      mode: "development",
      usePlugin: true,
      pluginConfig: {
        productionOnly: false,
      },
    });

    const baselineAssets = await findBuiltAssets(
      join(workspace, "dist-dev-baseline")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, "dist-dev-optimized")
    );

    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("fails clearly when enabled and required dependencies are missing", async () => {
    const workspace = await createWorkspace();
    await scaffoldParcelProject(workspace);
    const fakeBin = join(workspace, "bin");
    await mkdir(fakeBin, { recursive: true });
    await writeFile(join(fakeBin, "which"), "#!/bin/sh\nexit 1\n", "utf8");
    await chmod(join(fakeBin, "which"), 0o755);

    const originalPath = process.env.PATH;

    try {
      process.env.PATH = fakeBin;

      await expect(
        buildProject(workspace, "dist-missing-deps", {
          mode: "production",
          usePlugin: true,
        })
      ).rejects.toThrow(/missing required dependencies|install/i);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(process.cwd(), ".squeezit-parcel-"));
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldParcelProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src", "fixtures"), { recursive: true });
  await mkdir(join(workspace, "node_modules"), { recursive: true });

  await symlink(
    process.cwd(),
    join(workspace, "node_modules", "squeezit"),
    "dir"
  );

  const fixtures = getParcelFixtures();
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
      "    <title>Squeezit Parcel Test</title>",
      "  </head>",
      "  <body>",
      '    <script type="module" src="./src/index.js"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    join(workspace, "src", "index.js"),
    buildEntrySource(fixtures),
    "utf8"
  );
}

async function buildProject(
  workspace: string,
  outDir: string,
  options: {
    mode: "development" | "production";
    usePlugin: boolean;
    pluginConfig?: Partial<{
      enabled: boolean;
      checkDependencies: boolean;
      productionOnly: boolean;
    }>;
  }
): Promise<void> {
  await writeProjectPackageJson(workspace, options.pluginConfig);
  await writeParcelRc(workspace, options.usePlugin);

  const bundler = new Parcel({
    entries: "index.html",
    defaultConfig: require.resolve("@parcel/config-default", {
      paths: [repoRoot],
    }),
    cache: createParcelCache(join(workspace, ".parcel-cache")),
    mode: options.mode,
    shouldDisableCache: true,
    shouldPatchConsole: false,
    logLevel: "error",
    defaultTargetOptions: {
      distDir: join(workspace, outDir),
      publicUrl: "/",
      sourceMaps: false,
    },
  });

  const previousCwd = process.cwd();
  process.chdir(workspace);

  try {
    await bundler.run();
  } finally {
    process.chdir(previousCwd);
  }
}

async function writeProjectPackageJson(
  workspace: string,
  pluginConfig: Partial<{
    enabled: boolean;
    checkDependencies: boolean;
    productionOnly: boolean;
  }> = {}
): Promise<void> {
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "squeezit-parcel-test",
        private: true,
        version: "1.0.0",
        squeezit: {
          parcel: pluginConfig,
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

async function writeParcelRc(
  workspace: string,
  usePlugin: boolean
): Promise<void> {
  const parcelRc = usePlugin
    ? {
        extends: "@parcel/config-default",
        transformers: {
          "url:*": ["@parcel/transformer-raw"],
        },
        optimizers: {
          "*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}": [
            "...",
            "./node_modules/squeezit/dist/parcel.cjs",
          ],
        },
      }
    : {
        extends: "@parcel/config-default",
        transformers: {
          "url:*": ["@parcel/transformer-raw"],
        },
      };

  await writeFile(
    join(workspace, ".parcelrc"),
    JSON.stringify(parcelRc, null, 2),
    "utf8"
  );
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(parcelAssetPattern, {
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

function getParcelFixtures(): Array<{
  key: string;
  sourcePath: string;
  fileName: string;
}> {
  return parcelFixtureKeys
    .filter((key) => hasRepresentativeFixture(key))
    .map((key) => {
      const sourcePath = representativeFixtures[key];
      const fileName = `${key}${extname(sourcePath) || extname(basename(sourcePath))}`;

      return {
        key,
        sourcePath,
        fileName,
      };
    });
}

function buildEntrySource(
  fixtures: Array<{ key: string; fileName: string }>
): string {
  const imports = fixtures.map(
    (fixture, index) =>
      `import asset${index} from "url:./fixtures/${fixture.fileName}";`
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

function createParcelCache(cacheDir: string): Cache {
  return new (FSCache as unknown as {
    new (...args: unknown[]): Cache;
  })(new NodeFS(), cacheDir);
}
