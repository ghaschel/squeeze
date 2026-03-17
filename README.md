<p align="center">
  <img src="./assets/squeezit-logo.svg" alt="squeezit logo" width="220" />
</p>

<p align="center">
  <img src="./assets/squeezit-wordmark.svg" alt="Squeezit" width="280" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/v/squeezit.svg?color=0f766e&label=npm" alt="npm version" style="margin-right: 10px;"></a>
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/dm/squeezit.svg?color=1d4ed8&label=downloads" alt="npm downloads" style="margin-right: 10px;"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/squeezit.svg?color=334155&label=license" alt="license"></a>
</p>

`squeezit` is a CLI for aggressively compressing images without casually degrading them. It is designed for codebases, asset folders, and content repositories where you want smaller files, predictable behavior, and a command you can trust in day-to-day workflows.

It supports direct file paths, shell-style patterns like `*.png`, glob expressions like `images/**/*.webp`, and a no-argument mode that scans supported image files in the current directory. Recursive scanning is available when you ask for it.

## Why Squeezit

- Lossless-first workflow across common web and design formats
- Friendly CLI output with clear summaries
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
squeezit -d -v
```

Target only top-level PNGs:

```bash
squeezit "*.png"
```

Target nested files with glob expressions:

```bash
squeezit -r "images/**/*.{png,jpg,webp}"
```

Run the shorter alias:

```bash
sqz -r assets/**/*.jpg -d
```

## Documentation

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

### Options

| Option                    | Description                                               | Default                        |
| ------------------------- | --------------------------------------------------------- | ------------------------------ |
| `-r, --recursive`         | Recurse into directories when scanning inputs             | `false`                        |
| `-m, --max`               | Enable slower, heavier compression passes where available | `false`                        |
| `-s, --strip-meta`        | Remove EXIF, IPTC, and XMP metadata after optimization    | `false`                        |
| `-d, --dry-run`           | Show what would change without writing files              | `false`                        |
| `-k, --keep-time`         | Preserve original access and modification timestamps      | `false`                        |
| `-c, --concurrency <n>`   | Set worker concurrency manually                           | CPU count, or `2` with `--max` |
| `-I, --install-deps`      | Attempt to install missing system tools                   | `false`                        |
| `-v, --verbose`           | Print skipped files and additional details                | `false`                        |
| `-t, --threshold <bytes>` | Minimum savings required before replacing a file          | `100`                          |
| `-i, --in-place`          | Create temporary work artifacts next to the source files  | `false`                        |
| `-V, --version`           | Print the current version                                 | n/a                            |
| `-h, --help`              | Show CLI help                                             | n/a                            |

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

Preserve timestamps while stripping metadata:

```bash
squeezit -r "photos/**/*.{jpg,tiff,heic}" -s -k
```

## Supported Inputs

Squeezit currently matches these file extensions during discovery:

- `jpg`, `jpeg`
- `png`
- `gif`
- `webp`
- `svg`
- `tif`, `tiff`
- `heic`, `heif`
- `avif`
- `bmp`
- `cr2`, `nef`, `arw`, `raf`, `orf`, `rw2`

Internally, compression behavior is determined with MIME detection where applicable, not only by extension.

## System Dependencies

Squeezit orchestrates best-in-class native image tools. Depending on the formats you process, it may require binaries such as:

- `file`
- `jpegtran`, `jpegrescan`, `jpegoptim`
- `pngcrush`, `optipng`, `zopflipng`
- `gifsicle`
- `svgo`
- `cwebp`, `dwebp`, `webpinfo`, `gif2webp`
- `heif-enc`
- `avifenc`
- `tiffcp`
- `magick`
- `exiftool`
- `dnglab` for RAW to DNG conversion in `--max` mode

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

[MIT](./LICENSE)
