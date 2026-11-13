import { appendFileSync, readFileSync } from "node:fs";
import { Device } from "./device.ts";

const settings = JSON.parse(readFileSync(new URL("../../settings.json", import.meta.url), "utf8"));
const input = await Bun.stdin.json() as { stores: { at: number; value: string; source?: "local" | "remote" }[]; deliverAt: number; journal?: string };
let now = 0;
const producer = new Device(settings.cache, () => now);
for (const entry of input.stores) {
	if (entry.source === "remote" && !settings.remotePolling) continue;
	now = entry.at;
	producer.store(entry.value);
	if (input.journal && settings.journalSync) appendFileSync(input.journal, JSON.stringify(entry) + "\n");
}
now = input.deliverAt;
if (settings.compression !== "gzip") throw new Error("Producer codec must be gzip");
const metadata = { attemptSlots: Array.from({ length: settings.retryLimit }, (_, index) => index + 1) };
console.error(JSON.stringify(metadata));
await Bun.write(Bun.stdout, producer.payload());
