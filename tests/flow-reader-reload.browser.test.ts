import { expect, test } from "bun:test";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { copyTree } from "./support/copy-tree.ts";
import { ENV, git } from "./support/fixture.ts";
import { decisionBrief } from "./support/decision-brief.ts";
import type { ReaderComment } from "../plugin/skills/flow-page/scripts/comments.ts";

type Receipt = { flow: string; stage: string; revision: number; live: { state: string; url?: string; error?: string }; refs: Record<string, string> };
type Versions = { revision: number; hostGeneration: string; readerGeneration: string };

test("served generation swaps refresh unchanged content and reload readers without submitting or retargeting drafts", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-reload-")));
  const home = join(root, "home"), project = join(root, "project"), skills = join(root, "plugin/skills");
  mkdirSync(project, { recursive: true });
  for (const name of ["flow-page", "vstack-tmp", "vstack-figures"]) copyTree(join(import.meta.dir, "../plugin/skills", name), join(skills, name));
  if (process.env.FLOW_READER_ASSETS) {
    rmSync(join(skills, "flow-page/reader"), { recursive: true });
    copyTree(process.env.FLOW_READER_ASSETS, join(skills, "flow-page/reader"));
  }
  if (process.env.FLOW_READER_SERVER) {
    mkdirSync(join(skills, "flow-page/reader/server"), { recursive: true });
    copyFileSync(process.env.FLOW_READER_SERVER, join(skills, "flow-page/reader/server/index.mjs"));
  }
  symlinkSync(join(import.meta.dir, "../node_modules"), join(root, "plugin/node_modules"));
  const installed = join(home, ".omp/plugins/node_modules");
  mkdirSync(installed, { recursive: true });
  symlinkSync(join(root, "plugin"), join(installed, "vstack"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "bun"));
  git(project, "init", "-q");
  git(project, "commit", "-q", "--allow-empty", "-m", "seed");
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  const { FLOW_READER_ASSETS: _candidateAssets, FLOW_READER_SERVER: _candidateServer, ...envWithoutCandidateReader } = ENV;
  const cli = (args: string[], input?: object): Receipt => {
    const child = Bun.spawnSync([process.execPath, join(skills, "flow-page/scripts/flow-page.ts"), ...args, "--session", "reload-fixture", "--agent", "fixture"], {
      cwd: project, env: { ...envWithoutCandidateReader, HOME: home, PATH: `${bin}:${ENV.PATH}`, VSTACK_FLOW_PORT: String(port) },
      stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (child.exitCode) throw new Error(child.stderr.toString());
    return JSON.parse(child.stdout.toString()) as Receipt;
  };
  const seal = () => {
    const child = Bun.spawnSync([process.execPath, join(skills, "flow-page/scripts/generation.ts"), "seal"], { stdout: "pipe", stderr: "pipe" });
    if (child.exitCode) throw new Error(child.stderr.toString());
  };
  const browser = await chromium.launch({ headless: true });
  try {
    seal();
    const opened = cli(["open", "--skill", "implement", "--title", "Automatic reader replacement"]);
    const table = { kind: "result", ref: "evidence", shape: "table", title: "Restart evidence", columns: ["Check"], rows: [{ ref: "restart", cells: ["Host restart"] }] };
    const seed = cli(["submit"], { version: 1, items: [
      table,
      { kind: "result", shape: "document", title: "Long reading context", sections: [{ heading: "Evidence", blocks: [{ prose: "Keep reading the captured evidence. ".repeat(1000) }] }] },
      { kind: "round", now: "The saved draft is ready for review.", questions: [{
        title: "Retain the draft after replacement?",
        ref: "prior",
        description: "Compare the retained draft with the original.",
        brief: decisionBrief("the draft"),
        needs: [{ need: "Know which draft the reader retains.", kind: "prose" }],
        options: [{ label: "Retain", does: "Keeps the unsent text.", gains: ["Continuity"], costs: ["Local browser state"] }],
      }] },
    ] });
    const retry = cli(["submit"], { version: 1, items: [{ kind: "round", now: "The draft still needs a decision.", questions: [{
      ref: "retry", again: seed.refs.prior, title: "Keep the original draft?",
      brief: decisionBrief("the original draft", { again: "The first attempt went unanswered." }),
      description: "Choose which draft to keep.",
      needs: [{ need: "Know which draft each choice keeps.", kind: "prose" }],
      options: [{ label: "Retain", does: "Keeps the original draft.", gains: ["Continuity"], costs: ["No change"] }],
    }] }] }).refs.retry!;
    expect(opened.live).toMatchObject({ state: "serving" });
    const url = opened.live.url;
    if (!url) throw new Error("serving receipt lacks live.url");
    const versions = async () => (await (await fetch(new URL("versions", url))).json()) as Versions;
    const comments = async () => (await (await page.request.get(new URL("comments", url).href)).json()) as { comments: ReaderComment[] };
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    let navigations = 0, contentLoads = 0, commentWrites = 0;
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
      if (request.url() === new URL("content", url).href) contentLoads++;
      if (request.url() === new URL("comments", url).href && request.method() === "POST") commentWrites++;
    });
    const bare = await browser.newPage({ viewport: { width: 360, height: 500 } });
    await bare.goto(url);
    const overview = bare.getByRole("region", { name: "Overview", exact: true });
    await overview.getByRole("link", { name: "Keep the original draft?" }).waitFor();
    const progress = bare.getByRole("region", { name: "Authored progress", exact: true });
    const progressRow = overview.locator(":scope > details > summary").filter({ hasText: /^Progress$/ });
    await progressRow.focus();
    await bare.keyboard.press("Enter");
    await progress.waitFor();
    expect(new URL(bare.url()).hash).toBe("");
    const attempts = await browser.newPage();
    await attempts.goto(`${url}#${retry}`);
    const summary = attempts.locator(`#${retry}`).getByText("Earlier attempt", { exact: true });
    await summary.focus();
    await attempts.keyboard.press("Enter");
    expect(await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)).toBe(true);
    const closedEvidence = await browser.newPage();
    await closedEvidence.goto(`${url}#${retry}-evidence`);
    const evidenceSummary = closedEvidence.locator(`#${retry}-evidence`);
    await evidenceSummary.locator("..").and(closedEvidence.locator("details[open]")).waitFor();
    await evidenceSummary.click();
    expect(await evidenceSummary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)).toBe(false);
    const closedChoices = await browser.newPage();
    await closedChoices.goto(`${url}#${seed.refs.prior}-choices`);
    const choices = closedChoices.locator(`#${seed.refs.prior}-choices`);
    await choices.waitFor();
    await closedChoices.getByText("Collapse question", { exact: true }).click();
    await choices.waitFor({ state: "hidden" });
    await page.goto(`${url}#${seed.refs.evidence}`);
    const region = page.getByRole("region", { name: "Reader comments on Restart evidence" }).first();
    await region.getByRole("button", { name: "Add Reader comment" }).click();
    await region.getByRole("combobox", { name: "Comment target" }).click();
    await page.getByRole("option", { name: "e1: Host restart", exact: true }).click();
    const draft = "Đặng Thị Ngọc Hân: keep <script>literal</script> & **draft**, not consent.\nCheck the original entry.";
    await region.getByRole("textbox", { name: "Comment" }).fill(draft);
    cli(["submit"], { version: 1, items: [{ ...table, revises: seed.refs.evidence, summary: "A later captured revision." }] });
    await page.getByRole("paragraph").filter({ hasText: /^A later captured revision\.$/ }).waitFor();
    await page.getByText("Earlier revisions (1)", { exact: true }).click();
    const historical = page.locator(`#${seed.refs.evidence}-r1`).getByRole("region", { name: "Reader comments on Restart evidence" });
    await historical.getByRole("button", { name: "Select text to comment", exact: true }).click();
    await historical.getByRole("textbox", { name: "Result text for selection" }).focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowLeft");
    await historical.getByRole("button", { name: "Comment on selected text", exact: true }).click();
    await historical.getByRole("textbox", { name: "Comment" }).fill("Keep this historical passage attached to revision one.");
    const whole = page.getByRole("region", { name: "Reader comments on Long reading context" });
    await whole.getByRole("button", { name: "Add Reader comment", exact: true }).click();
    await whole.getByRole("textbox", { name: "Comment" }).fill("Whole block draft, still unsent.");
    await page.evaluate(() => scrollTo(0, 1200));
    const position = await page.evaluate(() => ({ hash: location.hash, y: scrollY }));
    const before = await versions(), loads = contentLoads;
    appendFileSync(join(skills, "flow-page/scripts/fields.ts"), "\n;\n");
    seal();
    for (const end = Date.now() + 15_000; Date.now() < end && (await versions()).hostGeneration === before.hostGeneration;) await Bun.sleep(100);
    expect((await versions()).hostGeneration).not.toBe(before.hostGeneration);
    expect((await versions()).readerGeneration).toBe(before.readerGeneration);
    await page.waitForFunction(() => !document.body.textContent?.includes("stopped answering"));
    for (const end = Date.now() + 5000; Date.now() < end && contentLoads <= loads;) await Bun.sleep(100);
    expect(contentLoads).toBeGreaterThan(loads);
    expect(navigations).toBe(1);
    expect(await region.getByRole("textbox", { name: "Comment" }).inputValue()).toBe(draft);
    const legacyText = "Keep the comment on the earlier revision.";
    const legacyComment = async (focus: string) => {
      const legacy = await browser.newPage();
      const report = seed.refs.evidence;
      // The pre-cutover reader stored Earlier revisions as ordinal 4.
      await legacy.addInitScript(({ report, stage, text, focus }) => {
        sessionStorage.setItem(`flow-reader:reload:${location.pathname}`, JSON.stringify({
          place: {
            hash: `#${report}`, tab: stage, current: report, y: 0, anchor: report,
            details: [0, 4], folds: [], focus, selection: [9, 16],
          },
          [`comment:${report}-r1`]: { target: "", draft: text, editing: "", passage: "", revision: 1, edit: null },
        }));
      }, { report, stage: opened.stage, text: legacyText, focus });
      await legacy.goto(`${url}#${report}`);
      const editor = legacy.locator(`#${report}-r1`).getByRole("textbox", { name: "Comment", includeHidden: true });
      await legacy.waitForFunction(() => sessionStorage.getItem(`flow-reader:reload:${location.pathname}`) === null);
      const restored = {
        visible: await editor.isVisible(),
        draft: await editor.inputValue(),
        focusAndSelection: await editor.evaluate((el: HTMLTextAreaElement) =>
          [document.activeElement === el, el.selectionStart, el.selectionEnd]),
        compareOpen: await legacy.getByText("Compare revisions", { exact: true }).evaluate(el => (el.parentElement as HTMLDetailsElement).open),
        unrelatedOpen: await legacy.locator(`#${retry}-evidence`).evaluate(el => (el.parentElement as HTMLDetailsElement).open),
      };
      await legacy.close();
      return restored;
    };
    const identifiedDraft = await legacyComment(`${seed.refs.evidence}-r1-comment`);
    const generatedFocus = await legacyComment("v-6");

    const linkedQuestion = seed.refs.prior;
    const legacyQuestion = async (anchor: string) => {
      const legacy = await browser.newPage();
      await legacy.addInitScript(({ anchor, stage, current }) => {
        sessionStorage.setItem(`flow-reader:reload:${location.pathname}`, JSON.stringify({
          place: { hash: `#${anchor}`, tab: stage, current, y: 0, anchor, details: [0], folds: [] },
        }));
      }, { anchor, stage: opened.stage, current: linkedQuestion });
      await legacy.goto(`${url}#${anchor}`);
      await legacy.waitForFunction(() => sessionStorage.getItem(`flow-reader:reload:${location.pathname}`) === null);
      const restored = [
        await legacy.locator(`#${linkedQuestion}-choices`).isVisible(),
        await legacy.locator(`#${linkedQuestion}-evidence`).evaluate(el => (el.parentElement as HTMLDetailsElement).open),
      ];
      await legacy.close();
      return restored;
    };
    const legacyChoices = await legacyQuestion(linkedQuestion);
    const legacyEvidence = await legacyQuestion(`${linkedQuestion}-evidence`);
    await attempts.evaluate(() => document.fonts.ready.then(() => undefined));
    const attemptPosition = await attempts.evaluate(() => ({ hash: location.hash, y: scrollY }));
    const stable = await versions();
    const reader = join(skills, "flow-page/reader/index.html"), good = readFileSync(reader, "utf8");
    writeFileSync(reader, good + "\n<!-- incomplete update -->\n");
    await Bun.sleep(2000);
    expect(await versions()).toEqual(stable);
    expect(navigations).toBe(1);
    writeFileSync(reader, good + "\n<!-- complete replacement -->\n");
    seal();
    const generationChanged = (old: string) => {
      const loaded = document.querySelector<HTMLMetaElement>('meta[name="flow-reader-generation"]')?.content;
      return loaded && loaded !== old;
    };
    await Promise.all([page, bare, attempts, closedEvidence, closedChoices].map(async tab => {
      await tab.waitForFunction(generationChanged, before.readerGeneration, { timeout: 20_000 });
      await tab.waitForFunction(() => sessionStorage.getItem(`flow-reader:reload:${location.pathname}`) === null);
    }));
    expect({
      identifiedDraft,
      generatedFocus: { ...generatedFocus, focusAndSelection: generatedFocus.focusAndSelection[0] },
      legacyChoices,
      legacyEvidence,
      attempt: await summary.evaluate(el => [(el.parentElement as HTMLDetailsElement).open, document.activeElement === el]),
      closedEvidence: await evidenceSummary.evaluate(el => (el.parentElement as HTMLDetailsElement).open),
      closedChoices: !(await choices.isVisible()),
    }).toEqual({
      identifiedDraft: { visible: true, draft: legacyText, focusAndSelection: [true, 9, 16], compareOpen: false, unrelatedOpen: false },
      generatedFocus: { visible: false, draft: legacyText, focusAndSelection: false, compareOpen: false, unrelatedOpen: false },
      legacyChoices: [true, false],
      legacyEvidence: [true, true],
      attempt: [true, true],
      closedEvidence: false,
      closedChoices: true,
    });
    expect(await attempts.evaluate(() => location.hash)).toBe(attemptPosition.hash);
    expect(Math.abs(await attempts.evaluate(() => scrollY) - attemptPosition.y)).toBeLessThan(4);
    await progress.waitFor();
    expect(new URL(bare.url()).hash).toBe("");
    expect(await bare.getByRole("region", { name: "Open decisions", exact: true }).isVisible()).toBe(true);
    await bare.waitForFunction(() => document.activeElement?.matches("summary") && document.activeElement.textContent?.trim() === "Progress", undefined, { timeout: 4000 });
    const proof = process.env.FLOW_READER_EVIDENCE;
    if (proof) {
      mkdirSync(proof, { recursive: true });
      writeFileSync(join(proof, "overview-generation-restored.aria.txt"), await bare.locator("body").ariaSnapshot());
      await bare.screenshot({ path: join(proof, "overview-generation-restored.png"), fullPage: true });
    }
    expect(navigations).toBe(2);
    expect((await versions()).revision).toBe(before.revision);
    expect((await versions()).readerGeneration).not.toBe(before.readerGeneration);
    expect(errors).toEqual([]);
    expect(await region.getByRole("textbox", { name: "Comment" }).inputValue()).toBe(draft);
    expect(await region.getByRole("combobox", { name: "Comment target" }).textContent()).toContain("e1: Host restart");
    expect(await historical.getByRole("textbox", { name: "Comment" }).inputValue()).toBe("Keep this historical passage attached to revision one.");
    expect(await historical.locator("form blockquote").textContent()).toBe("Host restart");
    expect(await whole.getByRole("textbox", { name: "Comment" }).inputValue()).toBe("Whole block draft, still unsent.");
    expect(await whole.getByRole("textbox", { name: "Comment" }).evaluate(el => document.activeElement === el)).toBe(true);
    expect(await whole.getByRole("combobox", { name: "Comment target" }).textContent()).toContain("Whole Result block");
    expect(await page.evaluate(() => location.hash)).toBe(position.hash);
    expect(Math.abs(await page.evaluate(() => scrollY) - position.y)).toBeLessThan(4);
    expect(commentWrites).toBe(0);
    expect((await comments()).comments).toEqual([]);
    await region.getByRole("button", { name: "Save comment", exact: true }).click();
    await historical.getByText(draft, { exact: true }).waitFor();
    expect((await comments()).comments).toMatchObject([{ result: seed.refs.evidence, revision: 1, edit: null, anchor: { kind: "entry", entry: "e1" }, text: draft }]);
    expect(commentWrites).toBe(1);
    await historical.getByRole("button", { name: "Save comment", exact: true }).click();
    await historical.getByText("Keep this historical passage attached to revision one.", { exact: true }).waitFor();
    expect((await comments()).comments).toMatchObject([
      { result: seed.refs.evidence, revision: 1, edit: null, anchor: { kind: "entry", entry: "e1" }, text: draft },
      { result: seed.refs.evidence, revision: 1, edit: null, anchor: { kind: "text", quote: "Host restart" }, text: "Keep this historical passage attached to revision one." },
    ]);
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 90_000);
