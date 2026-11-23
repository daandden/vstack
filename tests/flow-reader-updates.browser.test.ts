import { expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("eight parked readers release HTTP/1.1 capacity and retain their place through authored and observation-only updates", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-updates-")));
  const home = join(root, "home");
  mkdirSync(home);
  git(root, "init", "-q");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed");
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], input?: object): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "reader-updates", "--agent", "fixture"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  let remote = "open";
  const methods: string[] = [];
  const observedAt = new Date().toISOString();
  const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    methods.push(req.method);
    return Response.json({ observed_at: observedAt, records: [{ name: "Capacity PR", state: remote }] });
  } });
  mkdirSync(join(root, "docs", "vstack"), { recursive: true });
  writeFileSync(join(root, "docs", "vstack", "code-host.md"), `- Flow observation: ${JSON.stringify({ adapter: "http-json", url: provider.url.origin, poll_seconds: 0.1 })}\n`);
  writeFileSync(join(root, "evidence.txt"), "Captured capacity evidence\n");
  const browser = await chromium.launch({ headless: true, ...(process.env.VSTACK_TEST_BROWSER_CHANNEL ? { channel: process.env.VSTACK_TEST_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const readers: Page[] = [];
  try {
    const opened = cli(["open", "--skill", "research", "--title", "Reader capacity fixture"]);
    const seed = cli(["submit"], { version: 1, items: [
      { kind: "attachment", ref: "capture", type: "file", path: "evidence.txt", caption: "Capacity evidence", origin: "Owned fixture" },
      { kind: "result", ref: "before", shape: "document", title: "Earlier evidence", sections: [{ heading: "Context", blocks: [{ prose: "Earlier reading context. ".repeat(200) }] }] },
      { kind: "result", ref: "selected", shape: "document", title: "Selected evidence", attachments: ["capture"], sections: [{ heading: "Reading stop", blocks: [{ prose: "Keep this reading stop selected." }] }] },
    ] });
    await context.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { get: () => "hidden" });
      Object.defineProperty(document, "hidden", { get: () => true });
    });
    let contentReads = 0;
    context.on("request", (req) => { if (new URL(req.url()).pathname.endsWith("/content")) contentReads++; });
    for (let i = 0; i < 8; i++) {
      const page = await context.newPage();
      readers.push(page);
      await page.goto(`${opened.live.url}#${seed.refs.before}`, { waitUntil: "domcontentloaded", timeout: 5000 });
      await page.locator(`#${seed.refs.selected}`).waitFor({ timeout: 5000 });
    }
    const selected = readers[6]!;
    await selected.route(/\/(versions|content|observations)$/, async (route) => {
      const response = await route.fetch();
      await Bun.sleep(750);
      await route.fulfill({ response });
    });
    const endViewport = await selected.locator(`#${seed.refs.selected}`).evaluate((el) => Math.ceil(
      document.documentElement.scrollHeight - (el.getBoundingClientRect().top + scrollY)
      + parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) + 6,
    ));
    await selected.setViewportSize({ width: 1280, height: endViewport });
    const selectedLink = selected.getByRole("link", { includeHidden: true }).and(selected.locator(`[href="#${seed.refs.selected}"]`));
    await selected.evaluate((id) => { location.hash = id; }, seed.refs.selected);
    await selected.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await selectedLink.getAttribute("aria-current")).toBe("location");
    const position = await selected.locator(`#${seed.refs.selected}`).evaluate((el) => el.getBoundingClientRect().top);
    const address = selected.url();
    const focus = await selected.evaluate(() => document.activeElement?.id);
    const scroll = await selected.evaluate(() => scrollY);
    const captured = await readers[7]!.evaluate(async (attachmentId) => {
      const model = await (await fetch(new URL("content", location.href))).json();
      const file = model.attachments.find((a: any) => a.id === attachmentId).file;
      return await (await fetch(new URL(`assets/${file}`, location.href))).text();
    }, seed.refs.capture);
    expect(captured).toBe("Captured capacity evidence\n");
    const unchangedReads = contentReads;
    const observations = readers.map((p) => p.waitForResponse(async (response) =>
      new URL(response.url()).pathname.endsWith("/observations") && (await response.json())["code-host"]?.records[0]?.state === "merged", { timeout: 6000 }));
    remote = "merged";
    await Promise.all(observations);
    expect(contentReads).toBe(unchangedReads);
    const saved = await (await fetch(new URL("content", opened.live.url))).json() as any;
    expect(saved.revision).toBe(seed.revision);
    expect(saved.flow.id).toBe(opened.flow);
    const updates = readers.map((p) => p.waitForResponse(async (response) =>
      new URL(response.url()).pathname.endsWith("/content") && (await response.json()).revision > seed.revision, { timeout: 6000 }));
    const updated = cli(["submit"], { version: 1, items: [
      { kind: "result", revises: seed.refs.before, shape: "document", title: "Expanded earlier evidence", sections: [{ heading: "Context", blocks: [{ prose: "Expanded reading context. ".repeat(400) }] }] },
    ] });
    const responses = await Promise.all(updates);
    for (const response of responses) {
      const model = await response.json();
      expect(model.revision).toBe(updated.revision);
      expect(model.stages.flatMap((stage: any) => stage.results).find((result: any) => result.id === seed.refs.before).title).toBe("Expanded earlier evidence");
    }
    await selected.waitForFunction((previous) => scrollY > previous, scroll);
    expect(selected.url()).toBe(address);
    expect(await selected.evaluate(() => document.activeElement?.id)).toBe(focus);
    expect(await selectedLink.getAttribute("aria-current")).toBe("location");
    expect(Math.abs(await selected.locator(`#${seed.refs.selected}`).evaluate((el) => el.getBoundingClientRect().top) - position)).toBeLessThan(2);
    expect((await (await fetch(new URL("versions", opened.live.url))).json() as any).revision).toBe(updated.revision);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === "GET")).toBe(true);
    const reads = await selected.evaluate(() => performance.getEntriesByType("resource")
      .filter((r) => /\/(versions|content|observations)$/.test(r.name))
      .map((r) => ({ start: r.startTime, end: (r as PerformanceResourceTiming).responseEnd, duration: r.duration }))
      .sort((a, b) => a.start - b.start));
    expect(reads.some((r) => r.duration >= 700)).toBe(true);
    for (let i = 1; i < reads.length; i++) expect(reads[i]!.start).toBeGreaterThanOrEqual(reads[i - 1]!.end);
    expect((await fetch(new URL("versions", opened.live.url), { method: "POST" })).status).toBe(405);
    expect(context.pages()).toHaveLength(8);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    provider.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

const question = (ref: string, title = ref, again?: string) => ({
  ref, title, description: `Choose the ${title} route.`,
  brief: decisionBrief(title, { again: again ? "The reader has not yet settled the earlier route." : undefined }),
  ...(again ? { again } : {}),
  needs: [{ need: `Understand the ${title} consequence.`, kind: "prose" }],
  options: [
    { label: "Keep", does: `${title}: keeps the route.`, gains: [`${title}: stability`], costs: [`${title}: no change`] },
    { label: "Change", does: `${title}: changes the route.`, gains: [`${title}: new behavior`], costs: [`${title}: work`] },
  ],
});
const documentResult = (ref: string, paragraphs = 1) => ({
  kind: "result", ref, shape: "document", title: ref,
  sections: [{ heading: "Reading context", blocks: [{ prose: "Keep reading this evidence. ".repeat(paragraphs) }] }],
});

async function liveReader() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-follow-")));
  const home = join(root, "home");
  mkdirSync(home);
  git(root, "init", "-q");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed");
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], input?: object): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "reader-follow", "--agent", "fixture"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const opened = cli(["open", "--skill", "grill-me", "--title", "Follow the Focused Stage"]);
  const submit = (stage: string, items: object[]) => cli(["submit", "--flow", opened.flow, "--stage", stage], { version: 1, items });
  const seed = submit(opened.stage, [
    documentResult("reading", 300),
    { kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("existing")] },
    { kind: "result", ref: "lesson", shape: "quiz", title: "Learning while questions arrive", questions: [
      { ref: "word", prompt: "Type Flow", answer: { text: ["Flow"] }, explanation: "A learning answer does not settle a real ask." },
    ] },
    documentResult("tail", 300),
  ]);
  const other = cli(["open", "--skill", "research", "--flow", opened.flow]);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
  await page.goto(`${opened.live.url}#${seed.refs.reading}`);
  await page.locator(`#${seed.refs.reading}`).waitFor();
  return {
    page, opened, other, seed, submit,
    async close() {
      await browser.close();
      cli(["host", "stop"]);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const selectedStop = (page: Page) => page.locator(".bar .jump-row a[aria-current]").getAttribute("href");
const pagePosition = (page: Page) => page.evaluate(() => ({
  tab: document.querySelector(".bar .tabs a[aria-current]")?.getAttribute("href"),
  stop: document.querySelector(".bar .jump-row a[aria-current]")?.getAttribute("href"),
  scroll: scrollY,
}));
const renderedUpdate = (page: Page, stage: string, title: string) => page.locator(`[data-tab="${stage}"]`).getByRole("heading", { name: title, includeHidden: true }).waitFor({ state: "attached" });

test("live questions select and reveal only the Focused Stage, even from another reading block", async () => {
  const f = await liveReader();
  const { page, opened, other, seed, submit } = f;
  try {
    const before = await pagePosition(page);
    submit(other.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("parallel", "Parallel ticket question")] }]);
    await renderedUpdate(page, other.stage, "Parallel ticket question");
    expect(await pagePosition(page)).toEqual(before);

    const fresh = submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("new", "New focused question")] }]);
    await renderedUpdate(page, opened.stage, "New focused question");
    await page.waitForFunction((id) => document.querySelector(".bar .jump-row a[aria-current]")?.getAttribute("href") === `#${id}`, fresh.refs.new, { timeout: 5000 });
    expect(await selectedStop(page)).toBe(`#${fresh.refs.new}`);
    expect(await page.evaluate((id) => {
      const box = document.getElementById(id)!.getBoundingClientRect();
      return box.top >= document.querySelector(".bar")!.getBoundingClientRect().bottom - 1 && box.top < innerHeight;
    }, fresh.refs.new)).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before.scroll);
    expect(await page.locator("#picker-presence").count()).toBe(0);

    await page.goto(`${opened.live.url}#${seed.refs.reading}`);
    await page.locator(`#${seed.refs.reading}`).waitFor();
    const onOverview = await pagePosition(page);
    await page.goto(`${opened.live.url}#overview`);
    await page.locator("#overview").waitFor();
    const overview = await pagePosition(page);
    submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("offstage", "Question while on Overview")] }]);
    await renderedUpdate(page, opened.stage, "Question while on Overview");
    expect(await pagePosition(page)).toEqual(overview);
    expect(onOverview.tab).toBe(`#${opened.stage}`);
  } finally {
    await f.close();
  }
}, 60_000);

test("typing holds new questions and outside fragment navigation, then applies only the latest move", async () => {
  const f = await liveReader();
  const { page, opened, other, seed, submit } = f;
  try {
    const parallel = submit(other.stage, [documentResult("parallel-target")]).refs["parallel-target"];
    await page.goto(`${opened.live.url}#${seed.refs.lesson}`);
    await page.getByRole("textbox").fill("My draft");
    const before = await pagePosition(page);
    const input = page.getByRole("textbox", { includeHidden: true });
    const fresh = submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("held", "Held while typing")] }]).refs.held;
    await renderedUpdate(page, opened.stage, "Held while typing");
    expect(await pagePosition(page)).toEqual(before);
    expect(await input.inputValue()).toBe("My draft");
    expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);
    await input.blur();
    await page.waitForFunction((id) => location.hash === `#${id}`, fresh);
    expect(await selectedStop(page)).toBe(`#${fresh}`);

    await page.goto(`${opened.live.url}#${seed.refs.lesson}`);
    await input.fill("My longer draft");
    submit(opened.stage, [{ ...documentResult("expanded-reading", 500), revises: seed.refs.reading }]);
    await renderedUpdate(page, opened.stage, "expanded-reading");
    const typing = await pagePosition(page);
    submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("before-fragment", "Question before outside fragment")] }]);
    await renderedUpdate(page, opened.stage, "Question before outside fragment");
    expect(await pagePosition(page)).toEqual(typing);
    await page.goto(`${opened.live.url}#${seed.refs.existing}`);
    await page.waitForFunction((id) => location.hash === `#${id}`, seed.refs.existing);
    expect(await pagePosition(page)).toEqual(typing);
    expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);
    await page.goto(`${opened.live.url}#${fresh}`);
    expect(await pagePosition(page)).toEqual(typing);
    expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);
    await page.goto(`${opened.live.url}#${parallel}`);
    expect(await pagePosition(page)).toEqual(typing);
    await input.blur();
    await page.locator(`[data-tab="${other.stage}"]:not([hidden])`).waitFor();
    expect(await selectedStop(page)).toBe(`#${parallel}`);
    expect(await input.inputValue()).toBe("My longer draft");
  } finally {
    await f.close();
  }
}, 60_000);

for (const field of ["textarea", "select", "contenteditable"]) {
  test(`${field} holds all navigation until leaving editable content and the latest request wins`, async () => {
    const f = await liveReader();
    const { page, opened, other, seed, submit } = f;
    try {
      const parallel = submit(other.stage, [documentResult("parallel-target")]).refs["parallel-target"];
      await page.goto(`${opened.live.url}#${seed.refs.lesson}`);
      await page.locator(`#${seed.refs.lesson}`).evaluate((lesson, tag) => {
        const editor = document.createElement(tag === "contenteditable" ? "div" : tag);
        editor.id = "draft-editor";
        if (tag === "select") editor.innerHTML = "<option>Keep this draft</option><option>Another draft</option>";
        else if (tag === "contenteditable") {
          editor.contentEditable = "true";
          editor.innerHTML = "<span>Keep this draft</span>";
        } else (editor as HTMLTextAreaElement).value = "Keep this draft";
        lesson.prepend(editor);
        editor.focus();
      }, field);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      const before = await pagePosition(page);
      const input = page.locator("#draft-editor");
      submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("first", "First held question")] }]);
      await renderedUpdate(page, opened.stage, "First held question");
      const latest = submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("latest", "Latest held question")] }]).refs.latest;
      await renderedUpdate(page, opened.stage, "Latest held question");
      expect(await pagePosition(page)).toEqual(before);
      expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);
      const realInput = page.getByRole("textbox").filter({ visible: true }).last();
      await realInput.focus();
      expect<string | null | undefined>(await selectedStop(page)).toBe(before.stop);
      await realInput.blur();
      await page.waitForFunction((id) => location.hash === `#${id}`, latest);
      expect(await selectedStop(page)).toBe(`#${latest}`);

      await page.goto(`${opened.live.url}#${seed.refs.lesson}`);
      await input.focus();
      const typing = await pagePosition(page);
      await page.goto(`${opened.live.url}#${parallel}`);
      expect(await pagePosition(page)).toEqual(typing);
      const newest = submit(opened.stage, [{ kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("newest", "New question after outside fragment")] }]).refs.newest;
      await renderedUpdate(page, opened.stage, "New question after outside fragment");
      expect(await pagePosition(page)).toEqual(typing);
      await input.blur();
      await page.waitForFunction((id) => location.hash === `#${id}`, newest);
      expect(await selectedStop(page)).toBe(`#${newest}`);
      expect((await pagePosition(page)).tab).toBe(`#${opened.stage}`);
    } finally {
      await f.close();
    }
  }, 60_000);
}

test("answers, superseded asks, and retirement updates leave the reading place unchanged", async () => {
  const f = await liveReader();
  const { page, opened, seed, submit } = f;
  try {
    const before = await pagePosition(page);
    const readingTop = () => page.locator(`#${seed.refs.reading}`).evaluate((el) => el.getBoundingClientRect().top);
    const top = await readingTop();
    submit(opened.stage, [{ kind: "answer", question: seed.refs.existing, response: { status: "answered", picks: ["A"] } }]);
    await page.locator(`#${seed.refs.existing}[data-state="picked"]`).waitFor();
    expect(await pagePosition(page)).toMatchObject({ tab: before.tab, stop: before.stop });
    expect(Math.abs(await readingTop() - top)).toBeLessThan(1);
    const settled = submit(opened.stage, [
      { kind: "round", now: "The reader shows the latest available route evidence.", questions: [question("superseding", "Reconsidered and settled", seed.refs.existing), question("retired", "Deferred question")] },
      { kind: "answer", question: "superseding", response: { status: "answered", picks: ["B"] } },
      { kind: "close", decisions: [
        { question: "superseding", text: "The changed route holds." },
        { question: "retired", text: "Deferred until another ticket." },
      ] },
      { kind: "stage", state: "finished", retire: [{ question: "retired", reason: "Deferred until another ticket." }] },
    ]);
    await page.locator(`#${settled.refs.retired}[data-retired]`).waitFor();
    const retryLink = page.locator(`#${seed.refs.existing}`).getByRole("link", { name: /Latest attempt/ });
    expect(await retryLink.getAttribute("href")).toBe(`#${settled.refs.superseding}`);
    expect(await pagePosition(page)).toMatchObject({ tab: before.tab, stop: before.stop });
    expect(Math.abs(await readingTop() - top)).toBeLessThan(1);
  } finally {
    await f.close();
  }
}, 60_000);
