#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const [fixtureArg, evidenceArg, mode, ...extra] = process.argv.slice(2);
if (!fixtureArg || !evidenceArg || !["standard", "private"].includes(mode ?? "") || extra.length) throw new Error("Usage: clean-adr-evidence.ts <fresh-git-fixture> <new-evidence-dir> <standard|private>");
const fixture = resolve(fixtureArg), evidence = resolve(evidenceArg);
if (!existsSync(join(fixture, ".git"))) throw new Error("Initialize a fresh disposable git fixture first");
if (existsSync(join(fixture, "settings.json")) || existsSync(join(fixture, "src")) || existsSync(evidence)) throw new Error("Use a fresh fixture and evidence directory; leave evidence-poor baselines unchanged");
const put = (path: string, text: string | Uint8Array) => {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, text, { flag: "wx" });
};
mkdirSync(evidence, { recursive: true });
const sources = [];
for (const name of ["device.ts", "producer.ts", "receiver.ts", "alternate.ts", "exercise.ts"]) {
	const bytes = readFileSync(join(import.meta.dir, "../fixtures/clean-adr-evidenced", name));
	const path = `src/simulator/${name}`;
	put(join(fixture, path), bytes);
	sources.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
}
put(join(fixture, ".gitignore"), ".omp/\n");
put(join(fixture, "settings.json"), JSON.stringify({ remotePolling: false, cache: { maxEntries: 20, retentionDays: 7 }, compression: "gzip", retryLimit: 3, journalSync: true }, null, 2) + "\n");
put(join(fixture, "docs/protocol.md"), "# Protocol\n\nThe producer emits a gzip-compressed JSON array. Each entry contains createdAt on the logical clock and a string value. The receiver decodes that exact array.\n");
put(join(fixture, "docs/current-policy.md"), "# Current simulator policy\n\nThis repository is the complete Bun simulator system. The executable producer and receiver in src/simulator are its implementation, not examples for an external product. settings.json is its accepted current configuration. The logical clock is input data, not elapsed physical time. No hardware, deployed fleet, or measured memory budget exists in this project.\n\nRemote polling is retired and disabled. The producer rejects remote-source readings and accepts local readings. The fixed ten-entry payload rule has been retired. Capacity follows the configurable maxEntries setting rather than a fixed architectural count. The configured value is not a new architectural decision. Payload selection retains readings through age seven logical days so a reading stored at zero can still be delivered at seven days. Entries older than that are excluded when the producer makes a payload. The named receiver program accepts gzip, not zstd.\n\nThe producer constructs three attempt slots to bound scheduling work. It appends journal entries synchronously so the append returns after the write completes. These are software behavior claims only, not battery or power-loss guarantees.\n\nRun bun src/simulator/exercise.ts to execute the producer, receiver, and alternate-codec programs. evidence/actors/ contains the actual recorded inputs, wire bytes, command exits, decoded payloads, and negative control. Run bun src/help.ts for current ADR lookup navigation.\n");
const directories = mode === "private" ? [".git/vstack/domain/adr", "docs/adr"] : ["docs/adr"];
const config = mode === "private" ? ".git/vstack/config" : "docs/vstack";
const protectedPaths = ["gated/"];
if (mode === "private") {
	const protectedPrivate = join(fixture, ".git/vstack/domain/gated.md");
	put(protectedPrivate, "# Private retention policy\n\nUse [ADR 0002](adr/0002-cache.md) for payload retention.\n");
	protectedPaths.push(protectedPrivate);
}
put(join(fixture, config, "domain.md"), "# Domain documentation\n\n" + directories.map(path => `- ADR directory: ${path}`).join("\n") + "\n- Current project evidence: docs/current-policy.md, settings.json, src/simulator/, evidence/actors/observations.json, src/help.ts\n- clean-adr report-only paths: " + JSON.stringify(protectedPaths) + "\n");
const sections: Record<string, string[]> = {};
const add = (path: string, namespace: string, text: string) => (sections[path] ??= []).push(`## ${namespace}\n\n${text}\n`);
const help = [];
for (const adr of directories) {
	const namespace = adr.startsWith(".git/") ? "private" : "tracked";
	const a = join(fixture, adr);
	const rel = (target: string, parent = a) => relative(parent, join(fixture, target)).split("\\").join("/");
	const files: Record<string, string> = {
		"0001-remote-polling.md": `# Accept remote-source input\n\nWith remotePolling enabled, accept input readings marked remote so those readings can enter the queue and reach the receiver.\n\nSee [protocol](${rel("docs/protocol.md")}#protocol).\n`,
		"0002-cache.md": "# Cache limits and retention\n\nKeep at most 10 entries per payload to bound its length. Retain entries through age seven logical days so a reading stored at zero can still be delivered when the producer clock reaches seven days.\n\nHistorical comparison: [ADR 0004](0004-receiver-format.md).\n",
		"0003-compression.md": "# Compress payloads\n\nUse gzip for payloads because src/simulator/receiver.ts decodes gzip.\n\nSee [receiver decision][receiver].\n\n[receiver]: 0004-receiver-format.md\n",
		"0004-receiver-format.md": "# Receiver compression format\n\nUse gzip for payloads to remain compatible with src/simulator/receiver.ts.\n",
		"0005-retries.md": "# Bound attempt scheduling\n\nConstruct at most three attempt slots to bound scheduling work.\n",
		"0006-journal.md": "# Append the journal synchronously\n\nAppend journal entries synchronously so append returns after the write completes.\n\nUse [ADR 0002](0002-cache.md) for payload retention.\n",
		"archive/2026-11-01T0900/0012-retired-input.md": "> Archived on 2026-11-01T0900. No part holds: the simulator no longer accepts the retired input format.\n\n# Retired input\n\nAccept the retired input format only.\n\nHistorical cache reference: [ADR 0002](../../0002-cache.md).\n",
	};
	for (const [name, text] of Object.entries(files)) put(join(a, name), text);
	const glossary = namespace === "private" ? ".git/vstack/domain/GLOSSARY.md" : "GLOSSARY.md";
	put(join(fixture, glossary), `# Glossary\n\n- Simulator: the complete local Bun software project.\n- Logical day: 86400000 units of the input clock.\n- ADR directory: ${adr}.\n\nProject evidence pointers: docs/current-policy.md, settings.json, src/simulator/, evidence/actors/observations.json, src/help.ts.\n`);
	const target = (name: string, path: string) => relative(join(fixture, path, ".."), join(a, name)).split("\\").join("/");
	add("docs/live-citations.md", namespace, `Use [ADR 0002](${target("0002-cache.md", "docs/live-citations.md")}) for retention. Use [ADR-0004][${namespace}-codec] for codec compatibility. See <a href="${target("0002-cache.md", "docs/live-citations.md")}">ADR 0002</a>.\n\n[${namespace}-codec]: ${target("0004-receiver-format.md", "docs/live-citations.md")}`);
	add("CHANGELOG.md", namespace, `Past release: introduced [ADR 0002](${target("0002-cache.md", "CHANGELOG.md")}).`);
	add("research/plain.md", namespace, `Past research considered ADR 0004 in ${adr}.`);
	add("research/links.md", namespace, `Past research considered [ADR 0004][${namespace}-history].\n\n[${namespace}-history]: ${target("0004-receiver-format.md", "research/links.md")}`);
	add("gated/policy.md", namespace, `Use [ADR 0002](${target("0002-cache.md", "gated/policy.md")}) for retention and ADR 0004 in ${adr} for codec compatibility. Historically considered [ADR 0001](${target("0001-remote-polling.md", "gated/policy.md")}).`);
	add("gated-other/policy.md", namespace, `Use [ADR 0002](${target("0002-cache.md", "gated-other/policy.md")}) for retention.`);
	help.push(`Current ${namespace} ADR lookup navigation in ${adr}: [ADR 0001](${target("0001-remote-polling.md", "src/help.ts")}).`);
	help.push(`Current ${namespace} lookup key ADR 0001 in ${adr}.`);
}
for (const [path, parts] of Object.entries(sections)) put(join(fixture, path), `# ${path}\n\n` + parts.join("\n"));
put(join(fixture, "src/policy.ts"), directories.map(path => `// Use ADR 0004 in ${path} for payload codec compatibility.`).join("\n") + "\n");
put(join(fixture, "src/help.ts"), `console.log([\n${help.map(line => "\t" + JSON.stringify(line) + ",").join("\n")}\n].join("\\n"));\n`);
const command = [process.execPath, join(fixture, "src/simulator/exercise.ts")];
const proc = Bun.spawn(command, { cwd: fixture, stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
writeFileSync(join(evidence, "stdout.log"), stdout);
writeFileSync(join(evidence, "stderr.log"), stderr);
writeFileSync(join(evidence, "execution.json"), JSON.stringify({ command, fixture, mode, exit, sources, scope: "Complete self-contained Bun simulator with input logical clock and named producer/receiver programs. No physical or deployment claims." }, null, 2) + "\n");
if (exit !== 0) { console.error(stderr); process.exitCode = exit; }
else {
	writeFileSync(join(evidence, "observations.json"), readFileSync(join(fixture, "evidence/actors/observations.json")));
	console.log(JSON.stringify({ fixture, evidence, mode, exit, sources }, null, 2));
}
