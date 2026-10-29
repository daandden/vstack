// The House style module's public API (scripts/lib/house-style.ts) over the repo's own house-style.yaml.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRows, parseHouseStyle, selectRows } from "../scripts/lib/house-style.ts";

const UPSTREAMS = new Set(["matt", "pstack", "css"]);
const doc = Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "house-style.yaml"), "utf8"));
const { houseStyle, problems } = parseHouseStyle(doc, UPSTREAMS);
const rows = houseStyle.replacements;

test("the repo's house-style.yaml has no problems", () => {
  expect(problems).toEqual([]);
});

describe("applyRows honors match kinds", () => {
  const matt = selectRows(rows, { use: "update", upstreams: ["matt"] });

  test("name: glossary rewrites mentions of CONTEXT.md and CONTEXT-MAP.md and leaves CONTEXT-FORMAT.md alone", () => {
    const from = "Read `CONTEXT.md` and CONTEXT-MAP.md (see ./src/ordering/CONTEXT.md). Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).";
    expect(applyRows(from, matt)).toBe(
      "Read `GLOSSARY.md` and GLOSSARY-MAP.md (see ./src/ordering/GLOSSARY.md). Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).",
    );
  });

  test("literal before name: setup-vstack-cmd turns the user's command into /skill: before setup-vstack renames the rest", () => {
    expect(applyRows("Run /setup-matt-pocock-skills; the setup-matt-pocock-skills skill writes docs/agents/.", matt)).toBe(
      "Run /skill:setup-vstack; the setup-vstack skill writes docs/vstack/.",
    );
  });

  test("ref: only /x, `x`, **x**, and skill://x are renamed; the plain word stays", () => {
    const pstack = selectRows(rows, { use: "update", upstreams: ["pstack"] });
    expect(applyRows("Run /arena, `arena`, **arena**, or skill://arena in the arena.", pstack)).toBe(
      "Run /compare-attempts, `compare-attempts`, **compare-attempts**, or skill://compare-attempts in the arena.",
    );
  });

  test("a row applies only to its own Upstream", () => {
    expect(applyRows("Run /arena.", matt)).toBe("Run /arena.");
  });
});

describe("selectRows", () => {
  test("migration: the uses-migration rows in list order, specific relative forms before the root form", () => {
    const mig = selectRows(rows, { use: "migration" });
    expect(mig.map((r) => r.id)).toEqual([
      "setup-vstack-cmd",
      "setup-vstack",
      "config-dir",
      "config-block",
      "glossary-map",
      "glossary",
      "mig-config",
      "mig-root",
    ]);
    expect(applyRows("see .git/matt-pocock/docs-agents/domain.md and .git/matt-pocock/artifacts/", mig)).toBe(
      "see .git/vstack/config/domain.md and .git/vstack/artifacts/",
    );
  });

  test("update never includes migration-only rows", () => {
    expect(selectRows(rows, { use: "update" }).some((r) => r.uses.length === 1 && r.uses[0] === "migration")).toBe(false);
  });

  test("adopt text gets only required rows; adapt text gets adapted rows too", () => {
    const adopt = selectRows(rows, { upstreams: ["pstack"], disposition: "adopt" });
    const adapt = selectRows(rows, { upstreams: ["pstack"], disposition: "adapt" });
    expect(adopt.every((r) => r.scope === "required")).toBe(true);
    expect(adapt.some((r) => r.id === "verify-skill-dir")).toBe(true);
    expect(adopt.some((r) => r.id === "verify-skill-dir")).toBe(false);
  });

  test("originals get every Upstream's rows except one whose from is still a shipped skill name", () => {
    const original = selectRows(rows, { disposition: "original", shippedNames: new Set(["teach"]) });
    expect(original.some((r) => r.id === "glossary")).toBe(true);
    expect(original.some((r) => r.id === "compare-attempts")).toBe(true);
    expect(original.some((r) => r.id === "explain")).toBe(false);
  });
});

describe("parseHouseStyle problems", () => {
  const withRows = (replacements: unknown[]) => parseHouseStyle({ replacements, rules: doc.rules }, UPSTREAMS).problems;
  const row = (id: string, from: string, match = "literal") => ({ id, from, to: "x", match, upstream: "matt", scope: "required", uses: ["update"] });

  test("a row that an earlier row rewrites is reported", () => {
    expect(withRows([row("short", "setup-matt", "name"), row("long", "/setup-matt")])).toEqual([
      { id: "long", message: "row short (earlier) rewrites this row's from, so it never matches; move it above short" },
    ]);
  });

  test("an unknown upstream is reported", () => {
    expect(withRows([{ ...row("r", "a"), upstream: "nowhere" }]).map((p) => p.id)).toEqual(["r"]);
  });
});
