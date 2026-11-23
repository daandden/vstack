import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: join(root, "default-home") },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${p.stderr.toString()}`);
  const receipt = JSON.parse(p.stdout.toString());
  if (receipt.live && receipt.live.state !== "serving") {
    const log = join(home, ".vstack", "host", "host.log");
    throw new Error(`flow-page ${args.join(" ")} got live ${JSON.stringify(receipt.live)} on port ${port}; stderr: ${p.stderr.toString()}; host.log: ${existsSync(log) ? readFileSync(log, "utf8").slice(-2000) : "absent"}`);
  }
  return receipt;
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
    if (process.env.FLOW_READER_EVIDENCE) {
      const dir = process.env.FLOW_READER_EVIDENCE;
      mkdirSync(dir, { recursive: true });
      for (const theme of ["Light", "Dark"]) {
        await page.getByRole("button", { name: theme, exact: true }).click();
        await page.evaluate(() => scrollTo(0, 0));
        const name = join(dir, `${theme.toLowerCase()}-research`);
        await page.screenshot({ path: `${name}.png`, fullPage: true });
        writeFileSync(`${name}.aria.txt`, await page.locator("body").ariaSnapshot());
      }
    }
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

test("Jump labels identify Assumed subjects and each published attempt without moving their destinations", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Long decision history"]);
  const subjects = [
    "Keep [`captured evidence`](https://example.test/evidence)",
    "Preserve Đặng Thị Ngọc Hân's review notes",
    "Retain the deployment configuration for the European production environment",
    "Retain the deployment configuration for the European staging environment",
    ...Array.from({ length: 8 }, (_, i) => `Keep the recorded compatibility decision for service ${i + 1}`),
  ];
  const first = submit(opened.flow, opened.stage, [
    ...subjects.map((decision, i) => ({ kind: "assumed", ref: `choice-${i}`, decision, pick: "Keep the existing choice", why: "The agreed behavior stays unchanged." })),
    doc("long", "Decision evidence", 30),
    { kind: "round", questions: [question("original", "Keep the deployment route?"), question("single", "Keep the fallback?")] },
  ]);
  const second = submit(opened.flow, opened.stage, [{ kind: "round", questions: [{ ...question("retry", "Keep the deployment route?"), again: first.refs.original }] }]);
  const third = submit(opened.flow, opened.stage, [{ kind: "round", questions: [{ ...question("retry", "Keep the deployment route?"), again: second.refs.retry }] }]);
  const fourth = submit(opened.flow, opened.stage, [{ kind: "round", questions: [{ ...question("retry", "Revisit the original deployment route?"), again: first.refs.original }] }]);
  const attempts: string[] = [first.refs.original, second.refs.retry, third.refs.retry, fourth.refs.retry];
  const expectedIds: string[] = [...subjects.map((_, i) => first.refs[`choice-${i}`]), first.refs.long, first.refs.original, first.refs.single, ...attempts.slice(1)];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${opened.live.url}#${opened.stage}`);
    await page.locator(".bar .jump-row").waitFor();
    expect(await jumps(page)).toEqual(expectedIds);
    expect(await shownBlocks(page)).toEqual(expectedIds);
    const row = page.locator(".bar .jump-row");
    const firstJump = row.getByRole("link", { name: "Assumed: Keep captured evidence", exact: true });
    expect(await firstJump.getAttribute("href")).toBe(`#${first.refs["choice-0"]}`);
    expect(await firstJump.locator("code").innerText({ timeout: 2000 })).toBe("captured evidence");
    expect(await firstJump.getByRole("link").count()).toBe(0);
    for (let i = 1; i < subjects.length; i++) {
      expect(await row.locator(`a[href="#${first.refs[`choice-${i}`]}"]`).innerText()).toBe(`Assumed: ${subjects[i]}`);
    }
    expect(await row.locator(`a[href="#${first.refs.single}"]`).innerText()).toBe("Q2");
    for (const [i, id] of attempts.entries()) {
      const link = row.getByRole("link", { name: `Q1 (attempt ${i + 1})`, exact: true });
      expect(await link.getAttribute("href")).toBe(`#${id}`);
      await link.click();
      expect(await hash(page)).toBe(id);
      expect(await selected(page)).toBe(opened.stage);
      expect(await row.locator("a[aria-current]").getAttribute("href")).toBe(`#${id}`);
      expect(await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(-1);
    }
    await firstJump.click();
    expect(await hash(page)).toBe(first.refs["choice-0"]);
    await page.keyboard.press("j");
    expect(await hash(page)).toBe(first.refs["choice-1"]);
    await page.keyboard.press("k");
    expect(await hash(page)).toBe(first.refs["choice-0"]);
    await page.keyboard.press("m");
    await page.getByRole("dialog", { name: "Map" }).waitFor();
    await page.keyboard.press("Escape");
    expect(await page.getByRole("dialog", { name: "Map" }).isVisible()).toBe(false);
    expect(await hash(page)).toBe(first.refs["choice-0"]);
    for (const width of [320, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await row.isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await jumps(page)).toEqual(expectedIds);
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
    const row = page.getByRole("navigation", { name: "In this tab" });
    for (const name of ["Progress", "Observations", "Stages"]) {
      expect(await row.getByRole("link", { name, exact: true }).isVisible()).toBe(true);
    }
    const stages = row.getByRole("link", { name: "Stages", exact: true });
    expect(await stages.getAttribute("href", { timeout: 2000 })).toBe("#overview-stages");
    await stages.click();
    await stages.and(row.locator('[aria-current="location"]')).waitFor({ timeout: 2000 });
    expect(await hash(page)).toBe("overview-stages");
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
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
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

    const repaint = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.goto(`${a.live.url}#${second.q2}`);
    await page.locator(`#${second.q2}`).waitFor();
    await repaint();
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(second.q1);
    await repaint();
    expect(await hash(page)).toBe(second.q1);

    for (let i = 0; i < 100; i++) {
      await page.locator(`.bar .jump-row a[href="#${second.q1}"]`).click();
      await page.keyboard.press("n");
      expect(await hash(page)).toBe(second.q2);
      expect(await selected(page)).toBe(b.stage);
      expect(await page.locator(`#${second.q2}`).evaluate((el) => el === document.activeElement)).toBe(true);
      await repaint();
      expect(await hash(page)).toBe(second.q2);
    }

    await page.keyboard.press("n");
    await page.locator(`.bar .jump-row a[href="#${second.q2}"]`).click();
    await repaint();
    expect(await hash(page)).toBe(second.q2);
    await page.locator(`.bar .jump-row a[href="#${second.q1}"]`).click();
    await repaint();
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(second.q2);
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

test("Escape returns focus to the Stages Map trigger after keyboard opening", async () => {
  const a = cli(["open", "--skill", "research", "--title", "Map focus return"]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    const trigger = page.getByRole("button", { name: "Stages m", exact: true });
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    expect(await trigger.getAttribute("aria-haspopup")).toBe("dialog");
    for (const openWith of ["m", "Enter"] as const) {
      if (openWith === "Enter") await trigger.focus();
      await page.keyboard.press(openWith);
      await map.waitFor();
      await page.keyboard.press("Escape");
      await map.waitFor({ state: "hidden" });
      await trigger.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
      expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(true);
    }
  } finally {
    await context.close();
  }
}, 120_000);

test("a queued Map close does not take focus back from the Overview tab", async () => {
  const a = cli(["open", "--skill", "research", "--title", "Map focus after dismissal"]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    const nav = page.getByRole("navigation", { name: "Flow tabs", exact: true });
    const overview = nav.getByRole("link", { name: "Overview", exact: true });
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    await nav.waitFor();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press("m");
    await map.waitFor();
    const overviewLink = await overview.elementHandle();
    await map.evaluate(async (el, link) => {
      const closed = new Promise<void>((done) => el.addEventListener("close", () => done(), { once: true }));
      (el as HTMLDialogElement).close();
      link.focus();
      await closed;
    }, overviewLink);
    expect(await overview.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await context.close();
  }
}, 120_000);

test("Map stays open when m reopens it before the previous native close event", async () => {
  const a = cli(["open", "--skill", "research", "--title", "Rapid Map reopening"]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    const stagesButton = page.getByRole("button", { name: "Stages m", exact: true });
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    for (const reopenBeforeCloseEvent of [true, false]) {
      await stagesButton.click();
      await map.waitFor();
      const state = await map.evaluate(async (el, rapid) => {
        const dialog = el as HTMLDialogElement;
        const opener = document.querySelector<HTMLButtonElement>(".bar button[aria-haspopup='dialog']")!;
        const closed = new Promise<boolean>((resolve) => dialog.addEventListener("close", (e) => resolve(e.isTrusted), { once: true }));
        dialog.querySelector<HTMLButtonElement>("header button")!.click();
        await Promise.resolve();
        const dismissed = !dialog.open;
        const openerRestored = document.activeElement === opener;
        // Keep the rapid reopen in the same task, ahead of the browser's queued close event.
        if (!rapid) await closed;
        document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true }));
        await Promise.resolve();
        const reopened = dialog.open;
        const nativeClose = await closed;
        await new Promise(requestAnimationFrame);
        return { dismissed, openerRestored, reopened, nativeClose, stayedOpen: dialog.open, focusInside: dialog.contains(document.activeElement) };
      }, reopenBeforeCloseEvent);
      expect(state).toEqual({ dismissed: true, openerRestored: true, reopened: true, nativeClose: true, stayedOpen: true, focusInside: true });
      await page.keyboard.press("Escape");
      await map.waitFor({ state: "hidden" });
    }
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
