declare module "gulp" {
  import type { ReadWriteStream } from "node:stream";

  export interface SrcOptions {
    cwd?: string;
    read?: boolean;
    buffer?: boolean;
  }

  export function src(
    glob: string | readonly string[],
    options?: SrcOptions
  ): ReadWriteStream;

  export function dest(outDir: string): ReadWriteStream;
}

declare module "vinyl" {
  import type { Stats } from "node:fs";

  export default class Vinyl {
    path?: string;
    history?: string[];
    relative?: string;
    stat?: Stats & { size?: number };
    contents: Buffer | NodeJS.ReadableStream | null;
    isBuffer(): boolean;
    isStream(): boolean;
    isNull(): boolean;
  }
}
