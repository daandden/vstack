import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const reader = resolve(Bun.argv[2] ?? import.meta.dir);
const require = createRequire(join(reader, "package.json"));
const pkg = require.resolve("nuxt/package.json");
const cli = join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.nuxt);
let shell: Buffer | undefined;
for (const command of ["generate", "build"]) {
  const child = Bun.spawn([process.execPath, cli, command, reader], {
    env: { ...process.env, FLOW_READER_SHELL: command === "generate" ? "1" : "0" },
    stdout: "inherit", stderr: "inherit",
  });
  if (await child.exited !== 0) process.exit(child.exitCode ?? 1);
  if (command === "generate") shell = readFileSync(join(reader, ".output/public/index.html"));
}
const built = await Bun.build({ entrypoints: [join(reader, ".output/server/index.mjs")], outdir: join(reader, ".output/server"), naming: "flow.mjs", target: "bun", packages: "bundle" });
if (!built.success) throw new AggregateError(built.logs, "could not bundle the Flow Nitro server");
writeFileSync(join(reader, ".output/public/index.html"), shell!);
