import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import * as api from "../../src/api";
import { registerSqueezitTask } from "../../src/integrations/grunt";
import { squeezitGulp } from "../../src/integrations/gulp";
import { withSqueezit } from "../../src/integrations/next";
import { squeezitVite } from "../../src/integrations/vite";
import { squeezitWebpack } from "../../src/integrations/webpack";

describe("documentation coverage", () => {
  test("documents integrations in the readme", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("## Integrations");
    expect(readme).toContain("squeezit/gulp");
    expect(readme).toContain("squeezit/vite");
    expect(readme).toContain("squeezit/webpack");
    expect(readme).toContain("squeezit/next");
  });

  test("contains dedicated API documentation", async () => {
    const apiDocs = await readFile(
      join(process.cwd(), "docs", "API.md"),
      "utf8"
    );

    expect(apiDocs).toContain("optimizeFile");
    expect(apiDocs).toContain("optimizeFiles");
    expect(apiDocs).toContain("stripMetadata");
    expect(apiDocs).toContain("getOptimizationFixtureValues");
  });

  test("exports the documented public api functions", () => {
    expect(typeof api.optimizeFile).toBe("function");
    expect(typeof api.optimizeFiles).toBe("function");
    expect(typeof api.stripMetadata).toBe("function");
    expect(typeof api.getOptimizationFixtureValues).toBe("function");
  });

  test("exports the vite integration", () => {
    expect(typeof squeezitVite).toBe("function");
  });

  test("exports the webpack integration", () => {
    expect(typeof squeezitWebpack).toBe("function");
  });

  test("exports the next integration", () => {
    expect(typeof withSqueezit).toBe("function");
  });

  test("exports the gulp integration", () => {
    expect(typeof squeezitGulp).toBe("function");
  });

  test("exports the grunt integration", () => {
    expect(typeof registerSqueezitTask).toBe("function");
  });

  test("declares the root and planned integration exports in package.json", async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8")
    ) as { exports?: Record<string, unknown> };

    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports).toHaveProperty(".");
    expect(packageJson.exports).toHaveProperty("./gulp");
    expect(packageJson.exports).toHaveProperty("./vite");
    expect(packageJson.exports).toHaveProperty("./webpack");
    expect(packageJson.exports).toHaveProperty("./rollup");
    expect(packageJson.exports).toHaveProperty("./next");
    expect(packageJson.exports).toHaveProperty("./esbuild");
    expect(packageJson.exports).toHaveProperty("./grunt");
  });
});
