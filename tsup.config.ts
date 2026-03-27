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
  sourcemap: true,
  clean: true,
  target: "node18",
  external: [...nodeExternals],
  noExternal: [
    "@paragraph-com/sdk",
    "@modelcontextprotocol/sdk",
    "axios",
    "doppler-router",
    "follow-redirects",
    "form-data",
    "combined-stream",
    "delayed-stream",
    "asynckit",
    "mime-types",
    "mime-db",
    "proxy-from-env",
    "zod",
    "content-type",
    "raw-body",
    "eventsource",
    "pkce-challenge",
  ],
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});
