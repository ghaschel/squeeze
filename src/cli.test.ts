import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { resolveCompressOptions, resolveInputs } from "./utils";

const createdDirectories: string[] = [];

afterEach(async () => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe("resolveCompressOptions", () => {
  test("defaults concurrency to two workers in max mode", () => {
    const parsed = resolveCompressOptions([], { max: true }, process.cwd());
    expect(parsed.max).toBe(true);
    expect(parsed.concurrency).toBe(2);
    expect(parsed.recursive).toBe(false);
  });

  test("keeps positional patterns", () => {
    const parsed = resolveCompressOptions(
      ["assets/**/*.png", "hero.jpg"],
      {},
      process.cwd()
    );
    expect(parsed.patterns).toEqual(["assets/**/*.png", "hero.jpg"]);
  });
});

describe("resolveInputs", () => {
  test("defaults to supported files in the current directory", async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, "tracked.png"), "x");
    await writeFile(join(root, "notes.txt"), "x");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "nested", "deep.jpg"), "x");

    const matches = await resolveInputs(resolveCompressOptions([], {}, root));
    const displayPaths = matches.map((entry) => entry.displayPath);

    expect(displayPaths).toEqual(["tracked.png"]);
  });

  test("matches unexpanded glob patterns", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "images", "nested", "banner.webp"), "x");
    await writeFile(join(root, "images", "cover.jpg"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["images/**/*.webp"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual([
      "images/nested/banner.webp",
    ]);
  });

  test("keeps bare shell patterns scoped to the current directory", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "top.png"), "x");
    await writeFile(join(root, "images", "nested", "deep.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["*.png"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual(["top.png"]);
  });

  test("supports explicit file parameters", async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, "file.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["file.png"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual(["file.png"]);
  });

  test("supports explicit directories without recursion", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "images", "top.png"), "x");
    await writeFile(join(root, "images", "nested", "deep.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["images"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual([
      "images/top.png",
    ]);
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-test-"));
  createdDirectories.push(directory);
  return directory;
}
