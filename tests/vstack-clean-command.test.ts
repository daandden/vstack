import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { fakeHost } from "./support/extension-host.ts";
import { judge, judgeAnswers } from "./support/extension-mocks.ts";

const script = fileURLToPath(new URL("../plugin/skills/vstack-tmp/scripts/clean.ts", import.meta.url));
const entries = [
  { path: "/scratch/repo-a/review/first", repo_key: "repo-a", kind: "review", entry: "first", newest_mtime: "2026-01-01", age_days: 130, size: 1024 },
  { path: "/scratch/repo-b/maintain/second", repo_key: "repo-b", kind: "maintain", entry: "second", newest_mtime: "2026-01-02", age_days: 120, size: 2048 },
];
const listing = { root: "/scratch", older_than: "90d", entries, kept: 7 };
const result = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: "", code: 0, killed: false });
const notifications = (host: ReturnType<typeof fakeHost>) => host.uiCalls.filter(call => call.method === "notify").map(call => call.args[0]).join("\n");
const baseArgs = (age = "90d") => [script, "--home", homedir(), "--older-than", age];
const label = "repo-b / maintain / second — 120 days, 2048 bytes";

describe("/vstack-clean", () => {
  test("registers the Command, shows the dry-run table and total, then applies all without a model", async () => {
    judgeAnswers({});
    const host = fakeHost({ hasUI: true, selections: ["Apply all"], exec: async (_command, args) => result(args.includes("--delete") ? { deleted: [entries[0].path], skipped: [{ path: entries[1].path, reason: "newer than the TTL" }], pruned: [] } : listing) });
    expect(host.commands.get("vstack-clean")?.description).toContain("[age] (default 90d)");
    await host.callCommand("vstack-clean");
    expect(host.execCalls).toEqual([{ command: "bun", args: baseArgs() }, { command: "bun", args: [...baseArgs(), "--delete", ...entries.map(entry => entry.path)] }]);
    const text = notifications(host);
    for (const part of ["Repo key", "Kind", "Entry", "Age (days)", "Size (bytes)", "repo-a", "review", "first", "130", "1024", "repo-b", "maintain", "second", "120", "2048", "Total: 2 entries, 3072 bytes", "Deleted 1 entry; freed 1024 bytes", entries[1].path, "newer than the TTL"]) expect(text).toContain(part);
    expect(host.uiCalls.find(call => call.method === "select")?.args[1]).toEqual(["Apply all", "Choose items", "Cancel"]);
    expect(judge.resolved).toHaveLength(0);
  });
  test("Choose items uses a checklist and deletes only the checked entries with the given age", async () => {
    const host = fakeHost({ hasUI: true, selections: ["Choose items", label, "Done"], exec: async (_command, args) => result(args.includes("--delete") ? { deleted: [entries[1].path], skipped: [], pruned: [] } : listing) });
    await host.callCommand("vstack-clean", " 2w ");
    expect(host.execCalls[1]).toEqual({ command: "bun", args: [...baseArgs("2w"), "--delete", entries[1].path] });
    const checklist = host.uiCalls.filter(call => call.method === "select").slice(1);
    expect(checklist[0].args[2]).toMatchObject({ selectionMarker: "checkbox", checkedIndices: [], markableCount: 2 });
    expect(checklist[1].args[2]).toMatchObject({ selectionMarker: "checkbox", checkedIndices: [1] });
    expect(notifications(host)).toContain("Deleted 1 entry; freed 2048 bytes");
  });
  test("Cancel, dismiss, and an empty checklist delete nothing", async () => {
    for (const selections of [["Cancel"], [undefined], ["Choose items", "Done"], ["Choose items", label, "Cancel"]]) {
      const host = fakeHost({ hasUI: true, selections, exec: async () => result(listing) });
      await host.callCommand("vstack-clean");
      expect(host.execCalls).toHaveLength(1);
      expect(notifications(host)).toContain("Nothing deleted");
    }
  });
  test("no expired entries reports the kept count and offers no deletion", async () => {
    const host = fakeHost({ hasUI: true, exec: async () => result({ ...listing, entries: [] }) });
    await host.callCommand("vstack-clean");
    expect(notifications(host)).toContain("No expired Scratch entries. Kept 7 entries");
    expect(host.execCalls).toHaveLength(1);
    expect(host.uiCalls.some(call => call.method === "select")).toBe(false);
  });
  test("without a UI it deletes nothing and explains why", async () => {
    judgeAnswers({});
    const host = fakeHost({ hasUI: false, exec: async () => result(listing) });
    await host.callCommand("vstack-clean");
    expect(host.execCalls).toHaveLength(0);
    expect(notifications(host)).toBe("");
    expect(host.sent).toEqual([expect.objectContaining({
      content: expect.stringContaining("requires an interactive UI"),
      display: true,
    })]);
    expect((host.sent[0] as { content: string }).content).toContain("Nothing deleted");
    expect(judge.resolved).toHaveLength(0);
  });
  test("a dry-run script error reports its stderr and never offers deletion", async () => {
    const host = fakeHost({ hasUI: true, exec: async () => ({ stdout: "", stderr: "bad age", code: 2, killed: false }) });
    await host.callCommand("vstack-clean", "bad");
    expect(host.execCalls).toHaveLength(1);
    expect(notifications(host)).toContain("bad age");
    expect(notifications(host)).toContain("Nothing deleted");
    expect(host.uiCalls.some(call => call.method === "select")).toBe(false);
  });
  test("a delete error warns that entries may already be deleted and does not retry", async () => {
    const host = fakeHost({ hasUI: true, selections: ["Apply all"], exec: async (_command, args) => args.includes("--delete") ? { stdout: "", stderr: `EACCES: permission denied, rm ${entries[1].path}`, code: 1, killed: false } : result(listing) });
    await host.callCommand("vstack-clean");
    expect(host.execCalls).toHaveLength(2);
    expect(notifications(host)).toContain(`EACCES: permission denied, rm ${entries[1].path}`);
    expect(notifications(host)).toContain("Some entries may already be deleted");
    expect(notifications(host)).not.toContain("Nothing deleted");
  });
  test("invalid JSON and exec failures are reported without deletion", async () => {
    for (const exec of [async () => ({ stdout: "not JSON", stderr: "", code: 0, killed: false }), async () => { throw new Error("Cannot launch bun"); }]) {
      const host = fakeHost({ hasUI: true, exec });
      await host.callCommand("vstack-clean");
      expect(host.execCalls).toHaveLength(1);
      expect(notifications(host)).toContain("Nothing deleted");
      expect(host.uiCalls.some(call => call.method === "select")).toBe(false);
    }
  });
});
