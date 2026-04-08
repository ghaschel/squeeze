import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import { describe, expect, test } from "vitest";

import { createBufferAsset, optimizeAsset } from "../../src/core";
import {
  createRollupCoreOptions,
  renameRollupBundleAsset,
  resolveRenamedRollupAssetFileName,
  rewriteRollupBundleReferences,
} from "../../src/integrations/rollup";

describe("rollup helpers", () => {
  test("optimizes buffer-backed assets through the shared core bridge", async () => {
    const source = await readFile(
      join(process.cwd(), "tests/fixtures/formats/png/sample.png")
    );

    const optimized = await optimizeAsset(
      createBufferAsset("sample.png", source),
      createRollupCoreOptions()
    );

    expect(optimized.result.status).toBe("optimized");
    expect(optimized.contents.length).toBeLessThan(source.length);
  });

  test("skips unsupported buffer-backed assets cleanly", async () => {
    const optimized = await optimizeAsset(
      createBufferAsset("sample.txt", Buffer.from("hello")),
      createRollupCoreOptions()
    );

    expect(optimized.result.status).toBe("skipped");
  });

  test("derives a new hashed rollup asset file name from optimized bytes", () => {
    const asset = {
      fileName: "assets/hero-12345678.png",
      name: "hero.png",
      originalFileName: "src/assets/hero.png",
      names: ["hero.png"],
      originalFileNames: ["src/assets/hero.png"],
      needsCodeReference: false,
      source: Buffer.from("before"),
      type: "asset",
    } satisfies OutputAsset;

    const renamed = resolveRenamedRollupAssetFileName(
      asset,
      asset.fileName,
      Buffer.from("after")
    );

    expect(renamed).toMatch(/^assets\/hero-[a-f0-9]{8}\.png$/);
    expect(renamed).not.toBe(asset.fileName);
  });

  test("rewrites bundle references when an asset file name changes", () => {
    const asset = {
      fileName: "assets/hero-12345678.png",
      name: "hero.png",
      originalFileName: "src/assets/hero.png",
      names: ["hero.png"],
      originalFileNames: ["src/assets/hero.png"],
      needsCodeReference: false,
      source: Buffer.from("image"),
      type: "asset",
    } satisfies OutputAsset;
    const chunk = {
      type: "chunk",
      fileName: "bundle.js",
      code: 'console.log("assets/hero-12345678.png")',
      imports: [],
      dynamicImports: [],
      referencedFiles: ["assets/hero-12345678.png"],
    } as unknown as OutputChunk;
    const bundle: OutputBundle = {
      "assets/hero-12345678.png": asset,
      "bundle.js": chunk,
    };

    renameRollupBundleAsset(
      bundle,
      "assets/hero-12345678.png",
      "assets/hero-deadbeef.png"
    );

    expect(bundle["assets/hero-deadbeef.png"]).toBeDefined();
    expect(bundle["assets/hero-12345678.png"]).toBeUndefined();
    expect(chunk.code).toContain("assets/hero-deadbeef.png");
    expect(chunk.referencedFiles).toContain("assets/hero-deadbeef.png");
  });

  test("can rewrite references without renaming the bundle entry", () => {
    const chunk = {
      type: "chunk",
      fileName: "bundle.js",
      code: 'console.log("assets/poster-11111111.webp")',
      imports: [],
      dynamicImports: [],
      referencedFiles: ["assets/poster-11111111.webp"],
    } as unknown as OutputChunk;
    const bundle: OutputBundle = {
      "bundle.js": chunk,
    };

    rewriteRollupBundleReferences(
      bundle,
      "assets/poster-11111111.webp",
      "assets/poster-22222222.webp"
    );

    expect(chunk.code).toContain("assets/poster-22222222.webp");
    expect(chunk.referencedFiles).toContain("assets/poster-22222222.webp");
  });
});
