import { cp, mkdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import { glob } from "glob";
import { dest, src } from "gulp";
import { afterEach, describe, expect, test } from "vitest";

import {
  createGulpOptimizationOptions,
  squeezitGulp,
} from "../../src/integrations/gulp";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const gulpFixtureKeys = [
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
const gulpAssetPattern = "**/*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("gulp integration", () => {
  test("creates a transform that uses default mode with metadata stripping", () => {
    const stream = squeezitGulp();
    const options = createGulpOptimizationOptions("/tmp/gulp-out", false);

    expect(typeof stream._transform).toBe("function");
    expect(stream.readableObjectMode).toBe(true);
    expect(stream.writableObjectMode).toBe(true);
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getGulpFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(gulpFixtureKeys);
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size for buffered vinyl files", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "baseline"));
    await runGulpPipeline(inputDir, join(workspace, "optimized"), {
      plugin: squeezitGulp(),
    });

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const optimizedAssets = await findBuiltAssets(join(workspace, "optimized"));

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing emitted image asset size", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "baseline"));
    await runGulpPipeline(inputDir, join(workspace, "disabled"), {
      plugin: squeezitGulp({ enabled: false }),
    });

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const disabledAssets = await findBuiltAssets(join(workspace, "disabled"));

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });

  test("supports path-backed vinyl files via read:false pipelines", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "path-backed"), {
      plugin: squeezitGulp(),
      read: false,
    });

    const assets = await findBuiltAssets(join(workspace, "path-backed"));
    expect(assets.length).toBeGreaterThan(0);
  });

  test("rejects streaming vinyl contents", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await expect(
      runGulpPipeline(inputDir, join(workspace, "streamed"), {
        plugin: squeezitGulp(),
        buffer: false,
      })
    ).rejects.toThrow(
      "[squeezit:gulp] Streaming Vinyl contents are not supported yet."
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-gulp-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldInputFixtures(workspace: string): Promise<string> {
  const inputDir = join(workspace, "input");
  await mkdir(inputDir, { recursive: true });

  const fixtures = getGulpFixtures();
  for (const fixture of fixtures) {
    await cp(fixture.sourcePath, join(inputDir, fixture.fileName));
  }

  return inputDir;
}

async function runGulpPipeline(
  inputDir: string,
  outputDir: string,
  options: {
    plugin?: ReturnType<typeof squeezitGulp>;
    read?: boolean;
    buffer?: boolean;
  } = {}
): Promise<void> {
  const sourceStream = src(join(inputDir, "*"), {
    cwd: inputDir,
    read: options.read ?? true,
    buffer: options.buffer ?? true,
  });

  const stages: NodeJS.ReadWriteStream[] = [sourceStream];
  if (options.plugin) {
    stages.push(options.plugin);
  }
  stages.push(dest(outputDir));

  await runStreamChain(stages);
}

async function runStreamChain(stages: NodeJS.ReadWriteStream[]): Promise<void> {
  const [firstStage, ...remainingStages] = stages;
  if (!firstStage) {
    throw new Error("No Gulp pipeline stages were created.");
  }

  await new Promise<void>((resolve, reject) => {
    let tail = firstStage;

    for (const stage of remainingStages) {
      tail = tail.pipe(stage);
    }

    tail.on("finish", resolve);
    tail.on("error", reject);
    firstStage.on("error", reject);
    for (const stage of remainingStages) {
      stage.on("error", reject);
    }
  });
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(gulpAssetPattern, {
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

function getGulpFixtures(): Array<{
  key: (typeof gulpFixtureKeys)[number];
  sourcePath: string;
  fileName: string;
}> {
  return gulpFixtureKeys.map((key) => {
    const sourcePath = representativeFixtures[key];

    return {
      key,
      sourcePath,
      fileName: `${key}${extname(sourcePath)}`,
    };
  });
}
