import { gzipSync } from "node:zlib";

type Entry = { createdAt: number; value: string };
export class Device {
	private entries: Entry[] = [];
	constructor(private readonly policy: { maxEntries: number; retentionDays: number }, private readonly now: () => number) {}
	store(value: string) {
		this.entries.push({ createdAt: this.now(), value });
		this.entries = this.entries.slice(-this.policy.maxEntries);
	}
	payload() {
		this.entries = this.entries.filter(entry => this.now() - entry.createdAt <= this.policy.retentionDays * 86_400_000);
		return gzipSync(JSON.stringify(this.entries));
	}
}
