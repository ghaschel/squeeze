# Provider Roadmap v1

## Purpose

Refactor `squeezit` so optimization can run through multiple backend lanes instead of depending primarily on Homebrew-installed native tools.

Target provider lanes:

- `native`: current full-power system-tool backend
- `portable`: npm-installed prebuilt/native-module backend, mainly for Windows and easy installs
- `wasm`: binary-less backend, best-effort subset only
- `auto`: default selector that picks the best available provider per format

This roadmap is intentionally split into small, testable phases so each piece can be implemented independently.

## Global Rules

- Do not silently switch lossless behavior to lossy behavior.
- Every format must have an explicit support policy per provider:
  - `supported`
  - `supported_with_limitations`
  - `unsupported`
  - `skip`
- `auto` must be deterministic and explain why a provider was chosen.
- If a provider cannot safely support a format or feature, skip clearly instead of pretending parity exists.
- `native` remains the reference implementation until each alternative is proven.

## Current Dependency Catalog

From [src/core/dependencies.ts](/Users/guilhermehaschel/Documents/Workspace/Personal/compress/src/core/dependencies.ts):

- `file`
- `jpegtran`
- `jpegrescan`
- `jpegoptim`
- `pngcrush`
- `optipng`
- `zopflipng`
- `oxipng`
- `gifsicle`
- `svgo`
- `cwebp`
- `dwebp`
- `webpinfo`
- `gif2webp`
- `heif-enc`
- `avifenc`
- `tiffcp`
- `magick`
- `exiftool`
- `dnglab`
- `cjxl`
- `icotool`

## Known WASM And Portable Candidates

### Strong candidates

- PNG:
  - `@jSquash/oxipng`
  - `@wasm-codecs/oxipng`
- JPEG:
  - `@jSquash/jpeg`
  - `@wasm-codecs/mozjpeg`
- WebP:
  - `@jSquash/webp`
  - `webp.wasm`
  - `icodec`
- AVIF:
  - `@jSquash/avif`
  - `icodec`
- JXL:
  - `@jSquash/jxl`
  - `icodec`
- HEIF/HEIC:
  - `libheif-js`
  - `icodec`
- Generic transforms:
  - `@imagemagick/magick-wasm`
- Metadata:
  - `@uswriting/exiftool`
- GIF:
  - `@wasm-codecs/gifsicle`
- TIFF:
  - `UTIF.js`
  - `magick-wasm`

### Known weak or missing parity

- `dnglab`
- `icotool`
- true `jpegtran`-style lossless JPEG transform parity
- likely full `tiffcp` parity
- likely `webpinfo` parity

## Plan 1: Provider Architecture And Capability Matrix

### Summary

Introduce provider-aware optimization without changing current output behavior. This is the foundation for every later plan.

### Scope

- Add provider selection to the core:
  - `provider: "auto" | "native" | "portable" | "wasm"`
- Introduce a provider capability registry:
  - by format
  - by feature:
    - optimize
    - strip metadata
    - inspect animation
    - preserve timestamps
- Replace direct dependency-driven branching with provider-driven dispatch.

### Implementation Checklist

- Add provider types to the shared type layer.
- Extend CLI, API, and integration options with `provider`.
- Create provider-layer modules, for example:
  - `src/providers/types.ts`
  - `src/providers/registry.ts`
  - `src/providers/native/*`
  - `src/providers/portable/*`
  - `src/providers/wasm/*`
- Add a capability matrix keyed by:
  - format family
  - provider
  - feature
- Add a provider resolution function:
  - `resolveProviderForFormat(format, options, environment)`
- Add an `auto` provider selection policy with explicit precedence rules.
- Wrap the current implementation as the initial `native` provider without changing behavior.
- Refactor format handlers so provider dispatch is centralized instead of embedded ad hoc in optimizer branches.
- Ensure provider decisions are surfaced in verbose output.
- Add explicit skip reasons when the selected provider does not support a requested format/feature.

### Test Checklist

- Add unit tests for provider type parsing and defaults.
- Add unit tests for capability matrix completeness.
- Add unit tests for `resolveProviderForFormat(...)`.
- Add CLI parameter tests for `--provider`.
- Add API tests for `provider` option forwarding.
- Add regression tests proving `provider: "native"` preserves current behavior.
- Add `auto` selection tests for:
  - available native only
  - available portable only
  - available wasm only
  - no viable provider

### Acceptance Criteria

- `native` behaves exactly like the current implementation.
- `auto` resolves deterministically.
- Every format has an explicit provider policy entry.
- Provider choice is inspectable in tests and verbose output.

### Risks

- Refactor breadth is high.
- Incomplete capability data will make `auto` misleading.

## Plan 2: Portable Provider For Cross-Platform npm Installs

### Summary

Build the main non-system dependency provider using npm-installed modules and prebuilt/native-module packages. This is the main Windows and low-friction install path.

### Scope

Use `sharp` as the primary portability reducer where safe, plus JS/native-module packages where `sharp` is not enough.

### Target Formats

- JPEG
- PNG
- WebP
- AVIF
- TIFF
- GIF metadata stripping or conservative pass-through
- SVG
- optionally BMP as a conservative path
- optionally ICO as read/skip initially

### Explicit Non-Goals For v1

- RAW
- DNG
- exact ICO rebuilding
- exact JXL same-format optimization unless proven safe

### Implementation Checklist

- Add a `portable` provider directory and format handlers.
- Introduce `sharp`-based handlers where behavior can be kept lossless or explicitly conservative.
- Keep `svgo` as the SVG path.
- Replace `file`-style inspection with JS sniffing where possible:
  - magic number detection
  - APNG chunk detection
  - BMP and ICO header checks
- Define exact portable behavior for each supported format:
  - optimize
  - metadata stripping
  - skip rules
- Ensure unsupported formats skip clearly under `portable`.
- Add Windows install documentation centered on npm-only setup.
- Keep `portable` out of `auto` for any format that has not yet met parity expectations.
- Reuse existing fixture expectations where possible, and split expectations when provider-specific outputs differ.

### Test Checklist

- Add `tests/integration/providers/portable.test.ts`.
- Run supported fixture corpus under `provider: "portable"`.
- Add explicit skip tests for unsupported formats.
- Add Windows-oriented smoke coverage where feasible.
- Add tests proving metadata stripping still happens for portable-supported formats.
- Add tests proving no system binary lookup is required for portable-only flows.
- Add negative tests for unsupported RAW and DNG flows.

### Acceptance Criteria

- Supported formats work on macOS, Linux, and Windows without Homebrew or `apt`.
- Unsupported formats skip or fail clearly.
- `portable` support claims are documented per format.

### Risks

- `sharp` does not offer exact parity with current native tools.
- Some formats may need to remain metadata-only or skip-only.

## Plan 3: Native Provider Cleanup For Linux And Windows Packaging

### Summary

Keep `native` as the full-coverage path, but make installation and package guidance OS-aware beyond Homebrew and Debian. Add a realistic Windows-native story where binaries actually exist.

### Scope

- macOS Homebrew
- Debian and Ubuntu `apt`
- Fedora and RHEL `dnf`
- Arch `pacman`
- Windows:
  - `winget`
  - `choco`
  - manual binary download guidance when needed

### Implementation Checklist

- Extend dependency catalog entries with package-manager-specific fields:
  - `dnfPackage`
  - `pacmanPackage`
  - `wingetPackage`
  - `chocoPackage`
  - `manualInstallUrl`
- Separate OS detection from package-manager detection.
- Add Windows support policy per dependency.
- Update dependency installer logic to support more platforms where safe.
- Improve missing dependency messaging with OS-specific install commands.
- Add a provider-aware “doctor” or improve current dependency diagnostics.
- Make `auto` prefer `portable` over `native` on platforms where native coverage is poor.
- Document which native dependencies are unsupported on Windows.

### Test Checklist

- Add unit tests for OS and package-manager detection.
- Add unit tests for install command suggestion formatting.
- Add snapshot tests for missing dependency guidance on:
  - macOS
  - Debian/Ubuntu
  - Fedora/RHEL
  - Arch
  - Windows
- Add smoke tests for native dependency planning per platform.
- Add provider-resolution tests proving Windows can fall back away from `native`.

### Acceptance Criteria

- Native install guidance is platform-specific and accurate.
- Unsupported native dependencies on Windows are not implied to work.
- `auto` avoids native dead ends when a better provider exists.

### Risks

- Package availability differs across distributions.
- Windows binaries may be incomplete or outdated.

## Plan 4: WASM Provider For Binary-Less Operation

### Summary

Add a true binary-less provider using WASM packages, but only for formats where it is viable. This provider should be explicit, honest, and narrower than `native`.

### Scope

Support only formats with real WASM viability:

- JPEG
- PNG
- WebP
- AVIF
- JXL
- some HEIF/HEIC
- SVG
- some metadata workflows

### Candidate Packages

- JPEG:
  - `@jSquash/jpeg`
  - `@wasm-codecs/mozjpeg`
- PNG:
  - `@jSquash/oxipng`
  - `@wasm-codecs/oxipng`
- WebP:
  - `@jSquash/webp`
  - `webp.wasm`
  - `icodec`
- AVIF:
  - `@jSquash/avif`
- JXL:
  - `@jSquash/jxl`
- HEIF/HEIC:
  - `libheif-js`
  - `icodec`
- Generic transforms:
  - `@imagemagick/magick-wasm`
- Metadata:
  - `@uswriting/exiftool`
- SVG:
  - `svgo`

### Explicit Unsupported Or Likely Skip

- RAW / `dnglab`
- ICO / `icotool`
- exact `jpegtran` parity
- likely full `tiffcp` parity
- some GIF workflows if parity is too weak

### Implementation Checklist

- Add lazy-loaded `wasm` provider modules.
- Add package selection per format instead of a single monolithic WASM backend.
- Add memory and concurrency guardrails for WASM operations.
- Add provider-specific skip rules for unsafe or unsupported formats.
- Add clear user-facing notes that `wasm` is best-effort and not parity-complete.
- Keep metadata stripping separate from optimization if a format only supports one of them safely.
- Decide whether `wasm` should be opt-in only for the first release.
- Add performance notes and warnings where operations are substantially slower.

### Test Checklist

- Add `tests/integration/providers/wasm.test.ts`.
- Add reduced fixture coverage for every claimed supported format.
- Add explicit skip assertions for unsupported formats.
- Add tests proving no system binaries are required.
- Add tests proving `wasm` does not silently rewrite unsafe formats.
- Add provider-resolution tests for `provider: "wasm"` and `provider: "auto"` interactions.
- Add tests for memory-limited or concurrency-limited behavior if the implementation exposes those controls.

### Acceptance Criteria

- `wasm` runs without system binaries installed.
- Claimed supported formats work end-to-end.
- Unsupported formats skip clearly.
- The docs do not overstate parity.

### Risks

- Performance may be much worse than native.
- Node and WASM packaging can be brittle.
- Some packages may be less actively maintained than native tools.

## Plan 5: Detection, Metadata, And Dependency De-Nativization

### Summary

Reduce the native dependency count further by removing helpers that should not need native binaries at all.

### Scope

Main targets:

- `file`
- parts of `exiftool`
- parts of `magick`
- generic format detection logic

### Implementation Checklist

- Replace `file` binary usage with JS-based sniffing and header parsing.
- Consolidate and extend existing format detection logic:
  - PNG and APNG chunk detection
  - BMP header inspection
  - ICO header inspection
  - TIFF signature parsing
  - JXL signature parsing
  - HEIF brand sniffing
- Split metadata behavior into explicit capabilities:
  - read metadata
  - strip metadata
  - write metadata
- Move metadata read and simple strip operations to JS or WASM where safe.
- Reclassify dependencies into:
  - core dependencies
  - provider-specific dependencies
  - feature-specific dependencies
- Reduce “always required” dependency assumptions in CLI and API planning.
- Document any metadata operations that remain native-only.

### Test Checklist

- Add unit tests for every file sniffer and parser.
- Replace `file`-dependent tests with JS detector tests.
- Add metadata capability tests per provider.
- Add regression tests for APNG, BMP, ICO, TIFF, HEIF, AVIF, and JXL detection.
- Add tests proving dependency collection no longer requires `file` as a universal dependency.

### Acceptance Criteria

- `file` is no longer a hard core dependency.
- Format detection works from JS consistently.
- Metadata support is provider-aware and explicit.

### Risks

- Edge-case format detection can be subtle.
- Metadata parity must be documented very carefully.

## Plan 6: CI Matrix, Documentation, Release Strategy, And Migration

### Summary

Make the multi-provider system shippable, testable, and understandable.

### Scope

- CI matrix
- release strategy
- documentation
- migration guidance
- provider acceptance matrix

### Implementation Checklist

- Add CI jobs for:
  - macOS + `native`
  - Linux + `native`
  - Windows + `portable`
  - one binary-less `wasm` job
- Add provider-specific fixture expectation support where outputs differ.
- Publish a support matrix:
  - format vs provider
  - optimize vs metadata stripping vs max
  - stable vs experimental
- Add migration docs for:
  - `--provider native`
  - `--provider portable`
  - `--provider wasm`
  - `--provider auto`
- Update plugin and wrapper docs to explain provider inheritance.
- Decide and document default provider behavior for integrations.
- Add release notes policy:
  - `native` remains reference
  - `portable` promoted format by format
  - `wasm` remains opt-in until stable
- Add a changelog or release checklist item for provider support changes.

### Test Checklist

- Add CI-level acceptance checks by provider and OS.
- Add smoke tests for Vite, Webpack, Next, Gulp, Grunt, esbuild, and Babel using non-native providers where supported.
- Add packaging tests for npm install on Windows/Linux without Homebrew.
- Add docs tests ensuring provider matrix references stay aligned with exports and behavior.
- Add regression tests for `auto` selection in integration contexts.

### Acceptance Criteria

- Every provider has documented guarantees and limits.
- CI proves the advertised support matrix.
- Users can choose a provider intentionally, and `auto` behaves predictably.

### Risks

- Fixture expectations may diverge between providers.
- Documentation can go stale without central maintenance.

## Recommended Implementation Order

1. Plan 1: Provider architecture and capability matrix
2. Plan 5: Detection, metadata, and dependency de-nativization
3. Plan 2: Portable provider
4. Plan 3: Native provider cleanup
5. Plan 4: WASM provider
6. Plan 6: CI, docs, release strategy, and migration

## Recommended First Deliverable

If implementing this incrementally, the safest first deliverable is:

- provider option plumbing
- provider registry
- capability matrix
- `native` provider shim that preserves current behavior

That creates the foundation for every later phase without changing optimization results.

## Notes For Future Updates

When updating this roadmap later:

- keep provider claims explicit by format and feature
- prefer narrowing support over overstating parity
- add new WASM or portable candidates only after verifying maintenance status and Node compatibility
- treat Windows support as a product requirement, not just a package-manager field
