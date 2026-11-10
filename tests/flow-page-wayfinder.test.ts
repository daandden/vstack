import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-wayfinder-")));
const home = join(root, "home");
mkdirSync(home);
afterAll(() => rmSync(root, { recursive: true, force: true }));
function cli(args: string[], items?: object[]) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "graph", "--agent", "main"], {
    cwd: root, env: { ...process.env, VSTACK_FLOW_HOST: "off" },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, error: p.stderr.toString(), json: p.stdout.length ? JSON.parse(p.stdout.toString()) : undefined };
}
const ticket = (id: string, state = "frontier", blockers: string[] = []) => ({ id, title: `Decide ${id}`, url: `https://tracker.example.test/issues/${id}`, state, blockers });

test("wayfinder graph round-trips every state and preserves charting when a ticket Stage refreshes it", () => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Decision map"]);
  expect(opened.code).toBe(0);
  expect(cli(["show", "--flow", opened.json.flow]).json.wayfinder).toBeUndefined();
  const tickets = [ticket("scope", "resolved"), ticket("storage"), ticket("reader", "blocked", ["storage"]), ticket("auth", "claimed"), ticket("billing", "out-of-scope")];
  const args = ["submit", "--flow", opened.json.flow, "--stage", opened.json.stage];
  const submitted = cli(args, [{ kind: "wayfinder", tickets }]);
  expect(submitted.error).toBe("");
  expect(submitted.code).toBe(0);
  const charted = { stage: opened.json.stage, revision: submitted.json.revision, tickets };
  expect(cli(["show", "--flow", opened.json.flow]).json.wayfinder).toEqual({ ...charted, history: [] });
  expect(cli(args, [{ kind: "wayfinder", tickets }]).json.repeated).toBe(true);
  expect(cli(args, [{ kind: "stage", state: "finished" }]).code).toBe(0);
  const next = cli(["open", "--skill", "wayfinder", "--flow", opened.json.flow, "--ticket", "storage"]);
  const updated = tickets.map((t) => t.id === "storage" ? { ...t, state: "resolved" } : t.id === "reader" ? { ...t, state: "frontier" } : t);
  const refresh = cli(["submit", "--flow", opened.json.flow, "--stage", next.json.stage], [{ kind: "wayfinder", tickets: updated }]);
  expect(refresh.code).toBe(0);
  expect(cli(["show", "--flow", opened.json.flow]).json.wayfinder).toEqual({ stage: next.json.stage, revision: refresh.json.revision, tickets: updated, history: [charted] });
});

test.each([
  ".scratch/storage/issues/01-storage.md",
  "issues/01-storage.md",
  "/private/vstack/artifacts/storage/issues/01-storage.md",
])("local ticket path %s round-trips through submit and show", (url) => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Local decision map"]);
  const tickets = [{ ...ticket("storage"), url }];
  const submitted = cli(["submit", "--flow", opened.json.flow, "--stage", opened.json.stage], [{ kind: "wayfinder", tickets }]);
  expect(submitted.error).toBe("");
  expect(submitted.code).toBe(0);
  expect(cli(["show", "--flow", opened.json.flow]).json.wayfinder.tickets).toEqual(tickets);
});

test.each([
  ["unknown state", [ticket("a", "ready")], "state"],
  ["duplicate identity", [ticket("a"), ticket("a")], "duplicate"],
  ["blank title", [{ ...ticket("a"), title: " " }], "title"],
  ["unsafe URL", [{ ...ticket("a"), url: "javascript:alert(1)" }], "url"],
  ["data URL", [{ ...ticket("a"), url: "data:text/plain,ticket.md" }], "url"],
  ["file URL", [{ ...ticket("a"), url: "file:///issues/a.md" }], "url"],
  ["other URL scheme", [{ ...ticket("a"), url: "ftp://tracker.example.test/a.md" }], "url"],
  ["protocol-relative URL", [{ ...ticket("a"), url: "//tracker.example.test/a.md" }], "url"],
  ["empty reference", [{ ...ticket("a"), url: " " }], "url"],
  ["relative URL", [{ ...ticket("a"), url: "/issues/a" }], "url"],
  ["malformed URL", [{ ...ticket("a"), url: "https:tracker.example.test/a" }], "url"],
  ["missing blocker", [ticket("a", "blocked", ["missing"])], "blocker"],
  ["self blocker", [ticket("a", "blocked", ["a"])], "itself"],
  ["duplicate blocker", [ticket("a"), ticket("b", "blocked", ["a", "a"])], "duplicate"],
  ["cyclic blocking", [ticket("a", "blocked", ["b"]), ticket("b", "blocked", ["a"])], "cycle"],
  ["unknown field", [{ ...ticket("a"), status: "open" }], "status"],
] as const)("wayfinder refuses %s without committing other items", (_name, tickets, message) => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Invalid map"]);
  const before = cli(["show", "--flow", opened.json.flow]).json;
  const refused = cli(["submit", "--flow", opened.json.flow, "--stage", opened.json.stage], [
    { kind: "assumed", decision: "Not committed", pick: "Keep", why: "Atomic contribution" },
    { kind: "wayfinder", tickets },
  ]);
  expect(refused.code).toBe(1);
  expect(JSON.stringify(refused.json.diagnostics)).toContain(message);
  expect(cli(["show", "--flow", opened.json.flow]).json).toEqual(before);
});

test("an empty graph is a published map with no known tickets", () => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Fog only"]);
  const submitted = cli(["submit", "--flow", opened.json.flow, "--stage", opened.json.stage], [{ kind: "wayfinder", tickets: [] }]);
  expect(submitted.code).toBe(0);
  expect(cli(["show", "--flow", opened.json.flow]).json.wayfinder.tickets).toEqual([]);
});

test("wayfinder validate accepts graphs without writes and shares coded submit refusals", () => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Map diagnostics"]);
  const target = ["--flow", opened.json.flow, "--stage", opened.json.stage];
  const before = cli(["show", "--flow", opened.json.flow]).json;
  expect(cli(["validate", ...target], [{ kind: "wayfinder", tickets: [ticket("a")] }]).json).toEqual({ ok: true, diagnostics: [] });
  expect(cli(["show", "--flow", opened.json.flow]).json).toEqual(before);
  const invalid = [{ kind: "wayfinder", tickets: [{ ...ticket("a"), state: "ready" }, { ...ticket("b"), title: "" }] }];
  const checked = cli(["validate", ...target], invalid);
  const refused = cli(["submit", ...target], invalid);
  expect(checked.code).toBe(1);
  expect(refused.json).toEqual(checked.json);
  expect(checked.json.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "invalid_enum", path: "$.items[0].tickets[0].state", allowed: ["resolved", "frontier", "blocked", "claimed", "out-of-scope"] }),
    expect.objectContaining({ path: "$.items[0].tickets[1].title" }),
  ]));
  expect(cli(["show", "--flow", opened.json.flow]).json).toEqual(before);
});
