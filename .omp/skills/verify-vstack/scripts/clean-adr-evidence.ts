#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [fixtureArg, evidenceArg, ...extra] = process.argv.slice(2);
if (!fixtureArg || !evidenceArg || extra.length) throw new Error("Usage: clean-adr-evidence.ts <fixture> <new-evidence-dir>");
const fixture = resolve(fixtureArg), evidence = resolve(evidenceArg);
const sample = join(fixture, "sample-devices");
if (!existsSync(join(fixture, "settings.json"))) throw new Error("Seed the documented ADR fixture and settings.json first");
if (existsSync(sample) || existsSync(evidence)) throw new Error("Use a fresh fixture sample-devices directory and evidence directory");
mkdirSync(evidence, { recursive: true });
mkdirSync(sample);
const sources = [];
for (const name of ["device.ts", "receiver.ts", "exercise.ts"]) {
	const bytes = readFileSync(join(import.meta.dir, "../fixtures/clean-adr-evidenced", name));
	writeFileSync(join(sample, name), bytes, { flag: "wx" });
	sources.push({ path: `sample-devices/${name}`, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const command = [process.execPath, join(sample, "exercise.ts")];
const proc = Bun.spawn(command, { cwd: fixture, stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
writeFileSync(join(evidence, "stdout.log"), stdout);
writeFileSync(join(evidence, "stderr.log"), stderr);
writeFileSync(join(evidence, "execution.json"), JSON.stringify({ command, fixture, exit, sources, scope: "Executable sample devices and receiver subprocesses with a controlled clock. Not production telemetry or physical-device measurements." }, null, 2) + "\n");
if (exit !== 0) {
	console.error(stderr);
	process.exitCode = exit;
} else {
	writeFileSync(join(evidence, "observations.json"), readFileSync(join(sample, "observations.json")));
	console.log(JSON.stringify({ fixture, sample, evidence, exit, sources }, null, 2));
}
