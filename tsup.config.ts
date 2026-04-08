import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/api/index.ts",
    gulp: "src/integrations/gulp.ts",
    grunt: "src/integrations/grunt.ts",
    webpack: "src/integrations/webpack.ts",
    rollup: "src/integrations/rollup.ts",
    parcel: "src/integrations/parcel.ts",
    astro: "src/integrations/astro.ts",
    vite: "src/integrations/vite.ts",
    next: "src/integrations/next.ts",
    esbuild: "src/integrations/esbuild.ts",
    babel: "src/integrations/babel.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  target: "node18",
  outDir: "dist",
});
