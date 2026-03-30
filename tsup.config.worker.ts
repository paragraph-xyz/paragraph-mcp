import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/worker.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: false,
  clean: false,
  target: "es2022",
  outDir: "dist-worker",
  noExternal: [/.*/],
  banner: {
    js: [
      'import { createRequire as __createRequire } from "module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});
