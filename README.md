<p align="center">
  <img src="https://raw.githubusercontent.com/ghaschel/squeeze/main/assets/squeezit-logo.svg" alt="squeezit logo" width="80%" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ghaschel/squeeze/main/assets/squeezit-wordmark.svg" alt="Squeezit" width="440" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/v/squeezit.svg?color=0f766e&label=npm" alt="npm version" style="margin-right: 10px;"></a>
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/dm/squeezit.svg?color=1d4ed8&label=downloads" alt="npm downloads" style="margin-right: 10px;"></a>
  <a href="https://github.com/ghaschel/squeeze/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/squeezit.svg?color=334155&label=license" alt="license"></a>
</p>

`squeezit` is a CLI for aggressively compressing images without casually degrading them. It is designed for codebases, asset folders, and content repositories where you want smaller files, predictable behavior, and a command you can trust in day-to-day workflows.

It supports direct file paths, shell-style patterns like `*.png`, glob expressions like `images/**/*.webp`, and a no-argument mode that scans supported image files in the current directory. Recursive scanning is available when you ask for it.

## Why Squeezit

- Lossless-first workflow across common web and design formats
- APNG, JXL, and ICO support alongside common web asset formats
- Friendly CLI output with clear summaries, skips, and failures
- Safe threshold-based replacement so tiny wins do not churn your files
- Pattern matching that works with both regular shell parameters and glob expressions
- Works well as a local cleanup tool before commits or releases
- Published for Node users, while Bun remains the development and build toolchain

## Installation

### npm

```bash
npm install -g squeezit
```

### bun

```bash
bun add -g squeezit
```

After installation, both commands are available:

```bash
squeezit --help
sqz --help
```

## Quick Start

Compress supported images in the current directory:

```bash
squeezit
```

Preview changes without modifying files:

```bash
squeezit -d
```

Strip metadata only, without recompressing:

```bash
squeezit --exif
```

Target only top-level PNGs:

```bash
squeezit "*.png"
```

Target nested files with glob expressions:

```bash
squeezit -r "images/**/*.{png,jpg,webp}"
```

Optimize an icon container in dry-run mode:

```bash
squeezit favicon.ico -d
```

Run the shorter alias:

```bash
sqz -r assets/**/*.jpg -d
```

Check for a newer published version:

```bash
squeezit --check-update
```

Self-update to the latest release:

```bash
squeezit -U
```

## Integrations

`squeezit` is now structured to expose first-party integrations from the same package.

Available today:

- Root JS/TS API via `import { optimizeFile, optimizeFiles, stripMetadata } from "squeezit"`
- Gulp plugin via `import { squeezitGulp } from "squeezit/gulp"`
- Vite plugin via `import { squeezitVite } from "squeezit/vite"`
- Webpack plugin via `import { squeezitWebpack } from "squeezit/webpack"`
- Next.js wrapper via `import { withSqueezit } from "squeezit/next"`

Planned package subpaths:

- `squeezit/grunt`
- `squeezit/rollup`
- `squeezit/esbuild`

The subpath exports are reserved now so future wrappers can ship without forcing a package split. For now, the supported programmatic integration surfaces are the root JS/TS API, the Gulp plugin, the Vite plugin, the Webpack plugin, and the Next.js wrapper.

### Gulp

```js
const { src, dest } = require("gulp");
const { squeezitGulp } = require("squeezit/gulp");

exports.images = function images() {
  return src("assets/**/*").pipe(squeezitGulp()).pipe(dest("dist/assets"));
};
```

The Gulp plugin runs as a Vinyl transform, uses the default compression strategy, and always enables metadata stripping. v1 supports buffered Vinyl files and path-backed Vinyl files, and rejects streaming contents with a clear error. It does not expose or use `max` mode.

### Vite

```ts
import { defineConfig } from "vite";
import { squeezitVite } from "squeezit/vite";

export default defineConfig({
  plugins: [squeezitVite()],
});
```

The Vite plugin runs only for production builds, optimizes emitted assets from the output directory, uses the default compression strategy, and always enables metadata stripping. It does not expose or use `max` mode.

### Webpack

```ts
const { squeezitWebpack } = require("squeezit/webpack");

module.exports = {
  plugins: [squeezitWebpack()],
};
```

The Webpack plugin runs after assets are written to the configured output directory, optimizes emitted image files from that directory, uses the default compression strategy, and always enables metadata stripping. It does not expose or use `max` mode.

### Next.js

```js
const { withSqueezit } = require("squeezit/next");

module.exports = withSqueezit({
  webpack(config) {
    return config;
  },
});
```

The Next.js wrapper augments webpack-based Next builds by injecting the `squeezit` Webpack plugin through `next.config.js`/`next.config.ts`. It uses the default compression strategy, always enables metadata stripping, and does not expose or use `max` mode.

Turbopack support is not included in this wrapper yet. It is planned and coming soon, but this integration currently targets Next’s webpack build pipeline only.

The fixture-value helper and JS/TS API report `filePath` and `outputPath` relative to the effective `cwd`, not as absolute machine-specific paths.

## Documentation

- [API reference](https://github.com/ghaschel/squeeze/blob/main/docs/API.md)

### Usage

```bash
squeezit [patterns...] [options]
```

### Pattern Resolution

- Pass explicit file paths like `hero.png`
- Pass shell-style parameters like `*.png`
- Pass glob expressions like `images/**/*.webp`
- Pass directories like `assets`
- If no file parameter is provided, `squeezit` scans supported image files in the current directory
- Scanning is non-recursive by default; use `-r, --recursive` to traverse subdirectories
- Discovery includes APNG (`.apng`), JPEG XL (`.jxl`), and ICO (`.ico`) files

### Options

| Option                    | Description                                                                           | Default                        |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| `-r, --recursive`         | Recurse into directories when scanning inputs                                         | `false`                        |
| `-m, --max`               | Use the heaviest lossless compression passes, strip metadata, and force threshold `0` | `false`                        |
| `-s, --strip-meta`        | Remove EXIF, IPTC, and XMP metadata during compression                                | `false`                        |
| `--exif`                  | Only strip EXIF/IPTC/XMP metadata without recompressing                               | `false`                        |
| `-d, --dry-run`           | Show what would change without writing files                                          | `false`                        |
| `-k, --keep-time`         | Preserve original access and modification timestamps                                  | `false`                        |
| `-c, --concurrency <n>`   | Set worker concurrency manually                                                       | CPU count, or `2` with `--max` |
| `-I, --install-deps`      | Attempt to install missing system tools                                               | `false`                        |
| `-U, --update`            | Update `squeezit` to the latest published version                                     | `false`                        |
| `--check-update`          | Check whether a newer published version exists                                        | `false`                        |
| `--pm <manager>`          | Override the package manager used for self-update                                     | auto-detected when possible    |
| `-v, --verbose`           | Print additional diagnostic details                                                   | `false`                        |
| `-t, --threshold <bytes>` | Minimum savings required before replacing a file                                      | `100`                          |
| `-i, --in-place`          | Create temporary work artifacts next to the source files                              | `false`                        |
| `-V, --version`           | Print the current version                                                             | n/a                            |
| `-h, --help`              | Show CLI help                                                                         | n/a                            |

### Examples

Preview everything under the current directory:

```bash
squeezit -d
```

Compress a single file:

```bash
squeezit ./images/cover.png
```

Compress every JPEG under `assets`, but only if the win is at least 1 KB:

```bash
squeezit -r "assets/**/*.jpg" -t 1024
```

Use the heaviest compression strategy:

```bash
squeezit -r "images/**/*" -m
```

Strip metadata only:

```bash
squeezit --exif "photos/**/*.{jpg,tiff,heic}"
```

Preserve timestamps while stripping metadata:

```bash
squeezit -r "photos/**/*.{jpg,tiff,heic}" -s -k
```

Dry-run a JPEG XL file:

```bash
squeezit artwork.jxl -d
```

Modernize an ICO while preserving its icon sizes:

```bash
squeezit app.ico
```

Update the global installation explicitly with npm:

```bash
squeezit -U --pm npm
```

## Supported Inputs

Squeezit currently matches these file extensions during discovery:

- `jpg`, `jpeg`
- `png`, `apng`
- `gif`
- `webp`
- `svg`
- `tif`, `tiff`
- `heic`, `heif`
- `avif`
- `bmp`
- `jxl`
- `ico`
- `cr2`, `nef`, `arw`, `raf`, `orf`, `rw2`

Internally, compression behavior is determined with MIME detection where applicable, not only by extension.

## Supported Formats

Squeezit currently supports these image format families:

- `JPEG` (`.jpg`, `.jpeg`): fast lossless optimization by default, heavier passes in `--max`
- `PNG` (`.png`): fast `oxipng` optimization by default, heavier candidate comparison in `--max`
- `APNG` (`.apng`, animated PNG payloads): optimized losslessly with `oxipng`
- `GIF` (`.gif`): fast lossless optimization by default, strongest `gifsicle` pass in `--max`
- `WebP` (`.webp`): lossless re-encode, with heavier encoder settings in `--max`, including animated WebP handling
- `SVG` (`.svg`): single-pass optimization by default, multipass in `--max`
- `TIFF` (`.tif`, `.tiff`): lossless ZIP recompression, with a heavier ZIP preset in `--max`
- `HEIF / HEIC` (`.heif`, `.heic`): lossless re-encode, with a slower encoder preset in `--max`
- `AVIF` (`.avif`): lossless re-encode, with a slower encoder speed in `--max`
- `BMP` (`.bmp`): lossless RLE recompression for source 4-bit and 8-bit BMPs only; higher-bit BMPs are skipped
- `JPEG XL` (`.jxl`): lossless re-encode, with a faster default pass and multi-effort candidate comparison in `--max`
- `ICO` (`.ico`): modernized by extracting embedded icon images, optimizing them, and rebuilding the icon container while preserving the original entry dimensions; if the rebuilt icon changes the dimension set, it is skipped
- `RAW camera files` (`.cr2`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`): metadata stripping in `--exif` mode, optional RAW-to-DNG conversion in `--max` mode using the smallest lossless DNG settings

Notes:

- If a lossless result is larger, the file is skipped and never replaced
- `--exif` is metadata-only mode and does not run recompression pipelines
- `--max` always strips metadata in addition to raising encoder effort across the supported recompression pipelines
- `--max` forces the replacement threshold to `0`, so any positive lossless reduction is accepted
- ICO support is focused on modernizing containers while preserving icon sizes, not preserving original legacy BMP-style encoding byte-for-byte
- BMP metadata-only writing is not supported; BMP optimization only rewrites eligible indexed BMP image data
- RAW files are special-case inputs and only convert to `.dng` in `--max` mode
- RAW `--max` conversion now targets the smallest lossless DNG by disabling embedded RAW, preview, and thumbnail payloads; `.rw2` inputs also try the available lossless JPEG predictor variants and keep the smallest result

## System Dependencies

Squeezit orchestrates native image tools based on the inputs you actually process. It may require binaries such as:

- `file`
- `jpegtran`, `jpegrescan`, `jpegoptim`
- `pngcrush`, `optipng`, `zopflipng`, `oxipng`
- `gifsicle`
- `svgo`
- `cwebp`, `dwebp`, `webpinfo`, `gif2webp`
- `heif-enc`
- `avifenc`
- `tiffcp`
- `magick`
- `exiftool`
- `cjxl`
- `icotool`
- `dnglab` for RAW to DNG conversion in `--max` mode

Not every run needs every tool. Dependency checks are format-aware, so `squeezit` only asks for the binaries needed for the files you matched.

## Self-Update

Squeezit can check for a new published version and update itself:

```bash
squeezit --check-update
squeezit -U
```

Installer detection works like this:

- On install, `squeezit` records whether it was installed by `npm` or `bun` in its config metadata
- On update, it reuses that persisted installer when available
- If detection is ambiguous, pass `--pm npm` or `--pm bun`

Examples:

```bash
squeezit -U --pm npm
squeezit -U --pm bun
```

If dependencies are missing, you can ask `squeezit` to install them:

```bash
squeezit --install-deps
```

Supported installation targets:

- macOS via Homebrew
- Debian/Ubuntu via APT

## Development

This project publishes a Node-targeted CLI, but uses Bun for local development.

Install dependencies:

```bash
bun install
```

Run the source CLI:

```bash
bun run index.ts --help
```

Build the published artifact:

```bash
bun run build
```

Run the compiled CLI locally:

```bash
node ./dist/index.js --help
```

Validate the project:

```bash
bun run typecheck
bun test
```

## License

[MIT](https://github.com/ghaschel/squeeze/blob/main/LICENSE)
