import { deepStrictEqual, equal } from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Device } from "./device.ts";

const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const day = 86_400_000;
let now = Date.UTC(2026, 0, 1);
const start = now;
const devices = [new Device(settings.cache, () => now), new Device(settings.cache, () => now)];
const receiver = new URL("./receiver.ts", import.meta.url).pathname;
const observations = [];
for (const [index, device] of devices.entries()) device.store(`reading-${index}`);
now += 7 * day;
for (const [index, device] of devices.entries()) {
	const wire = device.payload();
	equal(wire[0], 0x1f);
	equal(wire[1], 0x8b);
	const proc = Bun.spawn([process.execPath, receiver], { stdin: wire, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	equal(code, 0, stderr);
	deepStrictEqual(JSON.parse(stdout), [{ createdAt: start, value: `reading-${index}` }]);
	observations.push({ device: index, storedAt: start, deliveredAt: now, disconnectedMilliseconds: now - start, wireSha256: createHash("sha256").update(wire).digest("hex"), receiverExit: code, received: JSON.parse(stdout) });
}
now += 1;
for (const device of devices) {
	const proc = Bun.spawn([process.execPath, receiver], { stdin: device.payload(), stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	equal(code, 0, stderr);
	deepStrictEqual(JSON.parse(stdout), []);
}
const evidence = {
	clock: "Explicitly controlled sample-device clock, not wall-clock telemetry or physical-device measurements",
	start, reconnectedAt: start + 7 * day, expiredAt: now,
	settings,
	observations,
};
writeFileSync(new URL("./observations.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
