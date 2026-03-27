import { defineConfig } from "tsup";
import { builtinModules } from "module";

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: false,
  clean: true,
  target: "node18",
  external: [...nodeExternals],
  noExternal: [
    "@paragraph-com/sdk",
    "@modelcontextprotocol/sdk",
    "zod",
  ],
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});
