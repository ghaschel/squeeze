import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, realpathSync } from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import type { NodePath, PluginObj, PluginPass } from "@babel/core";
import type {
  CallExpression,
  ImportDeclaration,
  JSXAttribute,
  StringLiteral,
} from "@babel/types";

const supportedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".apng",
  ".gif",
  ".webp",
  ".svg",
  ".tif",
  ".tiff",
  ".heif",
  ".heic",
  ".avif",
  ".bmp",
  ".jxl",
  ".ico",
  ".cur",
]);

const rawExtensions = new Set([".cr2", ".nef", ".arw", ".raf", ".orf", ".rw2"]);

const jsxAssetAttributes = new Set(["src", "srcSet", "href", "poster"]);

export interface SqueezitBabelPluginOptions {
  enabled?: boolean;
  checkDependencies?: boolean;
  productionOnly?: boolean;
  cacheDir?: string;
}

interface BabelState extends PluginPass {
  file: PluginPass["file"] & {
    opts: PluginPass["file"]["opts"] & {
      filename?: string;
    };
  };
  squeezitBabelCache?: Map<string, string>;
  squeezitOptions?: Required<SqueezitBabelPluginOptions>;
}

export function squeezitBabel(
  api: {
    assertVersion(version: number): void;
    env(value?: string | string[]): boolean;
    types: typeof import("@babel/types");
  },
  options: SqueezitBabelPluginOptions = {}
): PluginObj<BabelState> {
  api.assertVersion(7);

  const resolvedOptions: Required<SqueezitBabelPluginOptions> = {
    enabled: options.enabled ?? true,
    checkDependencies: options.checkDependencies ?? true,
    productionOnly: options.productionOnly ?? true,
    cacheDir: options.cacheDir ?? ".squeezit/babel-assets",
  };

  const isProduction = api.env("production");
  const shouldProcess =
    resolvedOptions.enabled &&
    (!resolvedOptions.productionOnly || isProduction);

  return {
    name: "squeezit:babel",
    pre() {
      this.squeezitBabelCache = new Map();
      this.squeezitOptions = resolvedOptions;
    },
    visitor: shouldProcess
      ? {
          ImportDeclaration(
            path: NodePath<ImportDeclaration>,
            state: BabelState
          ) {
            rewriteImportDeclaration(path, state);
          },
          CallExpression(path: NodePath<CallExpression>, state: BabelState) {
            rewriteRequireCall(path, state);
          },
          JSXAttribute(path: NodePath<JSXAttribute>, state: BabelState) {
            rewriteJsxAttribute(path, state);
          },
        }
      : {},
  };
}

function rewriteImportDeclaration(
  path: NodePath<ImportDeclaration>,
  state: BabelState
): void {
  const literal = path.node.source;
  const nextValue = rewriteReferenceLiteral(literal.value, state, false);
  if (nextValue) {
    literal.value = nextValue;
  }
}

function rewriteRequireCall(
  path: NodePath<CallExpression>,
  state: BabelState
): void {
  if (!path.get("callee").isIdentifier({ name: "require" })) {
    return;
  }

  const [firstArgument] = path.get("arguments");
  if (!firstArgument?.isStringLiteral()) {
    return;
  }

  const nextValue = rewriteReferenceLiteral(
    firstArgument.node.value,
    state,
    false
  );
  if (nextValue) {
    firstArgument.node.value = nextValue;
  }
}

function rewriteJsxAttribute(
  path: NodePath<JSXAttribute>,
  state: BabelState
): void {
  const attributeName =
    path.node.name.type === "JSXIdentifier" ? path.node.name.name : null;
  if (!attributeName || !jsxAssetAttributes.has(attributeName)) {
    return;
  }

  const valuePath = path.get("value");
  if (valuePath.isStringLiteral()) {
    const nextValue = rewriteReferenceLiteral(
      valuePath.node.value,
      state,
      attributeName === "srcSet"
    );
    if (nextValue) {
      valuePath.node.value = nextValue;
    }
    return;
  }

  if (
    valuePath.isJSXExpressionContainer() &&
    valuePath.get("expression").isStringLiteral()
  ) {
    const expression = valuePath.get("expression") as NodePath<StringLiteral>;
    const nextValue = rewriteReferenceLiteral(
      expression.node.value,
      state,
      attributeName === "srcSet"
    );
    if (nextValue) {
      expression.node.value = nextValue;
    }
  }
}

function rewriteReferenceLiteral(
  literalValue: string,
  state: BabelState,
  treatAsSrcSet: boolean
): string | null {
  if (treatAsSrcSet) {
    return rewriteSrcSetLiteral(literalValue, state);
  }

  return rewriteSingleReference(literalValue, state);
}

function rewriteSrcSetLiteral(value: string, state: BabelState): string | null {
  let changed = false;
  const rewritten = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((candidate) => {
      const match = /^(\S+)(\s+.*)?$/.exec(candidate);
      if (!match) {
        return candidate;
      }

      const rawUrl = match[1] ?? "";
      const descriptor = match[2] ?? "";
      const rewrittenUrl = rewriteSingleReference(rawUrl, state);
      if (rewrittenUrl && rewrittenUrl !== rawUrl) {
        changed = true;
        return `${rewrittenUrl}${descriptor}`;
      }

      return candidate;
    })
    .join(", ");

  return changed ? rewritten : null;
}

function rewriteSingleReference(
  rawValue: string,
  state: BabelState
): string | null {
  if (!state.squeezitOptions) {
    return null;
  }

  if (!isLocalAssetReference(rawValue)) {
    return null;
  }

  const sourceFile = state.file.opts.filename;
  if (!sourceFile) {
    throw new Error(
      "[squeezit:babel] Cannot rewrite asset references without a filename."
    );
  }

  const resolvedAsset = resolve(dirname(sourceFile), rawValue);
  const extension = extname(resolvedAsset).toLowerCase();
  if (rawExtensions.has(extension) || !supportedExtensions.has(extension)) {
    return null;
  }

  const cacheKey = `${resolvedAsset}::${state.squeezitOptions.cacheDir}`;
  const cached = state.squeezitBabelCache?.get(cacheKey);
  if (cached) {
    return toImportPath(relative(dirname(sourceFile), cached));
  }

  const projectRoot = process.cwd();
  const targetPath = resolveGeneratedAssetPath(
    resolvedAsset,
    projectRoot,
    state.squeezitOptions.cacheDir
  );

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(resolvedAsset, targetPath, { force: true });
  optimizeGeneratedAsset(
    targetPath,
    projectRoot,
    state.squeezitOptions.checkDependencies
  );

  state.squeezitBabelCache?.set(cacheKey, targetPath);
  return toImportPath(relative(dirname(sourceFile), targetPath));
}

function resolveGeneratedAssetPath(
  assetPath: string,
  projectRoot: string,
  cacheDir: string
): string {
  const canonicalProjectRoot = realpathSync(projectRoot);
  const canonicalAssetPath = realpathSync(assetPath);
  const relativeAssetPath = relative(canonicalProjectRoot, canonicalAssetPath);
  const normalizedRelative = relativeAssetPath.startsWith("..")
    ? join(
        "__external__",
        canonicalAssetPath.replace(/^[A-Za-z]:/, "").replace(/^[/\\]+/, "")
      )
    : relativeAssetPath;

  return resolve(projectRoot, cacheDir, normalizedRelative);
}

function optimizeGeneratedAsset(
  targetPath: string,
  projectRoot: string,
  checkDependencies: boolean
): void {
  const script = [
    "const [modulePath, filePath, cwd, checkDeps] = process.argv.slice(1);",
    "const { optimizeFile } = require(modulePath);",
    "(async () => {",
    "  const result = await optimizeFile(filePath, {",
    "    cwd,",
    '    mode: "default",',
    "    stripMetadata: true,",
    '    checkDependencies: checkDeps === "1",',
    "  });",
    '  if (result.status === "failed") {',
    "    throw new Error(result.message || `Failed to optimize ${filePath}`);",
    "  }",
    "})().catch((error) => {",
    "  console.error(error instanceof Error ? error.message : String(error));",
    "  process.exit(1);",
    "});",
  ].join("\n");

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      script,
      getRootCjsEntryPath(),
      targetPath,
      projectRoot,
      checkDependencies ? "1" : "0",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
    }
  );

  if (result.status !== 0) {
    throw new Error(
      (
        result.stderr ||
        result.stdout ||
        "[squeezit:babel] Failed to optimize generated asset."
      ).trim()
    );
  }
}

function getRootCjsEntryPath(): string {
  const currentDir =
    typeof __dirname === "string"
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));

  return join(currentDir, "index.cjs");
}

function isLocalAssetReference(value: string): boolean {
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("//") ||
    value.startsWith("data:")
  ) {
    return false;
  }

  return value.startsWith("./") || value.startsWith("../");
}

function toImportPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith(".")) {
    return normalized;
  }

  if (isAbsolute(normalized)) {
    return normalized;
  }

  return `./${normalized}`;
}

export default squeezitBabel;
