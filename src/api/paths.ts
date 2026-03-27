import { basename, isAbsolute, relative } from "node:path";

import type { ResolvedInput } from "../types";

export function toReportedPath(
  filePath: string | undefined,
  cwd: string,
  resolvedInput?: ResolvedInput
): string {
  if (typeof filePath === "string" && filePath.length > 0) {
    if (!isAbsolute(filePath)) {
      return normalizeSlashes(filePath);
    }

    const relativePath = normalizeSlashes(relative(cwd, filePath));
    if (relativePath.length > 0) {
      return relativePath;
    }
  }

  if (resolvedInput?.displayPath) {
    return normalizeSlashes(resolvedInput.displayPath);
  }

  if (typeof filePath === "string" && filePath.length > 0) {
    return basename(filePath);
  }

  return "";
}

function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}
