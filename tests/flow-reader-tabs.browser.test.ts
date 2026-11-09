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
  ref, title, description: `Choose the ${title} route.`, needs: [{ need: `Understand the ${title} consequence.`, kind: "prose" }],
  options: [{ label: "Keep", does: `${title}: keeps it`, gains: [`${title}: stability`], costs: [`${title}: no new behavior`] }, { label: "Change", does: `${title}: changes it`, gains: [`${title}: new behavior`], costs: [`${title}: work`] }],
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

test("n stays in the Focused Stage and wraps after tab clicks, fragments, h, and l", async () => {
  const a = cli(["open", "--skill", "wayfinder", "--ticket", "410", "--title", "Parallel tickets"]);
  const first = submit(a.flow, a.stage, [{ kind: "round", questions: [question("q1", "First route?"), question("q2", "Second route?")] }]).refs;
  const b = cli(["open", "--skill", "wayfinder", "--ticket", "411", "--flow", a.flow]);
  const second = submit(b.flow, b.stage, [{ kind: "round", questions: [question("q1", "Newer first route?"), question("q2", "Newer second route?")] }]).refs;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    expect(await selected(page)).toBe(b.stage);

    await page.locator(`.bar .tabs a[href="#${a.stage}"]`).click();
    await page.waitForFunction((id) => document.querySelector(`.bar .tabs a[href="#${id}"]`)?.getAttribute("aria-current") === "page", a.stage);
    const visits: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("n");
      visits.push(await hash(page));
      expect(await selected(page)).toBe(a.stage);
    }
    expect(visits).toEqual([first.q1, first.q2, first.q1]);

    await page.keyboard.press("l");
    expect(await selected(page)).toBe(b.stage);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(second.q1);
    await page.keyboard.press("h");
    expect(await selected(page)).toBe(a.stage);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(first.q1);

    await page.goto(`${a.live.url}#${second.q2}`);
    await page.locator(`#${second.q2}`).waitFor();
    expect(await selected(page)).toBe(b.stage);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(second.q1);

    await page.evaluate((id) => { location.hash = `#${id}`; }, first.q2);
    await page.waitForFunction((id) => document.querySelector(`.bar .tabs a[href="#${id}"]`)?.getAttribute("aria-current") === "page", a.stage);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(first.q1);
  } finally {
    await context.close();
  }
}, 120_000);

test("n stays put and explains when the Focused Stage has no open questions", async () => {
  const a = cli(["open", "--skill", "wayfinder", "--title", "Settled ticket"]);
  const settled = submit(a.flow, a.stage, [doc("doc", "Settled findings"), { kind: "round", questions: [question("q", "Settled route?")] }]).refs;
  submit(a.flow, a.stage, [{ kind: "answer", question: settled.q, response: { status: "answered", picks: ["A"] } }]);
  const b = cli(["open", "--skill", "wayfinder", "--flow", a.flow]);
  submit(b.flow, b.stage, [{ kind: "round", questions: [question("q", "Other ticket route?")] }]);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${settled.doc}`);
    await page.locator(`#${settled.doc}`).waitFor();
    const before = await page.evaluate(() => ({ hash: location.hash, y: scrollY }));
    await page.keyboard.press("n");
    expect(await selected(page)).toBe(a.stage);
    expect(await page.evaluate(() => ({ hash: location.hash, y: scrollY }))).toEqual(before);
    expect(await page.locator(`#${a.stage} [role="status"]`).isVisible()).toBe(true);
  } finally {
    await context.close();
  }
}, 120_000);

test("Overview and Topics use Flow-wide n order while Stage tabs keep the existing eligibility rules", async () => {
  const a = cli(["open", "--skill", "wayfinder", "--title", "Eligible ticket questions"]);
  const first = submit(a.flow, a.stage, [{ kind: "round", questions: [
    question("open", "First open route?"), question("settled", "Settled route?"), question("stale", "Earlier route?"),
  ] }]).refs;
  const again = submit(a.flow, a.stage, [
    { kind: "answer", question: first.settled, response: { status: "answered", picks: ["A"] } },
    { kind: "round", questions: [{ ...question("again", "Revised route?"), again: first.stale }] },
  ]).refs.again;
  const b = cli(["open", "--skill", "wayfinder", "--flow", a.flow]);
  const newest = submit(b.flow, b.stage, [
    { kind: "topic", title: "Navigation context", summary: "Parallel tickets.", body: "Each ticket has its own Stage.", sources: ["GLOSSARY.md"] },
    { kind: "round", questions: [question("q", "Newest route?")] },
  ]).refs.q;
  const finished = cli(["open", "--skill", "research", "--flow", a.flow]);
  const retired = submit(finished.flow, finished.stage, [{ kind: "round", questions: [question("q", "Deferred route?")] }]).refs.q;
  submit(finished.flow, finished.stage, [
    { kind: "close", decisions: [{ question: retired, text: "Deferred until another ticket." }] },
    { kind: "stage", state: "finished", retire: [{ question: retired, reason: "Deferred until another ticket." }] },
  ]);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    expect(await selected(page)).toBe(b.stage);
    for (const tab of ["overview", "topics"]) {
      await page.goto(`${a.live.url}#${tab}`);
      await page.reload();
      await page.locator(`#${tab}`).waitFor();
      expect(await selected(page)).toBe(tab);
      await page.keyboard.press("n");
      expect(await hash(page)).toBe(newest);
      expect(await selected(page)).toBe(b.stage);
    }
    for (const tab of ["overview", "topics"]) {
      await page.goto(`${a.live.url}#${newest}`);
      await page.locator(`#${newest}`).waitFor();
      await page.locator(`.bar .tabs a[href="#${tab}"]`).click();
      await page.waitForFunction((id) => document.querySelector(`.bar .tabs a[href="#${id}"]`)?.getAttribute("aria-current") === "page", tab);
      await page.keyboard.press("n");
      expect(await hash(page)).toBe(first.open);
    }

    await page.goto(`${a.live.url}#${first.open}`);
    await page.locator(`#${first.open}`).waitFor();
    const visits: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("n");
      visits.push(await hash(page));
    }
    expect(visits).toEqual([again, first.open, again]);
    await page.goto(`${a.live.url}#${retired}`);
    await page.locator(`#${retired}`).waitFor();
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(retired);
    expect(await selected(page)).toBe(finished.stage);
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
        overflow: document.documentElement.scrollWidth - innerWidth,
        below: document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom,
      };
    }, target);
    expect(geometry.wrapped).toBe(true);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
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

test("Map keys select Stages without moving page tabs, arrows pan, and dismissal restores page navigation", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Map keyboard controls"]);
  const pending = submit(a.flow, a.stage, [{ kind: "round", questions: [question("map-q", "Keep the map controls?")] }]);
  const children = Array.from({ length: 24 }, () => cli(["open", "--skill", "research", "--flow", a.flow, "--parent", a.stage]));
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    const pageTab = await selected(page);
    const initialHash = await hash(page);
    await page.keyboard.press("t");
    expect(await map.isVisible()).toBe(false);
    for (const key of ["Control+m", "Meta+m", "Alt+m", "Shift+m"]) {
      await page.keyboard.press(key);
      expect(await map.isVisible()).toBe(false);
    }
    await page.keyboard.press("m");
    await map.waitFor();
    expect(await map.getByRole("tab", { name: "Matt flow path", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("l");
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    const stageLinks = map.locator(".tree a");
    expect(await stageLinks.count()).toBe(25);
    expect(await stageLinks.first().evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await map.locator(".tree > li > .quiet").textContent()).toContain("In progress · 1 open");
    expect(await map.locator(".tree > li > ul > li").count()).toBe(24);
    await page.keyboard.press("j");
    expect(await stageLinks.nth(1).evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press("k");
    expect(await stageLinks.first().evaluate((el) => el === document.activeElement)).toBe(true);
    const pane = map.getByRole("tabpanel", { name: "Stages", exact: true });
    await page.keyboard.press("ArrowDown");
    const panned = await pane.evaluate((el) => el.scrollTop);
    expect(panned).toBeGreaterThan(0);
    await page.keyboard.press("ArrowUp");
    expect(await pane.evaluate((el) => el.scrollTop)).toBeLessThan(panned);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    expect(await selected(page)).toBe(pageTab);
    expect(await hash(page)).toBe(initialHash);
    await page.keyboard.press("h");
    expect(await map.getByRole("tab", { name: "Matt flow path", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("Escape");
    await map.waitFor({ state: "hidden" });
    const stagesButton = page.getByRole("button", { name: "Stages m", exact: true });
    await stagesButton.click();
    await map.waitFor();
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await map.waitFor({ state: "hidden" });
    await page.locator(`.bar .tabs a[href="#${children[0].stage}"][aria-current="page"]`).waitFor();
    await stagesButton.click();
    await map.getByRole("button", { name: "Close", exact: true }).click();
    await map.waitFor({ state: "hidden" });
    expect(await stagesButton.evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press("m");
    await map.waitFor();
    await page.mouse.click(1, 1);
    await map.waitFor({ state: "hidden" });
    await page.keyboard.press("h");
    expect(await selected(page)).toBe(a.stage);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(pending.refs["map-q"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
}, 120_000);

test("Map shortcuts ignore editable controls and modified keys", async () => {
  const a = cli(["open", "--skill", "research", "--title", "Typing with Map"]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await page.locator(".bar .tabs").waitFor();
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    for (const inside of [false, true]) {
      if (inside) {
        await page.keyboard.press("m");
        await map.waitFor();
      }
      for (const tag of ["input", "textarea", "select", "div"]) {
        await page.evaluate(({ tag, inside }) => {
          const el = document.createElement(tag);
          el.id = "typing-probe";
          if (tag === "div") el.contentEditable = "true";
          (inside ? document.querySelector("#map-stages")! : document.body).append(el);
          el.focus();
        }, { tag, inside });
        const before = page.url();
        for (const key of ["m", "h", "l", "j", "k", "n", "t", "ArrowDown", "ArrowRight"]) await page.keyboard.press(key);
        expect(await map.isVisible()).toBe(inside);
        expect(page.url()).toBe(before);
        expect(await page.locator("#typing-probe").evaluate((el) => el === document.activeElement)).toBe(true);
        await page.locator("#typing-probe").evaluate((el) => el.remove());
      }
      if (inside) {
        for (const key of ["Control+m", "Meta+m", "Alt+m", "Shift+m", "Control+j", "Alt+l"]) {
          await page.keyboard.press(key);
          expect(await map.isVisible()).toBe(true);
          expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
        }
      }
    }
  } finally {
    await context.close();
  }
}, 120_000);
