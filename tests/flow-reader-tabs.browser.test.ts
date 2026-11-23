import { afterAll, beforeAll, expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const SETUP = "./node_modules/.bin/playwright-core install --only-shell chromium (CI: the \"Install Chromium\" step in .github/workflows/check-register.yml)";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-tabs-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);

function cli(args: string[], input?: object, cwd = root) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "tabs", "--agent", "main"], {
    cwd, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: join(root, "default-home") },
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

const submit = (flow: string, stage: string, items: object[], cwd = root) => cli(["submit", "--flow", flow, "--stage", stage], { version: 1, items }, cwd);
const question = (ref: string, title: string, again?: string) => ({
  ref, title, description: `Choose the ${title} route.`, needs: [{ need: `Understand the ${title} consequence.`, kind: "prose" }],
  brief: decisionBrief(title, { again: again ? "The earlier attempt did not settle this route." : undefined }),
  ...(again ? { again } : {}),
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

const barOf = (page: Page) => page.getByRole("navigation", { name: "Flow navigation", exact: true });
const selected = (page: Page) => page.locator("main > section[data-tab]:visible").getAttribute("data-tab");
const shown = (page: Page, id: string) => page.locator(`main > section[id="${id}"]`).waitFor();
const goViaMap = async (page: Page, id: string) => {
  await barOf(page).getByRole("button", { name: "Stages", exact: true }).click();
  await page.getByRole("tabpanel", { name: "Stages", exact: true }).locator(`a[href="#${id}"]`).click();
  await shown(page, id);
};
const shownBlocks = (page: Page) => page.locator("[data-block]").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => (el as HTMLElement).dataset.reading));
const openJump = async (page: Page) => {
  await page.keyboard.press("g");
  const panel = page.getByRole("dialog", { name: "Jump", exact: true });
  await panel.waitFor();
  return panel;
};
const jumpIds = (panel: Awaited<ReturnType<typeof openJump>>) => panel.getByRole("link").evaluateAll(as => as.map(a => a.getAttribute("href")!.slice(1)));
async function capture(page: Page, name: string, fullPage = false) {
  const dir = process.env.FLOW_NAV_EVIDENCE;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
}
const hash = (page: Page) => page.evaluate(() => location.hash.slice(1));

test("a 34-Stage Flow keeps its open queue and identity in one 44px bar", async () => {
  const title = "Regional rollout for the European production environment and the service catalogue";
  const work = "Decide the production rollout order for the European availability zones";
  const project = join(root, "regional-service-catalogue");
  mkdirSync(project);
  git(project, "init", "-q");
  const openStage = (args: string[]) => cli(["open", ...args], undefined, project);
  const send = (s: { flow: string; stage: string }, items: object[]) => submit(s.flow, s.stage, items, project);
  const opened = openStage(["--skill", "implement", "--title", title, "--ticket", "571"]);
  send(opened, [{
    kind: "wayfinder",
    tickets: [{ id: "571", title: work, url: "https://tracker.example.test/issues/571", state: "claimed", blockers: [] }],
  }]);
  const first = send(opened, [{ kind: "round", now: "The pilot rollout is ready to review.", questions: [question("prior", "Reuse the pilot rollout?")] }]).refs;
  send(opened, [{
    kind: "answer", question: first.prior, response: { status: "answered", text: "What if the oldest zone is unavailable?" },
    reading: { outcome: "concern", unresolved: "Check whether the oldest zone is required." },
  }]);
  const open = send(opened, [{
    kind: "round",
    now: "The pilot review raised a concern about the oldest availability zone.",
    questions: [
      question("retry", "How should the rollout handle an unavailable zone?", first.prior),
      ...Array.from({ length: 20 }, (_, i) => question(`zone-${i}`, `Keep the fallback for zone ${i + 1}?`)),
    ],
  }]).refs;
  send(opened, [{
    kind: "answer", question: open["zone-0"], response: { status: "answered", text: "Will the fallback be safe during maintenance?" },
    reading: { outcome: "concern", unresolved: "Check the maintenance policy." },
  }]);
  const other = Array.from({ length: 33 }, (_, i) => {
    const ticket = i < 4 ? String(572 + i) : i % 2 === 0 ? "577" : undefined;
    const st = openStage(["--skill", "research", "--flow", opened.flow, "--parent", opened.stage, ...(ticket ? ["--ticket", ticket] : [])]);
    if (i < 4) send(st, [{ kind: "round", now: `The rollout in zone ${i + 1} needs a dependency decision.`, questions: [question("pending", `Keep the dependency for zone ${i + 1}?`)] }]);
    if (i >= 5) send(st, [{ kind: "stage", state: "finished" }]);
    return st;
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 768 } });
  try {
    await page.goto(`${opened.live.url}#${open.retry}`);
    await page.locator(`#${open.retry}`).waitFor();
    expect(await page.locator(".bar").evaluate(el => el.getBoundingClientRect().height)).toBe(44);
    const bar = page.getByRole("navigation", { name: "Flow navigation", exact: true });
    const overview = bar.getByRole("link", { name: title, exact: true });
    const current = bar.getByRole("link", { name: /How should the rollout handle an unavailable zone\?.*Concern/ });
    const stages = bar.getByRole("button", { name: "Stages", exact: true });
    const jump = bar.getByRole("button", { name: "Jump", exact: true });
    expect(await overview.getAttribute("href")).toBe("#overview");
    expect(await bar.getByText("regional-service-catalogue", { exact: true }).isVisible()).toBe(true);
    expect(await bar.getByText(work, { exact: true }).isVisible()).toBe(true);
    expect(await current.getAttribute("aria-current")).toBe("location");
    expect(await current.innerText()).toContain("!");
    expect(await page.getByText("In your picker", { exact: false }).count()).toBe(0);
    const overflow = bar.getByRole("button", { name: /^\+\d+ open$/ });
    const assertFits = async (target: typeof stages) => {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(12);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(44);
    };
    for (const target of [overview, current, stages, jump, overflow]) await assertFits(target);
    const queueLinks = await bar.locator('a[href^="#"]').evaluateAll((links, ids) =>
      links.filter(link => ids.includes(link.getAttribute("href")!.slice(1))).length, Object.values(open) as string[]);
    expect(queueLinks + Number((await overflow.innerText()).match(/\d+/)![0])).toBe(21);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.emulateMedia({ colorScheme: "dark" });
    await capture(page, "bar-800-dark");
    await overflow.click();
    const queuePanel = page.getByRole("dialog", { name: "Jump", exact: true });
    await queuePanel.waitFor();
    expect(await queuePanel.getByRole("link").count()).toBe(21);
    await capture(page, "jump-800-dark");
    await page.keyboard.press("Escape");
    await queuePanel.waitFor({ state: "hidden" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    for (const target of [overview, current, stages, jump, overflow]) await assertFits(target);
    expect(await bar.evaluate(el => el.getBoundingClientRect().height)).toBe(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await capture(page, "bar-800-text-growth");
    await page.evaluate(() => { document.documentElement.style.removeProperty("font-size"); });
    await page.setViewportSize({ width: 320, height: 768 });
    for (const target of [overview, current, stages, jump, overflow]) await assertFits(target);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const more = bar.getByRole("button", { name: /^\+\d+ waiting Stages?$/ });
    await assertFits(more);
    await more.click();
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    const mapStages = map.getByRole("tabpanel", { name: "Stages", exact: true });
    await mapStages.waitFor();
    expect(await mapStages.getByRole("region", { name: "Waiting for an answer" }).getByRole("link").count()).toBe(5);
    await capture(page, "map-320-dark");
    await page.keyboard.press("Escape");
    await map.waitFor({ state: "hidden" });
    await page.emulateMedia({ colorScheme: "light" });
    await capture(page, "bar-320-light");
    await page.setViewportSize({ width: 2560, height: 1000 });
    await bar.getByRole("button", { name: "+1 waiting Stage", exact: true }).waitFor();
    const shownWaiting = await bar.locator('a[href^="#"]').evaluateAll((links, ids) =>
      links.filter(link => ids.includes(link.getAttribute("href")!.slice(1))).map(link => link.textContent), other.map(st => st.stage));
    expect(shownWaiting).toHaveLength(3);
    expect(shownWaiting.every(label => label?.includes("1"))).toBe(true);
    expect(await bar.getByRole("button", { name: "+1 waiting Stage", exact: true }).isVisible()).toBe(true);
    expect(await bar.getByRole("link", { name: /Keep the fallback for zone 1\?.*Concern recorded/ }).innerText()).toContain("!");
    await capture(page, "bar-2560-light");
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(await bar.evaluate(el => el.getBoundingClientRect().top)).toBe(0);
  } finally {
    await page.close();
  }
}, 120_000);

test("Map opens on Stages, pins waiting work, and folds finished Stages by ticket", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Separate finished rollout work"]);
  const start = (ticket?: string) => cli(["open", "--skill", "research", "--flow", opened.flow, ...(ticket ? ["--ticket", ticket] : [])]);
  const closed = start("501");
  const closedAgain = start("501");
  const ticketless = start();
  for (const s of [closed, closedAgain, ticketless]) submit(s.flow, s.stage, [{ kind: "stage", state: "finished" }]);
  const waiting = start("502");
  submit(waiting.flow, waiting.stage, [{ kind: "round", now: "The pilot route is ready to review.", questions: [question("ask", "Keep the pilot route?")] }]);
  const page = await browser.newPage();
  try {
    await page.goto(`${opened.live.url}#${opened.stage}`);
    await page.locator(`#${opened.stage}`).waitFor();
    await page.keyboard.press("m");
    const map = page.getByRole("dialog", { name: "Map" });
    await map.waitFor();
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    const pane = map.getByRole("tabpanel", { name: "Stages", exact: true });
    const targets = () => pane.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(await targets()).toEqual([`#${waiting.stage}`, `#${opened.stage}`]);
    expect(await pane.getByText("In progress · 1 open", { exact: true }).isVisible()).toBe(true);
    await pane.getByText("#501 · 2 Stages", { exact: true }).click();
    await pane.getByText("Ticketless · 1 Stage", { exact: true }).click();
    expect(await targets()).toEqual([waiting.stage, opened.stage, closed.stage, closedAgain.stage, ticketless.stage].map(id => `#${id}`));
    await pane.locator(`a[href="#${closedAgain.stage}"]`).click();
    await map.waitFor({ state: "hidden" });
    expect(await hash(page)).toBe(closedAgain.stage);
    expect(await page.locator(`#${closedAgain.stage}`).evaluate(el => document.activeElement === el)).toBe(true);
  } finally {
    await page.close();
  }
}, 120_000);

test("Stage tabs show each Stage's own content in first-publication order under a sticky header", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Reading by Stage"]);
  const first = submit(a.flow, a.stage, [
    { kind: "background", title: "Why tabs", summary: "Context.", sections: [{ heading: "Today", body: "One page." }], sources: ["GLOSSARY.md"] },
    { kind: "round", now: "The routing options are ready for review.", questions: [question("q1", "Keep the first choice?")] },
  ]);
  submit(a.flow, a.stage, [{ kind: "answer", question: first.refs.q1, response: { status: "answered", picks: ["A"] } }]);
  const b = cli(["open", "--skill", "research", "--flow", a.flow, "--parent", a.stage]);
  const research = submit(b.flow, b.stage, [doc("doc", "Research findings", 20)]);
  const second = submit(a.flow, a.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("q2", "Keep the second choice?")] }]);
  const stageA = a.stage, stageB = b.stage;
  const background = (cli(["show", "--flow", a.flow]).reading.publications as { id: string; kind: string }[]).find((p) => p.kind === "background")!.id;

  const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${stageA}`);
    await shown(page, stageA);
    expect(await selected(page)).toBe(stageA);
    expect(await page.locator(`#${stageA} [data-reading]`).evaluateAll(els => els.map(el => (el as HTMLElement).dataset.reading))).toEqual([background, first.refs.q1, second.refs.q2]);
    const stageJump = await openJump(page);
    expect(await jumpIds(stageJump)).toEqual([background, first.refs.q1, second.refs.q2]);
    await page.keyboard.press("Escape");
    await stageJump.waitFor({ state: "hidden" });

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

    const overviewIndex = await openJump(page);
    await overviewIndex.getByRole("link", { name: "Open decisions", exact: true }).click();
    await overviewIndex.waitFor({ state: "hidden" });
    for (const name of ["Progress", "Changed since your last visit", "All Stages", "Topics"]) {
      await page.keyboard.press("j");
      expect(await page.locator("#overview summary:focus").innerText()).toBe(name);
    }
    const overviewJump = await openJump(page);
    expect(await overviewJump.getByRole("link").allTextContents()).toEqual([
      "Open decisions", "Progress", "Observations", "Changed since your last visit", "All Stages", "Topics",
    ]);
    expect(await overviewJump.locator("a[aria-current]").innerText()).toBe("Topics");
    await overviewJump.getByRole("link", { name: "Observations", exact: true }).click();
    await overviewJump.waitFor({ state: "hidden" });
    await page.getByRole("region", { name: "Read-only observations", exact: true }).waitFor();
    expect(await hash(page)).toBe("observations");

    const clearance = () => page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom, research.refs.doc);
    await page.goto(`${a.live.url}#${research.refs.doc}`);
    await page.locator(`#${research.refs.doc}`).waitFor();
    expect(await selected(page)).toBe(stageB);
    expect(await clearance()).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.locator(`#${research.refs.doc}`).waitFor();
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

test("Jump lists the latest attempts, one Assumed-picks entry, and exact reading destinations", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Long decision history"]);
  const assumed = (ref: string, decision: string) => ({ kind: "assumed", ref, decision, pick: "Keep the existing choice", why: "The agreed behavior stays unchanged." });
  const first = submit(opened.flow, opened.stage, [
    { kind: "background", ref: "context", title: "Deployment context", summary: "Context.", sections: [{ heading: "Today", body: "One route." }], sources: ["GLOSSARY.md"] },
    assumed("first-pick", "Keep captured evidence"),
    assumed("second-pick", "Preserve Đặng Thị Ngọc Hân's review notes"),
    doc("long", "Decision evidence", 30),
    assumed("third-pick", "Retain the European production environment"),
    { kind: "round", now: "The routing options are ready for review.", questions: [question("original", "Keep the deployment route?"), question("cross", "Keep the fallback?")] },
  ]).refs;
  const second = submit(opened.flow, opened.stage, [{ kind: "round", now: "The deployment route remains undecided.", questions: [question("retry", "Revisit the deployment route?", first.original)] }]).refs;
  submit(opened.flow, opened.stage, [
    { kind: "answer", question: second.retry, response: { status: "answered", picks: ["A"] } },
    { kind: "stage", state: "finished", retire: [{ question: first.cross, reason: "Continue in a later Stage." }] },
  ]);
  const later = cli(["open", "--flow", opened.flow, "--skill", "research", "--parent", opened.stage]);
  const third = submit(later.flow, later.stage, [{ kind: "round", now: "The deployment route is settled and the fallback still needs a decision.", questions: [question("retry", "Revisit the fallback?", first.cross)] }]).refs;
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  try {
    await page.goto(`${opened.live.url}#${first.long}`);
    await page.locator(`#${first.long}`).waitFor();
    const jump = page.getByRole("dialog", { name: "Jump" });
    const trigger = page.getByRole("button", { name: "Jump", exact: true });
    expect(await jump.isVisible()).toBe(false);
    await page.keyboard.press("g");
    await jump.waitFor({ timeout: 3000 });
    const links = jump.getByRole("link");
    expect(await links.evaluateAll(as => as.map(a => a.getAttribute("href")))).toEqual(
      [first.context, `${first["first-pick"]}-batch`, first.long, second.retry].map(id => `#${id}`),
    );
    expect(await jump.getByRole("link", { name: /Revisit the deployment route.*Your pick: A/ }).isVisible()).toBe(true);
    expect(await jump.getByRole("link", { name: "Decision evidence", exact: true }).getAttribute("aria-current")).toBe("location");
    await jump.getByRole("link", { name: "Assumed picks", exact: true }).click();
    await jump.waitFor({ state: "hidden" });
    expect(await hash(page)).toBe(`${first["first-pick"]}-batch`);
    expect(await page.getByRole("heading", { name: "Keep captured evidence", exact: true }).isVisible()).toBe(true);
    await trigger.click();
    await page.keyboard.press("Escape");
    await jump.waitFor({ state: "hidden" });
    expect(await trigger.evaluate(el => el === document.activeElement)).toBe(true);
    await page.goto(`${opened.live.url}#${first.cross}`);
    await page.locator(`#${first.cross}`).waitFor();
    await page.locator(`#${first.cross}`).locator(`a[href="#${third.retry}"]`).first().click();
    await page.locator(`#${third.retry}`).waitFor();
    await trigger.click();
    expect(await jump.getByRole("link", { name: /Revisit the fallback.*Open/ }).getAttribute("href")).toBe(`#${third.retry}`);
  } finally {
    await page.close();
  }
}, 120_000);

test("a fresh bare link opens the Flow's current decision queue before choosing a Stage", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Production failover decisions"]);
  const first = submit(opened.flow, opened.stage, [{ kind: "round", now: "The initial failover review is ready.", questions: [
    question("prior", "Keep the existing failover?"),
    question("settled", "Keep the release freeze?"),
  ] }]).refs;
  submit(opened.flow, opened.stage, [
    { kind: "answer", question: first.prior, response: { status: "answered", text: "What if the replica is stale?" }, reading: { outcome: "concern", unresolved: "Check replica lag." } },
    { kind: "answer", question: first.settled, response: { status: "answered", picks: ["A"] } },
  ]);
  const next = submit(opened.flow, opened.stage, [{ kind: "round", now: "Replica lag crossed the failover threshold.", questions: [
    question("retry", "Change the failover threshold?", first.prior),
    question("reply", "Keep the replica alert?"),
    question("fresh", "Add the follow-up report for AvailabilityZoneRecoveryConfigurationWithDelayedReplicaPromotion?"),
  ] }]).refs;
  submit(opened.flow, opened.stage, [{ kind: "answer", question: next.reply, response: { status: "answered", text: "Who receives the alert?" }, reading: { outcome: "question", unresolved: "Name the on-call team." } }]);
  const research = cli(["open", "--flow", opened.flow, "--skill", "research", "--parent", opened.stage]);
  const second = submit(research.flow, research.stage, [{ kind: "round", now: "The retention review needs an owner.", questions: [
    question("retention", "Assign the retention review?"),
  ] }]).refs;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(opened.live.url);
    const decisions = page.getByRole("region", { name: "Open decisions", exact: true });
    await decisions.waitFor({ timeout: 3000 });
    expect(await selected(page)).toBe("overview");
    expect(await hash(page)).toBe("");
    const groups = decisions.getByRole("list");
    expect(await groups.count()).toBe(2);
    const targets = (group: ReturnType<typeof groups.nth>) =>
      group.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(await targets(groups.nth(0))).toEqual([`#${second.retention}`]);
    expect(await targets(groups.nth(1))).toEqual([next.retry, next.reply, next.fresh].map(id => `#${id}`));
    expect(await groups.nth(0).getByText("The retention review needs an owner.", { exact: true }).isVisible()).toBe(true);
    const [retry, reply, fresh] = await groups.nth(1).getByRole("listitem").all();
    expect(await retry!.getByText("Replica lag crossed the failover threshold.", { exact: true }).isVisible()).toBe(true);
    expect(await retry!.getByText("Concern", { exact: true }).isVisible()).toBe(true);
    expect(await reply!.getByText("Question, not settled", { exact: true }).isVisible()).toBe(true);
    expect(await fresh!.getByText("Open", { exact: true }).isVisible()).toBe(true);
    const time = retry!.locator("time[datetime]");
    expect(await time.innerText()).toMatch(/just now|\bago$/);
    expect(Date.parse((await time.getAttribute("datetime"))!)).toBeGreaterThan(0);
    await capture(page, "overview-decisions-1280", true);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await barOf(page).getByRole("button", { name: "+2 waiting Stages", exact: true }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await capture(page, "overview-decisions-320-dark", true);
    await retry!.getByRole("link", { name: "Change the failover threshold?", exact: true }).click();
    await page.locator(`#${next.retry}`).waitFor();
    expect(await selected(page)).toBe(opened.stage);
    expect(await hash(page)).toBe(next.retry);
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(next.reply);
    await page.goBack();
    await decisions.waitFor();
    expect(await hash(page)).toBe("");
    await page.goto(`${opened.live.url}#${research.stage}`);
    await shown(page, research.stage);
    await page.goto(`${opened.live.url}#${first.prior}`);
    await page.locator(`#${first.prior}-fold[open]`).waitFor();
    expect(await selected(page)).toBe(opened.stage);
  } finally {
    await page.close();
  }
}, 30_000);

test("with no open question the page opens on Overview", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Nothing open"]);
  submit(a.flow, a.stage, [doc("doc", "Settled findings")]);
  const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await barOf(page).waitFor();
    expect(await selected(page)).toBe("overview");
    expect(await page.locator("#overview").isVisible()).toBe(true);
    expect(await page.getByText("No open decisions.", { exact: true }).isVisible()).toBe(true);
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
      await shown(page, "second");
      expect(await selected(page)).toBe("second");
    }
  } finally {
    await context.close();
  }
}, 120_000);

test("n and k keep their place at the end of a Stage tab that cannot scroll its last block to the top", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Tab end"]);
  const long = doc("long", "Long findings", 12);
  const round = submit(a.flow, a.stage, [long, { kind: "round", now: "The routing options are ready for review.", questions: [question("q1", "Keep the first choice?"), question("q2", "Keep the second choice?")] }]);
  const { q1, q2 } = round.refs;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${a.stage}`);
    await shown(page, a.stage);
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

test("n stays in the Focused Stage and wraps after Map links, fragments, h, and l", async () => {
  const a = cli(["open", "--skill", "wayfinder", "--ticket", "410", "--title", "Parallel tickets"]);
  const first = submit(a.flow, a.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("q1", "First route?"), question("q2", "Second route?")] }]).refs;
  const b = cli(["open", "--skill", "wayfinder", "--ticket", "411", "--flow", a.flow]);
  const second = submit(b.flow, b.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("q1", "Newer first route?"), question("q2", "Newer second route?")] }]).refs;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(`${a.live.url}#${b.stage}`);
    await shown(page, b.stage);
    expect(await selected(page)).toBe(b.stage);

    await goViaMap(page, a.stage);
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
    await shown(page, a.stage);
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
      await barOf(page).locator(`a[href="#${second.q1}"]`).click();
      await page.keyboard.press("n");
      expect(await hash(page)).toBe(second.q2);
      expect(await selected(page)).toBe(b.stage);
      expect(await page.locator(`#${second.q2}`).evaluate((el) => el === document.activeElement)).toBe(true);
      await repaint();
      expect(await hash(page)).toBe(second.q2);
    }

    await page.keyboard.press("n");
    await barOf(page).locator(`a[href="#${second.q2}"]`).click();
    await repaint();
    expect(await hash(page)).toBe(second.q2);
    await barOf(page).locator(`a[href="#${second.q1}"]`).click();
    await repaint();
    await page.keyboard.press("n");
    expect(await hash(page)).toBe(second.q2);
  } finally {
    await context.close();
  }
}, 120_000);

test("n stays put and explains when the Focused Stage has no open questions", async () => {
  const a = cli(["open", "--skill", "wayfinder", "--title", "Settled ticket"]);
  const settled = submit(a.flow, a.stage, [doc("doc", "Settled findings"), { kind: "round", now: "The routing options are ready for review.", questions: [question("q", "Settled route?")] }]).refs;
  submit(a.flow, a.stage, [{ kind: "answer", question: settled.q, response: { status: "answered", picks: ["A"] } }]);
  const b = cli(["open", "--skill", "wayfinder", "--flow", a.flow]);
  submit(b.flow, b.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("q", "Other ticket route?")] }]);
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
  const first = submit(a.flow, a.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [
    question("open", "First open route?"), question("settled", "Settled route?"), question("stale", "Earlier route?"),
  ] }]).refs;
  const again = submit(a.flow, a.stage, [
    { kind: "answer", question: first.settled, response: { status: "answered", picks: ["A"] } },
    { kind: "round", now: "The routing options are ready for review.", questions: [question("again", "Revised route?", first.stale)] },
  ]).refs.again;
  const b = cli(["open", "--skill", "wayfinder", "--flow", a.flow]);
  const newest = submit(b.flow, b.stage, [
    { kind: "topic", title: "Navigation context", summary: "Parallel tickets.", body: "Each ticket has its own Stage.", sources: ["GLOSSARY.md"] },
    { kind: "round", now: "The routing options are ready for review.", questions: [question("q", "Newest route?")] },
  ]).refs.q;
  const finished = cli(["open", "--skill", "research", "--flow", a.flow]);
  const retired = submit(finished.flow, finished.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("q", "Deferred route?")] }]).refs.q;
  submit(finished.flow, finished.stage, [
    { kind: "close", decisions: [{ question: retired, text: "Deferred until another ticket." }] },
    { kind: "stage", state: "finished", retire: [{ question: retired, reason: "Deferred until another ticket." }] },
  ]);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${b.stage}`);
    await shown(page, b.stage);
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
      if (tab === "overview") await barOf(page).getByRole("link", { name: "Eligible ticket questions", exact: true }).click();
      else await goViaMap(page, tab);
      await shown(page, tab);
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

test("at 360px the bar stays one row without page overflow and fragments clear it", async () => {
  const a = cli(["open", "--skill", "grill-me", "--title", "Many Stages"]);
  let last = a;
  for (const skill of ["research", "to-spec", "to-tickets", "code-review", "maintain-app-verification", "open-pr", "babysit"]) {
    last = cli(["open", "--skill", skill, "--flow", a.flow, "--parent", a.stage]);
    submit(last.flow, last.stage, [doc("doc", `${skill} findings`)]);
  }
  const many = submit(last.flow, last.stage, [doc("long", "Long findings", 20), { kind: "round", now: "The routing options are ready for review.", questions: Array.from({ length: 16 }, (_, i) => question(`q${i}`, `Ship part ${i + 1}?`)) }]).refs;
  const target = many.long;
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(`${a.live.url}#${target}`);
    await page.locator(`#${target}`).waitFor();
    const geometry = await page.evaluate((id) => {
      const row = document.querySelector(".bar")!.getBoundingClientRect();
      return {
        height: row.height,
        overflow: document.documentElement.scrollWidth - innerWidth,
        below: document.getElementById(id)!.getBoundingClientRect().top - document.querySelector(".bar")!.getBoundingClientRect().bottom,
      };
    }, target);
    expect(geometry.height).toBe(44);
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
  const pending = submit(a.flow, a.stage, [{ kind: "round", now: "The routing options are ready for review.", questions: [question("map-q", "Keep the map controls?")] }]);
  const children = Array.from({ length: 24 }, () => cli(["open", "--skill", "research", "--flow", a.flow, "--parent", a.stage]));
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    await barOf(page).waitFor();
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
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    const stageLinks = map.getByRole("tabpanel", { name: "Stages", exact: true }).getByRole("link");
    expect(await stageLinks.count()).toBe(25);
    expect(await stageLinks.first().evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await map.getByRole("region", { name: "Waiting for an answer" }).getByText("In progress · 1 open", { exact: true }).isVisible()).toBe(true);
    expect(await map.getByRole("region", { name: "No open questions" }).getByRole("link").count()).toBe(24);
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
    const stagesButton = barOf(page).getByRole("button", { name: "Stages", exact: true });
    await stagesButton.click();
    await map.waitFor();
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await map.waitFor({ state: "hidden" });
    await shown(page, children[0].stage);
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

test("Map stays open when m reopens it before the previous native close event", async () => {
  const a = cli(["open", "--skill", "research", "--title", "Rapid Map reopening"]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(a.live.url);
    const stagesButton = barOf(page).getByRole("button", { name: "Stages", exact: true });
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    for (const reopenBeforeCloseEvent of [true, false]) {
      await stagesButton.click();
      await map.waitFor();
      const state = await map.evaluate(async (el, rapid) => {
        const dialog = el as HTMLDialogElement;
        const opener = document.getElementById("flow-stages")!;
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
    await barOf(page).waitFor();
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
        for (const key of ["m", "g", "h", "l", "j", "k", "n", "t", "ArrowDown", "ArrowRight"]) await page.keyboard.press(key);
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
