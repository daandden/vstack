import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const SETUP = "./node_modules/.bin/playwright-core install --only-shell chromium (CI: the \"Install Chromium\" step in .github/workflows/check-register.yml)";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-tabs-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);

function cli(args: string[], input?: object) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "tabs", "--agent", "main"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${p.stderr.toString()}`);
  return JSON.parse(p.stdout.toString());
}

const submit = (flow: string, stage: string, items: object[]) => cli(["submit", "--flow", flow, "--stage", stage], { version: 1, items });
const question = (ref: string, title: string) => ({
  ref, title, description: "Pick one.", needs: [{ need: "Know the choice.", kind: "prose" }],
  options: [{ label: "Keep", does: "Keeps it", gains: ["Stable"], costs: ["None"] }, { label: "Change", does: "Changes it", gains: ["New"], costs: ["Work"] }],
});
const doc = (ref: string, title: string, sections = 1) => ({ kind: "result", ref, shape: "document", title, sections: Array.from({ length: sections }, (_, i) => ({ heading: `Finding ${i + 1}`, blocks: [{ prose: "One finding." }] })) });

let browser: Browser;
beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    throw new Error(`Headless Chromium for playwright-core is not installed. Run: ${SETUP}\n${(e as Error).message}`);
  }
});
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

const tabs = (page: Page) => page.locator(".bar .tabs a").evaluateAll((as) => as.map((a) => ({ target: a.getAttribute("href")!.slice(1), current: a.getAttribute("aria-current") })));
const selected = async (page: Page) => (await tabs(page)).find((t) => t.current)?.target;
const shownBlocks = (page: Page) => page.locator("[data-block]").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => (el as HTMLElement).dataset.reading));
const jumps = (page: Page) => page.locator(".bar .jump-row a").evaluateAll((as) => as.filter((a) => a.getClientRects().length).map((a) => a.getAttribute("href")!.slice(1)));
const hash = (page: Page) => page.evaluate(() => location.hash.slice(1));

test("Stage tabs show each Stage's own content in first-publication order under a sticky header", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Reading by Stage"]);
  const first = submit(a.flow, a.stage, [
    { kind: "background", title: "Why tabs", summary: "Context.", sections: [{ heading: "Today", body: "One page." }], sources: ["GLOSSARY.md"] },
    { kind: "round", questions: [question("q1", "Keep the first choice?")] },
  ]);
  submit(a.flow, a.stage, [{ kind: "answer", question: first.refs.q1, response: { status: "answered", picks: ["A"] } }]);
  const b = cli(["open", "--skill", "research", "--flow", a.flow, "--parent", a.stage]);
  const research = submit(b.flow, b.stage, [doc("doc", "Research findings", 20)]);
  const second = submit(a.flow, a.stage, [{ kind: "round", questions: [question("q2", "Keep the second choice?")] }]);
  const stageA = a.stage, stageB = b.stage;
  const background = (cli(["show", "--flow", a.flow]).reading.publications as { id: string; kind: string }[]).find((p) => p.kind === "background")!.id;

  const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    expect((await tabs(page)).map((t) => t.target)).toEqual(["overview", stageA, stageB]);
    expect(await selected(page)).toBe(stageA);
    expect(await shownBlocks(page)).toEqual([background, first.refs.q1, second.refs.q2]);
    expect(await jumps(page)).toEqual([background, first.refs.q1, second.refs.q2]);

    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const bar = await page.locator(".bar").evaluate((el) => el.getBoundingClientRect().top);
    expect(bar).toBe(0);

    await page.keyboard.press("l");
    expect(await selected(page)).toBe(stageB);
    expect(await shownBlocks(page)).toEqual([research.refs.doc]);
    await page.keyboard.press("l");
    expect(await selected(page)).toBe(stageB);
    await page.keyboard.press("h");
    await page.keyboard.press("h");
    expect(await selected(page)).toBe("overview");
    expect(await shownBlocks(page)).toEqual([]);
    await page.keyboard.press("h");
    expect(await selected(page)).toBe("overview");

    const overviewStops: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("j");
      overviewStops.push(await hash(page));
    }
    expect(overviewStops).toEqual(await jumps(page));
    expect(await page.locator(".bar .jump-row a[aria-current]").getAttribute("href")).toBe(`#${overviewStops[2]}`);

    const clearance = () => page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom, research.refs.doc);
    await page.goto(`${a.live.url}#${research.refs.doc}`);
    await page.locator(`#${research.refs.doc}`).waitFor();
    expect(await selected(page)).toBe(stageB);
    expect(await clearance()).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.locator(".bar .tabs").waitFor();
      await Bun.sleep(200);
      expect(await selected(page)).toBe(stageB);
      expect(await clearance()).toBeGreaterThanOrEqual(0);
    }

    await page.goto(`${a.live.url}#${second.refs.q2}`);
    await page.locator(`#${second.refs.q2}`).waitFor();
    await page.keyboard.press("k");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { stop: el.hasAttribute("data-stop"), color: getComputedStyle(el).outlineColor };
    });
    expect(ring.stop).toBe(true);
    expect(ring.color).toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
  }
}, 120_000);

test("with no open question the page opens on Overview", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Nothing open"]);
  submit(a.flow, a.stage, [doc("doc", "Settled findings")]);
  const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    expect(await selected(page)).toBe("overview");
    expect(await page.locator("#overview").isVisible()).toBe(true);
  } finally {
    await context.close();
  }
}, 120_000);

test("old migrated tab fragments open their Stage's tab", async () => {
  const historical = join(home, ".vstack", "tmp", "_global", "tab-history");
  mkdirSync(historical, { recursive: true });
  writeFileSync(join(historical, "page.jsonl"), [
    { type: "page", id: "page", title: "Historical tabs" },
    { type: "stage", id: "first", skill: "grill-me", state: "in-progress", order: 1 },
    { type: "stage", id: "second", skill: "research", state: "in-progress", order: 2 },
    { type: "round", id: "r1", stage: "first", time: "2026-10-28T20:09:59+07:00", session: 1, round: 1 },
    { type: "question", id: "open-question", round: "r1", q: 1, title: "Still open?", description: "Pick one.",
      options: [{ label: "A. Keep", does: "Keeps it", gains: ["Stable"], costs: ["None"] }] },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n");
  const migrated = cli(["migrate", historical]);
  const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  try {
    const page = await context.newPage();
    for (const fragment of ["tab-stage-second", "stage-second", "tab-second"]) {
      await page.goto(`${migrated.live.url}#${fragment}`);
      await page.reload();
      await page.locator(".bar .tabs").waitFor();
      expect(await selected(page)).toBe("second");
    }
  } finally {
    await context.close();
  }
}, 120_000);

test("n and k keep their place at the end of a Stage tab that cannot scroll its last block to the top", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Tab end"]);
  const long = doc("long", "Long findings", 12);
  const round = submit(a.flow, a.stage, [long, { kind: "round", questions: [question("q1", "Keep the first choice?"), question("q2", "Keep the second choice?")] }]);
  const { q1, q2 } = round.refs;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    const visits: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("n");
      await Bun.sleep(150);
      visits.push(await page.evaluate(() => location.hash.slice(1)));
    }
    expect(visits).toEqual([q1, q2, q1]);
    await page.keyboard.press("n");
    await Bun.sleep(150);
    await page.keyboard.press("k");
    await Bun.sleep(150);
    expect(await page.evaluate(() => location.hash.slice(1))).toBe(q1);
  } finally {
    await context.close();
  }
}, 120_000);

test("at 360px the tab row wraps without page overflow and fragment targets land below the header", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Many Stages"]);
  let last = a;
  for (const skill of ["research", "to-spec", "to-tickets", "code-review", "maintain-app-verification", "open-pr", "babysit"]) {
    last = cli(["open", "--skill", skill, "--flow", a.flow, "--parent", a.stage]);
    submit(last.flow, last.stage, [doc("doc", `${skill} findings`)]);
  }
  const many = submit(last.flow, last.stage, [doc("long", "Long findings", 20), { kind: "round", questions: Array.from({ length: 16 }, (_, i) => question(`q${i}`, `Ship part ${i + 1}?`)) }]).refs;
  const target = many.long;
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${target}`);
    await page.locator(`#${target}`).waitFor();
    const geometry = await page.evaluate((id) => {
      const row = document.querySelector(".bar .tabs")!.getBoundingClientRect();
      const tab = document.querySelector(".bar .tabs a")!.getBoundingClientRect();
      return {
        wrapped: row.height > tab.height * 1.5,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        below: document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom,
      };
    }, target);
    expect(geometry.wrapped).toBe(true);
    expect(geometry.overflow).toBe(0);
    expect(geometry.below).toBeGreaterThanOrEqual(0);

    await page.evaluate(() => { location.hash = "#overview"; });
    await page.locator("#overview").waitFor();
    await page.evaluate((id) => { location.hash = `#${id}`; }, target);
    await Bun.sleep(200);
    expect(await page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom, target)).toBeGreaterThanOrEqual(0);
  } finally {
    await context.close();
  }
}, 120_000);
