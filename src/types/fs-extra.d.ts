declare module "fs-extra" {
  export function copy(
    source: string,
    destination: string,
    options?: {
      overwrite?: boolean;
    }
  ): Promise<void>;

  export function ensureDir(path: string): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function move(
    source: string,
    destination: string,
    options?: {
      overwrite?: boolean;
    }
  ): Promise<void>;
  export function outputFile(
    path: string,
    data: string | Uint8Array
  ): Promise<void>;
  export function pathExists(path: string): Promise<boolean>;
  export function remove(path: string): Promise<void>;
}
