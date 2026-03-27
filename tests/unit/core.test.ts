import { describe, expect, test } from "vitest";

import { toReportedPath } from "../../src/api";
import { createBufferAsset, createFileAsset } from "../../src/core";
import { collectRequiredDependencies } from "../../src/utils/dependencies";
import {
  buildJxlArgs,
  buildRawDnglabArgs,
  buildZopfliPngArgs,
  canUseBmpRle,
  hasMatchingIcoDimensions,
  isValidBmpRleRewrite,
  parseBmpHeader,
} from "../../src/utils/optimizer";
import { resolveCompressOptions } from "../../src/utils/options";

describe("core assets", () => {
  test("creates buffer assets for future wrapper support", () => {
    const asset = createBufferAsset("hero.png", Buffer.from("hello"));

    expect(asset.kind).toBe("buffer");
    expect(asset.fileName).toBe("hero.png");
    expect(asset.contents.toString("utf8")).toBe("hello");
  });

  test("creates file assets for filesystem-backed optimization", () => {
    const asset = createFileAsset("/tmp/example/image.png");

    expect(asset.kind).toBe("file");
    expect(asset.fileName).toBe("image.png");
    expect(asset.filePath).toBe("/tmp/example/image.png");
  });
});

describe("cli option resolution", () => {
  test("forces threshold zero in max mode", () => {
    const parsed = resolveCompressOptions([], { max: true }, process.cwd());

    expect(parsed.max).toBe(true);
    expect(parsed.stripMeta).toBe(true);
    expect(parsed.exifOnly).toBe(false);
    expect(parsed.threshold).toBe(0);
    expect(parsed.concurrency).toBe(2);
  });

  test("treats exif mode as metadata-only", () => {
    const parsed = resolveCompressOptions([], { exif: true }, process.cwd());

    expect(parsed.max).toBe(false);
    expect(parsed.exifOnly).toBe(true);
    expect(parsed.stripMeta).toBe(true);
  });
});

describe("dependency planning", () => {
  test("collects heavy dependencies for png max mode", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.png",
          displayPath: "sample.png",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining([
        "file",
        "pngcrush",
        "optipng",
        "oxipng",
        "zopflipng",
        "exiftool",
      ])
    );
  });

  test("uses svgo instead of exiftool for svg exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.svg",
          displayPath: "sample.svg",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file", "svgo"]);
  });

  test("does not require exiftool for ico exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.ico",
          displayPath: "sample.ico",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file"]);
  });

  test("does not require exiftool for bmp exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.bmp",
          displayPath: "sample.bmp",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file"]);
  });

  test("requires exiftool for gif metadata stripping", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.gif",
          displayPath: "sample.gif",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining(["file", "gifsicle", "exiftool"])
    );
  });

  test("does not require exiftool for bmp max mode", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.bmp",
          displayPath: "sample.bmp",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining(["file", "magick"])
    );
    expect(dependencies.map((entry) => entry.binary)).not.toContain("exiftool");
  });
});

describe("api path reporting", () => {
  test("converts absolute paths to cwd-relative paths", () => {
    expect(
      toReportedPath("/repo/tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("preserves already-relative paths", () => {
    expect(
      toReportedPath("tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("uses the resolved input display path as a fallback", () => {
    expect(
      toReportedPath(undefined, "/repo", {
        absolutePath: "/repo/tests/fixtures/formats/png/sample.png",
        displayPath: "tests/fixtures/formats/png/sample.png",
      })
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("keeps output paths in the same cwd-relative coordinate system", () => {
    expect(
      toReportedPath("/repo/out/tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("out/tests/fixtures/formats/png/sample.png");
  });
});

describe("raw dng conversion", () => {
  test("uses smallest-lossless dnglab flags in max mode", () => {
    expect(
      buildRawDnglabArgs("/tmp/input/sample.cr2", "/tmp/output/sample.dng")
    ).toEqual([
      "convert",
      "--compression",
      "lossless",
      "--embed-raw",
      "false",
      "--dng-preview",
      "false",
      "--dng-thumbnail",
      "false",
      "/tmp/input/sample.cr2",
      "/tmp/output/sample.dng",
    ]);
  });

  test("adds rw2 predictor tuning when requested", () => {
    expect(
      buildRawDnglabArgs("/tmp/input/sample.rw2", "/tmp/output/sample.dng", 7)
    ).toEqual([
      "convert",
      "--compression",
      "lossless",
      "--embed-raw",
      "false",
      "--dng-preview",
      "false",
      "--dng-thumbnail",
      "false",
      "--ljpeg92-predictor",
      "7",
      "/tmp/input/sample.rw2",
      "/tmp/output/sample.dng",
    ]);
  });
});

describe("jxl optimization", () => {
  test("uses expert mode for max effort 11", () => {
    expect(
      buildJxlArgs("/tmp/input/sample.jxl", "/tmp/output/sample.jxl", 11)
    ).toEqual([
      "--distance=0",
      "--allow_expert_options",
      "--effort=11",
      "/tmp/input/sample.jxl",
      "/tmp/output/sample.jxl",
    ]);
  });

  test("jxl metadata writes allow bmff wrapping", async () => {
    const source = await import("node:fs/promises");
    const code = await source.readFile(
      "/Users/guilhermehaschel/Documents/Workspace/Personal/compress/src/utils/optimizer.ts",
      "utf8"
    );

    expect(code).toContain('args.push("-m")');
  });
});

describe("png max tuning", () => {
  test("uses 10 zopflipng iterations by default and 15 in max mode", () => {
    expect(
      buildZopfliPngArgs("/tmp/input.png", "/tmp/output.png", false)
    ).toEqual([
      "--iterations=10",
      "--filters=01234mepb",
      "/tmp/input.png",
      "/tmp/output.png",
    ]);

    expect(
      buildZopfliPngArgs("/tmp/input.png", "/tmp/output.png", true)
    ).toEqual([
      "--iterations=15",
      "--filters=01234mepb",
      "/tmp/input.png",
      "/tmp/output.png",
    ]);
  });
});

describe("bmp rle support", () => {
  test("parses a 4-bit bmp header", () => {
    const header = parseBmpHeader(createBmpHeaderBuffer(4, 0));

    expect(header).toEqual({
      dibHeaderSize: 40,
      bitsPerPixel: 4,
      compression: 0,
    });
  });

  test("parses an 8-bit bmp header", () => {
    const header = parseBmpHeader(createBmpHeaderBuffer(8, 1));

    expect(header).toEqual({
      dibHeaderSize: 40,
      bitsPerPixel: 8,
      compression: 1,
    });
  });

  test("rejects malformed or non-bmp input", () => {
    expect(parseBmpHeader(Buffer.from("not-a-bmp"))).toBeNull();
  });

  test("only 4-bit and 8-bit bmps are eligible for rle", () => {
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 4,
        compression: 0,
      })
    ).toBe(true);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 8,
        compression: 0,
      })
    ).toBe(true);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 24,
        compression: 0,
      })
    ).toBe(false);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 32,
        compression: 0,
      })
    ).toBe(false);
  });

  test("validates that bmp rewrites preserve bit depth and rle compression", () => {
    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 2 }
      )
    ).toBe(true);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 1 }
      )
    ).toBe(true);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 2 }
      )
    ).toBe(false);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 }
      )
    ).toBe(false);
  });
});

describe("ico safety", () => {
  test("requires rebuilt icons to preserve entry dimensions", () => {
    expect(
      hasMatchingIcoDimensions(
        [
          { index: 1, width: 16, height: 16 },
          { index: 2, width: 32, height: 32 },
        ],
        [
          { index: 1, width: 16, height: 16 },
          { index: 2, width: 24, height: 24 },
        ]
      )
    ).toBe(false);
  });
});

function createBmpHeaderBuffer(
  bitsPerPixel: number,
  compression: number
): Uint8Array {
  const buffer = Buffer.alloc(54);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(54, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(1, 18);
  buffer.writeInt32LE(1, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bitsPerPixel, 28);
  buffer.writeUInt32LE(compression, 30);
  return buffer;
}
