import { join } from "node:path";

import type { ApiOptimizationMode } from "../../src/types";

export const PLACEHOLDER_SIZE = -1;

export interface FixtureExpectation {
  status: "optimized" | "skipped" | "failed" | "dry-run";
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
}

export interface FormatFixture {
  format: string;
  relativePath: string;
  expectations: Record<ApiOptimizationMode, FixtureExpectation>;
}

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "formats");

export const formatFixtures: FormatFixture[] = [
  {
    format: "jpg",
    relativePath: "jpeg/sample.jpg",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 555181,
        optimizedSize: 544004,
        savedBytes: 11177,
      },
      exif: {
        status: "optimized",
        originalSize: 555181,
        optimizedSize: 552001,
        savedBytes: 3180,
      },
      max: {
        status: "optimized",
        originalSize: 555181,
        optimizedSize: 540792,
        savedBytes: 14389,
      },
    },
  },
  {
    format: "jpeg",
    relativePath: "jpeg/sample.jpeg",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 768552,
        optimizedSize: 701357,
        savedBytes: 67195,
      },
      exif: {
        status: "optimized",
        originalSize: 768552,
        optimizedSize: 768534,
        savedBytes: 18,
      },
      max: {
        status: "optimized",
        originalSize: 768552,
        optimizedSize: 701324,
        savedBytes: 67228,
      },
    },
  },
  {
    format: "png",
    relativePath: "png/sample.png",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 1006708,
        optimizedSize: 945583,
        savedBytes: 61125,
      },
      exif: {
        status: "optimized",
        originalSize: 1006708,
        optimizedSize: 1004029,
        savedBytes: 2679,
      },
      max: {
        status: "optimized",
        originalSize: 1006708,
        optimizedSize: 942617,
        savedBytes: 64091,
      },
    },
  },
  {
    format: "apng",
    relativePath: "apng/sample.png",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 370648,
        optimizedSize: 330000,
        savedBytes: 40648,
      },
      exif: {
        status: "optimized",
        originalSize: 370648,
        optimizedSize: 367772,
        savedBytes: 2876,
      },
      max: {
        status: "optimized",
        originalSize: 370648,
        optimizedSize: 1582,
        savedBytes: 369066,
      },
    },
  },
  {
    format: "gif",
    relativePath: "gif/sample.gif",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 2166038,
        optimizedSize: 2150031,
        savedBytes: 16007,
      },
      exif: {
        status: "optimized",
        originalSize: 2166038,
        optimizedSize: 962901,
        savedBytes: 1203137,
      },
      max: {
        status: "optimized",
        originalSize: 2166038,
        optimizedSize: 943960,
        savedBytes: 1222078,
      },
    },
  },
  {
    format: "webp",
    relativePath: "webp/sample.webp",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 1720734,
        optimizedSize: 1359732,
        savedBytes: 361002,
      },
      exif: {
        status: "optimized",
        originalSize: 1720734,
        optimizedSize: 517842,
        savedBytes: 1202892,
      },
      max: {
        status: "optimized",
        originalSize: 1720734,
        optimizedSize: 1359732,
        savedBytes: 361002,
      },
    },
  },
  {
    format: "svg",
    relativePath: "svg/sample.svg",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 85737,
        optimizedSize: 81294,
        savedBytes: 4443,
      },
      exif: {
        status: "optimized",
        originalSize: 85737,
        optimizedSize: 83055,
        savedBytes: 2682,
      },
      max: {
        status: "optimized",
        originalSize: 85737,
        optimizedSize: 81284,
        savedBytes: 4453,
      },
    },
  },
  {
    format: "heif",
    relativePath: "heif/sample.heif",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 941666,
        savedBytes: 1206150,
      },
      exif: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 944951,
        savedBytes: 1202865,
      },
      max: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 942035,
        savedBytes: 1205781,
      },
    },
  },
  {
    format: "heic",
    relativePath: "heif/sample.heic",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 941666,
        savedBytes: 1206150,
      },
      exif: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 944951,
        savedBytes: 1202865,
      },
      max: {
        status: "optimized",
        originalSize: 2147816,
        optimizedSize: 942035,
        savedBytes: 1205781,
      },
    },
  },
  {
    format: "avif",
    relativePath: "avif/sample.avif",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 3797505,
        optimizedSize: 2465189,
        savedBytes: 1332316,
      },
      exif: {
        status: "optimized",
        originalSize: 3797505,
        optimizedSize: 2594640,
        savedBytes: 1202865,
      },
      max: {
        status: "optimized",
        originalSize: 3797505,
        optimizedSize: 2319973,
        savedBytes: 1477532,
      },
    },
  },
  {
    format: "bmp",
    relativePath: "bmp/sample.bmp",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 1001078,
        optimizedSize: 11080,
        savedBytes: 989998,
      },
      exif: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      max: {
        status: "optimized",
        originalSize: 1001078,
        optimizedSize: 11080,
        savedBytes: 989998,
      },
    },
  },
  {
    format: "jxl",
    relativePath: "jxl/sample.jxl",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 2155326,
        optimizedSize: 730610,
        savedBytes: 1424716,
      },
      exif: {
        status: "optimized",
        originalSize: 2155326,
        optimizedSize: 952453,
        savedBytes: 1202873,
      },
      max: {
        status: "optimized",
        originalSize: 2155326,
        optimizedSize: 703307,
        savedBytes: 1452019,
      },
    },
  },
  {
    format: "ico",
    relativePath: "ico/sample.ico",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 180638,
        optimizedSize: 76365,
        savedBytes: 104273,
      },
      exif: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      max: {
        status: "optimized",
        originalSize: 180638,
        optimizedSize: 76127,
        savedBytes: 104511,
      },
    },
  },
  {
    format: "arw",
    relativePath: "raw/sample.arw",
    expectations: {
      default: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      exif: {
        status: "optimized",
        originalSize: 24746752,
        optimizedSize: 24738982,
        savedBytes: 7770,
      },
      max: {
        status: "optimized",
        originalSize: 24746752,
        optimizedSize: 20644438,
        savedBytes: 4102314,
      },
    },
  },
  {
    format: "cr2",
    relativePath: "raw/sample.cr2",
    expectations: {
      default: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      exif: {
        status: "optimized",
        originalSize: 23187950,
        optimizedSize: 23177706,
        savedBytes: 10244,
      },
      max: {
        status: "optimized",
        originalSize: 23187950,
        optimizedSize: 21367518,
        savedBytes: 1820432,
      },
    },
  },
  {
    format: "nef",
    relativePath: "raw/sample.nef",
    expectations: {
      default: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      exif: {
        status: "optimized",
        originalSize: 19300180,
        optimizedSize: 19278904,
        savedBytes: 21276,
      },
      max: {
        status: "optimized",
        originalSize: 19300180,
        optimizedSize: 15568526,
        savedBytes: 3731654,
      },
    },
  },
  {
    format: "orf",
    relativePath: "raw/sample.orf",
    expectations: {
      default: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      exif: {
        status: "optimized",
        originalSize: 14127616,
        optimizedSize: 13887306,
        savedBytes: 240310,
      },
      max: {
        status: "optimized",
        originalSize: 14127616,
        optimizedSize: 7664300,
        savedBytes: 6463316,
      },
    },
  },
  {
    format: "raf",
    relativePath: "raw/sample.raf",
    expectations: {
      default: {
        status: "skipped",
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
      },
      exif: {
        status: "optimized",
        originalSize: 33746448,
        optimizedSize: 33736076,
        savedBytes: 10372,
      },
      max: {
        status: "optimized",
        originalSize: 33746448,
        optimizedSize: 20138338,
        savedBytes: 13608110,
      },
    },
  },
  // {
  //   format: "rw2",
  //   relativePath: "raw/sample.rw2",
  //   expectations: placeholderExpectations({ default: "skipped" }),
  // },
  {
    format: "tif",
    relativePath: "tiff/sample.tif",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 1465272,
        optimizedSize: 203463,
        savedBytes: 1261809,
      },
      exif: {
        status: "optimized",
        originalSize: 1465272,
        optimizedSize: 262394,
        savedBytes: 1202878,
      },
      max: {
        status: "optimized",
        originalSize: 1465272,
        optimizedSize: 203439,
        savedBytes: 1261833,
      },
    },
  },
  {
    format: "tiff",
    relativePath: "tiff/sample.tiff",
    expectations: {
      default: {
        status: "optimized",
        originalSize: 5233994,
        optimizedSize: 1637032,
        savedBytes: 3596962,
      },
      exif: {
        status: "optimized",
        originalSize: 5233994,
        optimizedSize: 5230838,
        savedBytes: 3156,
      },
      max: {
        status: "optimized",
        originalSize: 5233994,
        optimizedSize: 1562842,
        savedBytes: 3671152,
      },
    },
  },
];

export const representativeFixtures = {
  jpg: join(fixtureRoot, "jpeg", "sample.jpg"),
  jpeg: join(fixtureRoot, "jpeg", "sample.jpeg"),
  png: join(fixtureRoot, "png", "sample.png"),
  apng: join(fixtureRoot, "apng", "sample.png"),
  gif: join(fixtureRoot, "gif", "sample.gif"),
  webp: join(fixtureRoot, "webp", "sample.webp"),
  svg: join(fixtureRoot, "svg", "sample.svg"),
  heif: join(fixtureRoot, "heif", "sample.heif"),
  heic: join(fixtureRoot, "heif", "sample.heic"),
  avif: join(fixtureRoot, "avif", "sample.avif"),
  bmp: join(fixtureRoot, "bmp", "sample.bmp"),
  jxl: join(fixtureRoot, "jxl", "sample.jxl"),
  ico: join(fixtureRoot, "ico", "sample.ico"),
  arw: join(fixtureRoot, "raw", "sample.arw"),
  cr2: join(fixtureRoot, "raw", "sample.cr2"),
  nef: join(fixtureRoot, "raw", "sample.nef"),
  orf: join(fixtureRoot, "raw", "sample.orf"),
  raf: join(fixtureRoot, "raw", "sample.raf"),
  // rw2: join(fixtureRoot, "raw", "sample.rw2"),
  tif: join(fixtureRoot, "tiff", "sample.tif"),
  tiff: join(fixtureRoot, "tiff", "sample.tiff"),
};

function makeExpectation(
  status: FixtureExpectation["status"]
): FixtureExpectation {
  return {
    status,
    originalSize: PLACEHOLDER_SIZE,
    optimizedSize: PLACEHOLDER_SIZE,
    savedBytes: PLACEHOLDER_SIZE,
  };
}

function _placeholderExpectations(
  statuses: Partial<
    Record<ApiOptimizationMode, FixtureExpectation["status"]>
  > = {}
): Record<ApiOptimizationMode, FixtureExpectation> {
  return {
    default: makeExpectation(statuses.default ?? "optimized"),
    exif: makeExpectation(statuses.exif ?? "optimized"),
    max: makeExpectation(statuses.max ?? "optimized"),
  };
}
