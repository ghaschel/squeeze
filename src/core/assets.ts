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
