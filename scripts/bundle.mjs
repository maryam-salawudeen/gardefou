// GitHub runs an Action straight from the repository with no install step, so
// the Action is bundled into one file with its dependencies. The CLI is bundled
// too, so `npx` doesn't need the dependency tree.
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Some dependencies still call require(); this gives the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
};

await build({ ...shared, entryPoints: ["src/action.ts"], outfile: "dist/action.js" });
await build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node\n" + shared.banner.js },
});
