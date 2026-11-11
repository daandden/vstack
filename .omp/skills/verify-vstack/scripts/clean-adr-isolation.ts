import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";

const [checkoutArg, fixtureArg, evidenceArg] = Bun.argv.slice(2);
if (!checkoutArg || !fixtureArg || !evidenceArg) {
  throw new Error("usage: bun clean-adr-isolation.ts <checkout> <fresh fixture> <new evidence directory>");
}
const checkout = realpathSync(checkoutArg);
const fixture = realpathSync(fixtureArg);
const evidence = resolve(evidenceArg);
const plugin = join(checkout, "plugin");
const pkg = JSON.parse(readFileSync(join(plugin, "package.json"), "utf8"));
if (pkg.name !== "vstack") throw new Error("checkout plugin must be vstack");
if (!existsSync(join(fixture, ".git"))) throw new Error("fixture must already be a disposable git repository");
if (existsSync(join(fixture, ".omp"))) throw new Error("refusing an existing fixture .omp directory");
if (evidence === fixture || evidence.startsWith(fixture + sep)) throw new Error("evidence must be outside the disposable fixture");
mkdirSync(evidence, { recursive: true });
if (existsSync(join(evidence, "isolate.json"))) throw new Error("evidence directory already contains isolation inputs");

const native = join(fixture, ".omp");
mkdirSync(join(native, "plugins", "node_modules"), { recursive: true });
const links = {
  [join(native, "skills")]: join(plugin, "skills"),
  [join(native, "agents")]: join(plugin, "agents"),
  [join(native, "plugins", "node_modules", "vstack")]: plugin,
};
for (const [link, target] of Object.entries(links)) symlinkSync(target, link, "dir");
writeFileSync(join(native, "plugins", "omp-plugins.lock.json"), JSON.stringify({
  plugins: { vstack: { version: pkg.version, enabled: true, enabledFeatures: null } }, settings: {},
}, null, 2) + "\n");
const skills = readdirSync(join(plugin, "skills")).filter(name => existsSync(join(plugin, "skills", name, "SKILL.md"))).sort();
writeFileSync(join(evidence, "isolate.json"), JSON.stringify({
  memory: { backend: "off" },
  skills: {
    customDirectories: [], ignoredSkills: [], includeSkills: skills,
    enablePiProject: true, enablePiUser: false,
    enableClaudeProject: false, enableClaudeUser: false,
    enableAgentsProject: false, enableAgentsUser: false, enableCodexUser: false,
  },
}, null, 2) + "\n");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const inputs: Record<string, string> = {};
function inventory(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) inventory(path);
    else if (entry.isFile()) inputs[path] = sha256(path);
  }
}
inventory(join(plugin, "skills"));
inventory(join(plugin, "agents"));
writeFileSync(join(evidence, "isolation-inputs.json"), JSON.stringify({ checkout, fixture, plugin, links, inputs }, null, 2) + "\n");
console.log(JSON.stringify({
  fixture, overlay: join(evidence, "isolate.json"), links,
  launch_flags: ["--no-rules", "--no-context-files", "--config", join(evidence, "isolate.json")],
  note: "Retain real HOME for credentials. Clear inherited PI_* and OMP_* variables, then set PI_CONFIG_FILES to the overlay. Audit actual parent and scout reads before accepting this drive.",
}, null, 2));
