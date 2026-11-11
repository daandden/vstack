import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkout, cleanupCheckouts, git, makeUpstreams, passingSpec, type Upstreams } from "./support/fixture.ts";

let up: Upstreams;
beforeAll(() => { up = makeUpstreams(); });
afterAll(() => {
  cleanupCheckouts();
  rmSync(up.dir, { recursive: true, force: true });
});

const first0065 = "docs/adr/0065-flow-figures-get-color-roles-from-the-shared-role-pass.md";
const second0065 = "docs/adr/0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session.md";
const body = "# A recorded decision\n\nA decision with its context and trade-off.\n";

function legacySpec() {
  const spec = passingSpec(up);
  spec.files["docs/adr/0001-original-decision.md"] = body;
  spec.files[first0065] = body;
  spec.files[second0065] = body;
  return spec;
}

function inventory(root: string) {
  return readdirSync(join(root, "docs/adr")).sort().map(name => [name, readFileSync(join(root, "docs/adr", name), "utf8")]);
}

describe("ADR filenames", () => {
  test("legacy names and the known 0065 pair stay byte-identical beside valid new names", async () => {
    const co = checkout(up, legacySpec());
    co.write("docs/adr/20261111-new-decision.md", body);
    co.write("docs/adr/20240229-leap-day.md", body);
    co.write("docs/adr/20000229-century-leap-day.md", body);
    const before = inventory(co.root);
    const result = await co.run();
    expect(result.code).toBe(0);
    expect(result.json!.failures).toEqual([]);
    expect(inventory(co.root)).toEqual(before);
  });

  test.each([
    "new-decision.md",
    "0074-new-number.md",
    "2026-11-11-separated-date.md",
    "2026111-short-date.md",
    "20261111.md",
    "20261111-.md",
    "20261111-Uppercase.md",
    "20261111-two--hyphens.md",
    "20261111-trailing-.md",
    "20261111-with_underscore.md",
    "20261111-space name.md",
    "20261111-wrong-extension.MD",
    "20260229-not-leap.md",
    "19000229-not-leap-century.md",
    "20260431-not-april.md",
    "20260010-zero-month.md",
    "20261301-extra-month.md",
    "20261100-zero-day.md",
    "00001111-zero-year.md",
  ])("refuses a new invalid ADR without rewriting it: %s", async name => {
    const co = checkout(up, legacySpec());
    const path = `docs/adr/${name}`;
    co.write(path, body);
    const before = inventory(co.root);
    const result = await co.run();
    expect(result.code).toBe(1);
    expect(result.json!.failures.map(f => `${f.class} ${f.item}`)).toEqual([`invalid-adr-name ${path}`]);
    expect(inventory(co.root)).toEqual(before);
  });

  test("adding another 0065 is not covered by the historical exception", async () => {
    const co = checkout(up, legacySpec());
    const added = "docs/adr/0065-another-decision.md";
    co.write(added, body);
    const result = await co.run();
    expect(result.code).toBe(1);
    expect(result.json!.failures.map(f => `${f.class} ${f.item}`)).toEqual([
      `invalid-adr-name ${added}`,
      "duplicate-adr-number 0065",
    ]);
    expect(result.json!.failures[1]!.message).toContain(first0065);
    expect(result.json!.failures[1]!.message).toContain(second0065);
    expect(result.json!.failures[1]!.message).toContain(added);
  });

  test("a different legacy number cannot acquire a duplicate", async () => {
    const co = checkout(up, legacySpec());
    co.write("docs/adr/0001-another-decision.md", body);
    const result = await co.run();
    expect(result.code).toBe(1);
    expect(result.json!.failures.map(f => f.class)).toEqual(["invalid-adr-name", "duplicate-adr-number"]);
  });

  test("unknown duplicate legacy numbers fail even when already in the comparison base", async () => {
    const spec = legacySpec();
    spec.files["docs/adr/0001-other-original.md"] = body;
    const result = await checkout(up, spec).run();
    expect(result.code).toBe(1);
    expect(result.json!.failures.map(f => `${f.class} ${f.item}`)).toEqual(["duplicate-adr-number 0001"]);
  });

  test("a new committed filename is checked against the supplied branch base", async () => {
    const co = checkout(up, legacySpec());
    const base = git(co.root, "rev-parse", "HEAD");
    co.write("docs/adr/20260230-impossible-date.md", body);
    git(co.root, "add", "docs/adr");
    git(co.root, "commit", "-qm", "candidate");
    const result = await co.run(["--base", base]);
    expect(result.code).toBe(1);
    expect(result.json!.failures.map(f => `${f.class} ${f.item}`)).toEqual(["invalid-adr-name docs/adr/20260230-impossible-date.md"]);
  });

  test("historical names are not relinted and citation prose is outside this check", async () => {
    const spec = legacySpec();
    spec.files["docs/adr/old-nonconforming-title.md"] = body;
    const co = checkout(up, spec);
    co.write("docs/adr/old-nonconforming-title.md", `${body}\nUpdated context, still citing ADR 0065.\n`);
    co.write("docs/adr/20261111-current-decision.md", `${body}\nHistorical ADR 9999 citation.\n`);
    expect((await co.run()).code).toBe(0);
  });

  test("a second branch changes only its unlanded slug before landing", async () => {
    const spec = legacySpec();
    spec.files["docs/adr/20261111-same-decision.md"] = body;
    const co = checkout(up, spec);
    co.write("docs/adr/20261111-distinct-decision.md", body);
    const before = inventory(co.root);
    expect((await co.run()).code).toBe(0);
    expect(inventory(co.root)).toEqual(before);
  });
});
