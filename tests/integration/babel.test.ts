import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { transformAsync } from "@babel/core";
import { afterEach, describe, expect, test } from "vitest";

import {
  hasRepresentativeFixture,
  representativeFixtures,
} from "../helpers/fixture-manifest";
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

describe("babel integration", () => {
  test("exports a callable babel plugin factory", async () => {
    const { squeezitBabel } = await loadBuiltBabelPlugin();

    expect(typeof squeezitBabel).toBe("function");
  });

  test("rewrites static imports and jsx literals in production mode", async () => {
    const workspace = await createWorkspace();
    await scaffoldBabelProject(workspace);

    const { code } = await transformFixture(workspace, "production");

    expect(code).toContain(".squeezit/babel-assets");
    expect(code).toContain("hero.png");
    expect(code).toContain("poster.webp");
    expect(code).toContain("link.svg");
    if (hasRepresentativeFixture("cur")) {
      expect(code).toContain("cursor.cur");
    }

    const generatedPng = resolve(
      workspace,
      ".squeezit/babel-assets",
      "src/assets/hero.png"
    );
    const generatedWebp = resolve(
      workspace,
      ".squeezit/babel-assets",
      "src/assets/poster.webp"
    );

    expect((await stat(generatedPng)).size).toBeLessThan(
      (await stat(join(workspace, "src/assets/hero.png"))).size
    );
    expect((await stat(generatedWebp)).size).toBeLessThan(
      (await stat(join(workspace, "src/assets/poster.webp"))).size
    );

    if (hasRepresentativeFixture("cur")) {
      const generatedCur = resolve(
        workspace,
        ".squeezit/babel-assets",
        "src/assets/cursor.cur"
      );

      expect(await stat(generatedCur)).toBeDefined();
    }
  });

  test("is a no-op outside production by default", async () => {
    const workspace = await createWorkspace();
    await scaffoldBabelProject(workspace);

    const { code } = await transformFixture(workspace, "development");

    expect(code).toContain("./assets/hero.png");
    expect(code).not.toContain(".squeezit/babel-assets");
  });

  test("can be enabled outside production when productionOnly is false", async () => {
    const workspace = await createWorkspace();
    await scaffoldBabelProject(workspace);

    const { code } = await transformFixture(workspace, "development", {
      productionOnly: false,
    });

    expect(code).toContain(".squeezit/babel-assets");
  });

  test("is a no-op when explicitly disabled", async () => {
    const workspace = await createWorkspace();
    await scaffoldBabelProject(workspace);

    const { code } = await transformFixture(workspace, "production", {
      enabled: false,
    });

    expect(code).toContain("./assets/hero.png");
    expect(code).not.toContain(".squeezit/babel-assets");
  });

  test("leaves dynamic expressions, remote urls, data urls, and raw imports untouched", async () => {
    const workspace = await createWorkspace();
    await scaffoldBabelProject(workspace);

    const { code } = await transformFixture(workspace, "production");

    expect(code).toContain('const dynamicSrc = "./assets/" + name;');
    expect(code).toContain("src={dynamicSrc}");
    expect(code).toContain('"https://example.com/image.png"');
    expect(code).toContain('"data:image/png;base64,AAAA"');
    expect(code).toContain("./assets/raw.raf");
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-babel-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldBabelProject(workspace: string): Promise<void> {
  await mkdir(join(workspace, "src", "assets"), { recursive: true });

  await Promise.all([
    cp(representativeFixtures.png, join(workspace, "src/assets/hero.png")),
    cp(representativeFixtures.webp, join(workspace, "src/assets/poster.webp")),
    cp(representativeFixtures.svg, join(workspace, "src/assets/link.svg")),
    cp(representativeFixtures.raf, join(workspace, "src/assets/raw.raf")),
  ]);

  if (hasRepresentativeFixture("cur")) {
    await cp(
      representativeFixtures.cur,
      join(workspace, "src/assets/cursor.cur")
    );
  }

  await writeFile(
    join(workspace, "src", "fixture.tsx"),
    [
      'import hero from "./assets/hero.png";',
      ...(hasRepresentativeFixture("cur")
        ? ['import cursorAsset from "./assets/cursor.cur";']
        : []),
      'import rawAsset from "./assets/raw.raf";',
      'const poster = require("./assets/poster.webp");',
      "",
      'const dynamicSrc = "./assets/" + name;',
      "",
      "export function Fixture() {",
      "  return (",
      "    <div>",
      '      <img src="./assets/hero.png" />',
      '      <video poster="./assets/poster.webp" />',
      '      <a href="./assets/link.svg">link</a>',
      ...(hasRepresentativeFixture("cur")
        ? ['      <img src="./assets/cursor.cur" />']
        : []),
      '      <img srcSet="./assets/hero.png 1x, ./assets/poster.webp 2x" />',
      "      <img src={dynamicSrc} />",
      '      <img src="https://example.com/image.png" />',
      '      <img src="data:image/png;base64,AAAA" />',
      "      {hero}",
      ...(hasRepresentativeFixture("cur") ? ["      {cursorAsset}"] : []),
      "      {poster}",
      "      {rawAsset}",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function transformFixture(
  workspace: string,
  envName: string,
  options?: Record<string, unknown>
): Promise<{ code: string }> {
  const { squeezitBabel } = await loadBuiltBabelPlugin();
  const filename = join(workspace, "src", "fixture.tsx");
  const source = await readFile(filename, "utf8");
  const previousCwd = process.cwd();

  process.chdir(workspace);
  try {
    const result = await transformAsync(source, {
      ast: false,
      babelrc: false,
      configFile: false,
      envName,
      filename,
      parserOpts: {
        plugins: ["jsx", "typescript"],
      },
      plugins: [[squeezitBabel, options ?? {}]],
      sourceType: "module",
    });

    return {
      code: result?.code ?? "",
    };
  } finally {
    process.chdir(previousCwd);
  }
}

async function loadBuiltBabelPlugin(): Promise<{
  squeezitBabel: (...args: unknown[]) => unknown;
}> {
  const loaded = (await import(
    resolve(process.cwd(), "dist", "babel.cjs")
  )) as {
    default?: unknown;
    squeezitBabel?: (...args: unknown[]) => unknown;
  };

  const squeezitBabel =
    loaded.squeezitBabel ??
    (typeof loaded.default === "function"
      ? (loaded.default as (...args: unknown[]) => unknown)
      : undefined);

  if (typeof squeezitBabel !== "function") {
    throw new Error("Failed to load built squeezit/babel plugin.");
  }

  return { squeezitBabel };
}
