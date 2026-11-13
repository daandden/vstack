import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sha256 as digest, walkFiles } from "./files.ts";

const roots = ["flow-page/scripts", "flow-page/reader", "vstack-tmp/scripts", "vstack-figures/scripts"];
const packages = ["pele"];
export const skillsRoot = resolve(import.meta.dir, "../..");
export function runtimeFiles(base = skillsRoot): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const root of roots) {
    walkFiles(join(base, root), (path, full) => files.set(`${root}/${path}`, readFileSync(full)), {
      other: (path) => { throw new Error(`Flow runtime contains a non-file: ${root}/${path}`); },
    });
  }
  return files;
}
export function coherentRuntime(base = skillsRoot): Map<string, Buffer> {
  const manifest: unknown = JSON.parse(readFileSync(join(base, "flow-page/runtime.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== 1 || !("files" in manifest) || !manifest.files || typeof manifest.files !== "object") throw new Error("invalid Flow runtime manifest");
  const files = runtimeFiles(base), expected = Object.entries(manifest.files);
  if (expected.length !== files.size || expected.some(([path, hash]) => !files.has(path) || digest(files.get(path)!) !== hash)) throw new Error("incomplete Flow runtime installation; last good generation remains active");
  return files;
}
export function sealRuntime(base = skillsRoot): void {
  const files = Object.fromEntries([...runtimeFiles(base)].map(([path, bytes]) => [path, digest(bytes)]));
  writeFileSync(join(base, "flow-page/runtime.json"), JSON.stringify({ version: 1, files }, null, 2) + "\n");
}
/** Folder of each npm package the runtime imports by bare name, resolved as the installed plugin resolves it. */
export function runtimePackages(base = skillsRoot): Map<string, string> {
  const from = realpathSync(base);
  return new Map(packages.map(name => [name, dirname(Bun.resolveSync(`${name}/package.json`, from))]));
}
/** Writes `files` and a copy of each package under `destination`, so the generation resolves imports without the installed plugin. */
export function stageRuntime(files: Map<string, Buffer>, packages: Map<string, string>, destination: string): void {
  for (const [path, bytes] of files) {
    const out = join(destination, path);
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, bytes, { mode: 0o600 });
  }
  for (const [name, folder] of packages) cpSync(folder, join(destination, "node_modules", name), { recursive: true });
  sealRuntime(destination);
}
if (import.meta.main) {
  if (Bun.argv[2] !== "seal") throw new Error("usage: bun generation.ts seal");
  sealRuntime();
}
