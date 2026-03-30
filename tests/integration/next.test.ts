import { cp, mkdir, stat, symlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { execa } from "execa";
import { glob } from "glob";
import type { NextConfig } from "next";
import { afterEach, describe, expect, test } from "vitest";
import webpack from "webpack";

import { withSqueezit } from "../../src/integrations/next";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const nextFixtureKeys = [
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
const nextAssetPattern = "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("next integration", () => {
  test("wraps next config and preserves an existing webpack hook", async () => {
    const calls: string[] = [];
    const wrapped = withSqueezit({
      webpack(config, context) {
        calls.push(String(context.buildId));
        config.resolve ??= {};
        config.resolve.alias = {
          ...(config.resolve.alias ?? {}),
          "__squeezit-next-hook__": false,
        };
        return config;
      },
    });

    const nextConfig = wrapped as NextConfig;

    expect(typeof nextConfig).toBe("object");
    expect(typeof nextConfig.webpack).toBe("function");

    const finalConfig = await nextConfig.webpack?.({ plugins: [] }, {
      buildId: "build-id",
      dev: false,
      isServer: false,
      nextRuntime: "nodejs",
      webpack,
    } as never);

    expect(calls).toEqual(["build-id"]);
    expect(finalConfig?.resolve?.alias).toHaveProperty(
      "__squeezit-next-hook__",
      false
    );
    expect(
      finalConfig?.plugins?.some(
        (plugin: unknown) =>
          typeof plugin === "object" &&
          plugin !== null &&
          "apply" in plugin &&
          typeof (plugin as { apply?: unknown }).apply === "function"
      )
    ).toBe(true);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getNextFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(nextFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size during next build", async () => {
    const workspace = await createWorkspace();
    await scaffoldNextProject(workspace);

    await buildProject(workspace, "baseline");
    await buildProject(workspace, "optimized");

    const baselineAssets = await findBuiltAssets(
      join(workspace, ".next-baseline", "static")
    );
    const optimizedAssets = await findBuiltAssets(
      join(workspace, ".next-optimized", "static")
    );

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing total emitted image asset size", async () => {
    const workspace = await createWorkspace();
    await scaffoldNextProject(workspace);

    await buildProject(workspace, "baseline");
    await buildProject(workspace, "disabled");

    const baselineAssets = await findBuiltAssets(
      join(workspace, ".next-baseline", "static")
    );
    const disabledAssets = await findBuiltAssets(
      join(workspace, ".next-disabled", "static")
    );

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-next-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldNextProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "pages"), { recursive: true });
  await mkdir(join(workspace, "fixtures"), { recursive: true });
  await symlink(
    join(process.cwd(), "node_modules"),
    join(workspace, "node_modules"),
    "dir"
  );

  const fixtures = getNextFixtures();
  for (const fixture of fixtures) {
    await cp(fixture.sourcePath, join(workspace, "fixtures", fixture.fileName));
  }

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "squeezit-next-test",
        private: true,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    join(workspace, "pages", "index.js"),
    buildPageSource(fixtures),
    "utf8"
  );
}

async function buildProject(
  workspace: string,
  mode: "baseline" | "optimized" | "disabled"
): Promise<void> {
  await writeFile(
    join(workspace, "next.config.js"),
    buildNextConfigSource(mode),
    "utf8"
  );

  await execa(
    "node",
    [
      join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
      "build",
      "--webpack",
      workspace,
    ],
    {
      cwd: process.cwd(),
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reject: true,
    }
  );
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(nextAssetPattern, {
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

function getNextFixtures(): Array<{
  key: (typeof nextFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return nextFixtureKeys.map((key) => {
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
    ...imports,
    "",
    "const assets = [",
    ...assetEntries,
    "];",
    "",
    "export default function HomePage() {",
    "  return (",
    '    <main data-testid="squeezit-next-fixtures">',
    "      {assets.map((asset) => (",
    "        <img key={asset.label} src={asset.src} alt={asset.label} />",
    "      ))}",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildNextConfigSource(
  mode: "baseline" | "optimized" | "disabled"
): string {
  const distDir = `.next-${mode}`;
  const baseConfig = [
    "const baseConfig = {",
    `  distDir: ${JSON.stringify(distDir)},`,
    "  images: {",
    "    disableStaticImages: true,",
    "  },",
    "  webpack(config) {",
    "    config.module.rules.push({",
    "      test: /\\.(png|gif|webp|svg|heif|heic|avif|bmp|ico|jxl)$/i,",
    "      resourceQuery: /url/,",
    "      type: 'asset/resource',",
    "    });",
    "    config.resolve = config.resolve || {};",
    "    config.resolve.alias = {",
    "      ...(config.resolve.alias || {}),",
    "      '__squeezit-next-build-hook__': false,",
    "    };",
    "    return config;",
    "  },",
    "};",
    "",
  ];

  if (mode === "baseline") {
    return [...baseConfig, "module.exports = baseConfig;", ""].join("\n");
  }

  const options = mode === "disabled" ? ", { enabled: false }" : "";

  return [
    `const { withSqueezit } = require(${JSON.stringify(
      join(process.cwd(), "dist", "next.cjs")
    )});`,
    ...baseConfig,
    `module.exports = withSqueezit(baseConfig${options});`,
    "",
  ].join("\n");
}
