# API

`squeezit` now exposes a programmatic JS/TS API for file-based workflows.

## Installation

```bash
npm install squeezit
```

## Importing

```ts
import {
  getOptimizationFixtureValues,
  optimizeFile,
  optimizeFiles,
  stripMetadata,
} from "squeezit";
```

## Public Functions

### `optimizeFile(input, options?)`

Optimizes a single file and returns a structured result.

```ts
const result = await optimizeFile("assets/hero.png", {
  mode: "default",
});
```

### `optimizeFiles(inputs, options?)`

Optimizes multiple files, directories, or patterns and returns batch results plus a summary.

```ts
const result = await optimizeFiles(["images", "*.png"], {
  recursive: true,
  mode: "max",
});
```

### `stripMetadata(input, options?)`

Runs EXIF/IPTC/XMP stripping only.

```ts
const result = await stripMetadata("photos/hero.jpg", {
  outputDir: "dist/images",
});
```

### `getOptimizationFixtureValues(input, options?)`

Runs a single optimization scenario and returns the values needed to update fixture assertions.

```ts
const values = await getOptimizationFixtureValues(
  "tests/fixtures/formats/png/sample.png",
  {
    mode: "default",
  }
);
```

## Main Options

```ts
type OptimizeFileOptions = {
  mode?: "default" | "exif" | "max";
  stripMetadata?: boolean;
  outputDir?: string;
  dryRun?: boolean;
  keepTime?: boolean;
  threshold?: number;
  checkDependencies?: boolean;
  cwd?: string;
};
```

`optimizeFiles()` also accepts:

```ts
type OptimizeFilesOptions = OptimizeFileOptions & {
  recursive?: boolean;
  concurrency?: number;
};
```

## Write Behavior

- No `outputDir`: the API works in place
- With `outputDir`: the source file is preserved and the output is written under that directory
- `dryRun: true`: no output file is written

For multi-file operations, `outputDir` preserves each resolved file’s relative path when possible.

## Modes

- `default`: the normal fast lossless strategy
- `exif`: metadata-only stripping
- `max`: the heaviest lossless strategy, with metadata stripping enabled and threshold forced to `0`

For RAW inputs (`.cr2`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`), `max` converts to the smallest lossless DNG currently configured by disabling embedded RAW, preview, and thumbnail payloads. `.rw2` inputs additionally try the available lossless JPEG predictor variants and keep the smallest DNG candidate.

For JPEG XL inputs, `max` benchmarks multiple lossless `cjxl` effort levels, including expert effort 11, and keeps the smallest output.

For ICO inputs, optimization is skipped if rebuilding the icon changes the original entry dimensions.

For BMP inputs, optimization only attempts lossless RLE rewriting when the source BMP is already 4-bit or 8-bit. Higher-bit BMPs are skipped rather than quantized. Metadata-only writing is not supported for BMP.

## Result Shape

Each single-file operation returns a structured result like:

```ts
type ApiOptimizationResult = {
  filePath: string;
  outputPath: string;
  label: string;
  mode: "default" | "exif" | "max";
  status: "optimized" | "skipped" | "failed" | "dry-run";
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  changed: boolean;
  wroteOutput: boolean;
  message?: string;
};
```

`filePath` and `outputPath` are reported relative to the effective `cwd` used for the API call.

## Fixture Value Utility

The package exports `getOptimizationFixtureValues()` for tests, and the repo also includes a script wrapper:

```bash
bun run fixture-values -- --mode default tests/fixtures/formats/png/sample.png
```

For multiple files:

```bash
bun run fixture-values -- --mode max tests/fixtures/formats/png/sample.png tests/fixtures/formats/jpeg/sample.jpg
```

Use that output to replace the placeholder expected sizes and statuses in the fixture manifest used by the integration tests.
