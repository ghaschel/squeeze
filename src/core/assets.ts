import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type {
  CoreOptimizationOptions,
  OptimizationResult,
  ResolvedInput,
} from "../types";
import { optimizeImages } from "../utils/optimizer";

export interface BufferAsset {
  kind: "buffer";
  fileName: string;
  contents: Buffer;
}

export interface FileAsset {
  kind: "file";
  fileName: string;
  filePath: string;
}

export type OptimizationAsset = BufferAsset | FileAsset;

export interface OptimizedAssetResult {
  fileName: string;
  contents: Buffer;
  result: OptimizationResult;
}

export function createBufferAsset(
  fileName: string,
  contents: Buffer | Uint8Array
): BufferAsset {
  return {
    kind: "buffer",
    fileName,
    contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
  };
}

export function createFileAsset(
  filePath: string,
  fileName = filePath.split(/[\\/]/).pop() ?? filePath
): FileAsset {
  return {
    kind: "file",
    fileName,
    filePath,
  };
}

export async function optimizeAsset(
  asset: OptimizationAsset,
  options: CoreOptimizationOptions
): Promise<OptimizedAssetResult> {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-asset-"));
  const inputPath = join(workspace, asset.fileName);

  try {
    if (asset.kind === "buffer") {
      await writeFile(inputPath, asset.contents);
    } else {
      await cp(asset.filePath, inputPath);
    }

    let optimizationResult: OptimizationResult | undefined;
    const resolvedInput: ResolvedInput = {
      absolutePath: inputPath,
      displayPath: asset.fileName,
    };

    await optimizeImages([resolvedInput], options, (result) => {
      optimizationResult = result;
    });

    if (!optimizationResult) {
      throw new Error("No optimization result was produced for asset");
    }

    const finalPath =
      optimizationResult.status === "optimized"
        ? (optimizationResult.targetPath ?? inputPath)
        : inputPath;

    return {
      fileName: basename(finalPath),
      contents: await readFile(finalPath),
      result: optimizationResult,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
