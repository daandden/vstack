import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../plugin/skills/clean-adr/scripts/check-coverage.ts");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "clean-adr-coverage-"));
	dirs.push(dir);
	return dir;
}
const owned = { id: "retention-runtime", kind: "archived", source: "archive/0002-cache.md:5", affectedAdrs: ["0013-retention.md"] };
const verified = {
	id: owned.id, disposition: "restated", replacement: "0013-retention.md:3",
	evidence: { status: "verified", references: ["src/cache.ts:12-20"], detail: "The cache removes entries older than seven days." },
	problem: null,
};
function save(dir: string, name: string, value: unknown) {
	const path = join(dir, name);
	writeFileSync(path, JSON.stringify(value));
	return path;
}
async function check(dir: string, report: unknown, check = 1, previous?: string, rows = [owned]) {
	const reportPath = save(dir, `report-${check}.json`, report);
	const manifest = save(dir, `manifest-${check}.json`, { check, groups: [{ id: "retention", rows, report: reportPath }] });
	const proc = Bun.spawn(["bun", script, manifest, ...(previous ? [previous] : [])], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	return { code, stdout, stderr, outcome: stdout ? JSON.parse(stdout) : null };
}

test("unavailable runtime evidence stays open despite PASS, accepted policy, and source provenance", async () => {
	const dir = fixture();
	const result = await check(dir, {
		verdict: "PASS", openRewriteRows: [],
		rows: [{ ...verified, evidence: {
			status: "unavailable", references: ["settings.json:5", "archive/0002-cache.md:5"],
			detail: "Seven days is accepted policy and preserves the original rationale; runtime enforcement is unproven.",
		} }],
	});
	expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" });
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows).toEqual([expect.objectContaining({
		...owned, group: "retention", problems: [expect.stringContaining("unavailable")],
	})]);
	expect(result.outcome.completedChecks).toBe(1);
	expect(result.outcome.uncheckedGroups).toEqual([]);
});

test.each(["unknown", "accepted", undefined])("%s evidence cannot close a row", async (status) => {
	const result = await check(fixture(), { rows: [{ ...verified, evidence: { ...verified.evidence, status } }] });
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows.map((row: { id: string }) => row.id)).toEqual([owned.id]);
});

test("three whole-result checks preserve missing prior rows and stop with the affected ADR", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [{ ...verified, evidence: { status: "unavailable", detail: "No executable cache supplied." } }] });
	const previous1 = save(dir, "outcome-1.json", first.outcome);
	const second = await check(dir, { verdict: "PASS", rows: [] }, 2, previous1, []);
	expect(second.outcome.action).toBe("recheck");
	expect(second.outcome.openRewriteRows[0]).toEqual({ ...owned, group: "retention", problems: ["Missing coverage from the current check"] });
	const previous2 = save(dir, "outcome-2.json", second.outcome);
	const third = await check(dir, { rows: [{ ...verified, evidence: { status: "unknown", detail: "Still no runtime evidence." } }] }, 3, previous2);
	expect(third.outcome.action).toBe("report-open");
	expect(third.outcome.completedChecks).toBe(3);
	expect(third.outcome.openRewriteRows[0].affectedAdrs).toEqual(["0013-retention.md"]);
	const fourth = await check(dir, { rows: [verified] }, 4, save(dir, "outcome-3.json", third.outcome));
	expect(fourth.code).toBe(2);
	expect(fourth.stdout).toBe("");
	expect(fourth.stderr).toContain("fourth check is not allowed");
});

test("independent evidence closes an earlier evidence gap without rewriting checker inputs", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [{ ...verified, evidence: { status: "unknown" } }] });
	const previous = save(dir, "outcome-1.json", first.outcome);
	const closed = { ...verified, resolution: "Inspected src/cache.ts:12-20, which now supplies the previously unavailable seven-day eviction implementation." };
	const second = await check(dir, { rows: [closed] }, 2, previous);
	expect(second.outcome.action).toBe("finish");
	expect(second.outcome.openRewriteRows).toEqual([]);
	expect(second.outcome.coverage).toEqual([{ ...owned, group: "retention" }]);
	expect(JSON.parse(readFileSync(join(dir, "report-2.json"), "utf8"))).toEqual({ rows: [closed] });
	expect(JSON.parse(readFileSync(previous, "utf8"))).toEqual(first.outcome);
});

test.each([
	{ ...verified, disposition: "dropped", replacement: null },
	{ ...verified, disposition: "missing", replacement: null },
	{ ...verified, replacement: null },
	{ ...verified, problem: "Current project contradicts the replacement." },
	{ ...verified, evidence: { ...verified.evidence, references: [] } },
])("unresolved coverage stays open with verified evidence: %j", async (row) => {
	const result = await check(fixture(), { rows: [row] });
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows).toHaveLength(1);
});

test("evidence-backed abandonment can close without inventing a replacement", async () => {
	const result = await check(fixture(), { rows: [{
		...verified, disposition: "dropped", replacement: null,
		droppedReason: "Current configuration disables polling and current policy calls it historical.",
		evidence: { status: "verified", references: ["settings.json:2", "docs/retired.md:5"], detail: "Affirmative abandonment, not absent implementation." },
	}] }, 1, undefined, [{ ...owned, affectedAdrs: [] }]);
	expect(result.outcome.action).toBe("finish");
	expect(result.outcome.openRewriteRows).toEqual([]);
});

test("a missing group is incomplete rather than a completed clean check", async () => {
	const result = await check(fixture(), { verdict: "PASS" });
	expect(result.outcome).toEqual({
		completedChecks: 0, uncheckedGroups: ["retention"],
		coverage: [{ ...owned, group: "retention" }],
		openRewriteRows: [{ ...owned, group: "retention", problems: ["Missing coverage from the current check"] }],
		action: "incomplete",
	});
});

test("new scout findings must join the coverage manifest instead of disappearing", async () => {
	const result = await check(fixture(), { rows: [verified, { ...verified, id: "receiver-capability" }] });
	expect(result.code).toBe(2);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("Add discovered row receiver-capability");
});

test("later checks require the preceding completed outcome", async () => {
	const result = await check(fixture(), { rows: [verified] }, 2);
	expect(result.code).toBe(2);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("require the previous outcome");
});

test("a prior open row needs an explicit evidence-backed resolution before closure", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [{ ...verified, evidence: { status: "unavailable" } }] });
	const second = await check(dir, { rows: [verified] }, 2, save(dir, "outcome-1.json", first.outcome));
	expect(second.outcome.action).toBe("recheck");
	expect(second.outcome.openRewriteRows[0].problems).toContain("Missing resolution of the previous open row");
});

const invented = { ...owned, id: "maintenance-window", kind: "new", source: "0013-retention.md:5" };
const removed = {
	id: invented.id, disposition: "removed", removedFrom: ["0013-retention.md"],
	evidence: { status: "verified", references: ["0013-retention.md:1-8"], detail: "The current ADR contains retention only. The maintenance-window statement is absent from every new ADR." },
	problem: null,
};

test("a removed new statement closes with current ADR evidence and retains its kind", async () => {
	const result = await check(fixture(), { rows: [removed] }, 1, undefined, [invented]);
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("finish");
	expect(result.outcome.coverage).toEqual([{ ...invented, group: "retention" }]);
	expect(result.outcome.openRewriteRows).toEqual([]);
});

test("a removed previously open statement needs a resolution and can close without repeating ownership", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [{ ...removed, disposition: "missing", evidence: { status: "unknown" } }] }, 1, undefined, [invented]);
	const previous = save(dir, "outcome-1.json", first.outcome);
	const unresolved = await check(dir, { rows: [removed] }, 2, previous, []);
	expect(unresolved.outcome.action).toBe("recheck");
	expect(unresolved.outcome.openRewriteRows[0].kind).toBe("new");
	const closed = await check(dir, { rows: [{ ...removed, resolution: "Read all current replacements; the unsupported maintenance-window requirement has been deleted." }] }, 2, previous, []);
	expect(closed.outcome.action).toBe("finish");
	expect(closed.outcome.coverage).toEqual([{ ...invented, group: "retention" }]);
});

test("removing an archived provision cannot close its coverage", async () => {
	const result = await check(fixture(), { rows: [{ ...removed, id: owned.id }] });
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows[0].problems.length).toBeGreaterThan(0);
});

test.each(["unknown", "unavailable"])("a removed statement with %s evidence stays open", async (status) => {
	const result = await check(fixture(), { rows: [{ ...removed, evidence: { ...removed.evidence, status } }] }, 1, undefined, [invented]);
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows).toHaveLength(1);
});

test.each([
	{ ...removed, removedFrom: undefined },
	{ ...removed, removedFrom: [] },
	{ ...removed, removedFrom: ["0014-format.md"] },
	{ ...removed, evidence: { ...removed.evidence, references: ["0013-retention.md.backup:1"] } },
	{ ...removed, evidence: { ...removed.evidence, detail: "" } },
	{ ...removed, problem: "The requirement survives in another new ADR." },
	{ ...removed, problem: undefined },
	{ ...removed, disposition: "dropped", droppedReason: "The parent deleted the statement." },
])("incomplete removal or dropped relabelling stays open: %j", async (row) => {
	const result = await check(fixture(), { rows: [row] }, 1, undefined, [invented]);
	expect(result.code).toBe(0);
	expect(result.outcome.action).toBe("recheck");
	expect(result.outcome.openRewriteRows).toHaveLength(1);
});

test.each([undefined, "", "statement"])("invalid ownership kind %s exits 2 without an outcome", async (kind) => {
	const result = await check(fixture(), { rows: [verified] }, 1, undefined, [{ ...owned, kind: kind as string }]);
	expect(result.code).toBe(2);
	expect(result.stdout).toBe("");
});

test("changing an existing row kind exits 2", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [verified] });
	const result = await check(dir, { rows: [verified] }, 2, save(dir, "outcome-1.json", first.outcome), [{ ...owned, kind: "new" }]);
	expect(result.code).toBe(2);
	expect(result.stdout).toBe("");
});

test("previous coverage without a valid kind exits 2", async () => {
	const dir = fixture();
	const first = await check(dir, { rows: [verified] });
	delete first.outcome.coverage[0].kind;
	const result = await check(dir, { rows: [verified] }, 2, save(dir, "outcome-1.json", first.outcome));
	expect(result.code).toBe(2);
	expect(result.stdout).toBe("");
});
