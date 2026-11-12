import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sha256 as digest, walkFiles } from "./files.ts";

const roots = ["flow-page/scripts", "flow-page/reader", "vstack-tmp/scripts", "vstack-figures/scripts"];
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
export function stageRuntime(files: Map<string, Buffer>, destination: string): void {
  for (const [path, bytes] of files) {
    const out = join(destination, path);
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, bytes, { mode: 0o600 });
  }
  sealRuntime(destination);
}
if (import.meta.main) {
  if (Bun.argv[2] !== "seal") throw new Error("usage: bun generation.ts seal");
  sealRuntime();
}
