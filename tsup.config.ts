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
  external: [
    // SDK's optional blockchain peers — MCP never calls buy/sell, so these
    // stay as dynamic imports and only resolve if the user installs them.
    "viem",
    "viem/chains",
    "@whetstone-research/doppler-sdk",
    "doppler-router",
    "doppler-router/dist/Permit2",
    ...nodeExternals,
  ],
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
