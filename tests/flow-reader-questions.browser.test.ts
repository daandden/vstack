import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";
import { editStoredFlow } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const rolloutPlan = "https://example.test/workspaces/platform/projects/decision-brief/rollout/plan/eeasted80785d4ddd8947319460a2b011?variant=reader&show=all";
const now = `The reader works in both themes. Review the rollout plan at ${rolloutPlan} before changing the order.`;
const evidence = `The keyboard and pointer walkthroughs passed. Neither the release checklist nor the rollout plan at ${rolloutPlan} specifies the order.`;

test("question context, choices, answers and figures keep their compact themed layout", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-questions-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c243-9218-7214-af2f-363af599ca19", "--agent", "impl-434"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const proof = process.env.FLOW_READER_EVIDENCE;
  if (proof) mkdirSync(proof, { recursive: true });
  writeFileSync(join(root, "path.mmd"), [
    "flowchart LR",
    ' a["Read the original walkthrough and release context"] --> b["Compare the available audit coverage"]',
    ' b --> c["Verify the retained report after the walkthrough"]',
    ' c --> d["Publish the release checklist"]',
    ...["Intake", "Review", "Risk", "Audit", "Follow-up", "Owner"].map((label, i) => ` a --> side${i}["${label}"]`),
  ].join("\n"));
  writeFileSync(join(root, "preview.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="110" viewBox="0 0 340 110">
    <rect width="340" height="110" rx="8" fill="#eff1f5"/>
    <rect x="16" y="18" width="308" height="28" rx="4" fill="#dce0e8"/>
    <text x="28" y="37" fill="#4c4f69" font-family="monospace" font-size="14">Release checklist</text>
    <path d="M28 66l4 4 8-8M28 86l4 4 8-8" fill="none" stroke="#40a02b" stroke-width="2"/>
    <text x="52" y="71" fill="#4c4f69" font-family="monospace" font-size="13">Signed audit report</text>
    <text x="52" y="91" fill="#4c4f69" font-family="monospace" font-size="13">Walkthrough coverage</text>
  </svg>`);
  const browser = await chromium.launch({ headless: true });
  try {
    const opened = cli(["open", "--skill", "grill-me", "--title", "Questions and shared context"]);
    const published = cli(["submit"], [
      { kind: "attachment", ref: "path", type: "mermaid", caption: "Reading path", description: "Read `context` before answering.", origin: "path.mmd", path: "path.mmd", focus: ["b"] },
      { kind: "background", title: "Background", summary: "Two routes share the same context.", sections: [{ heading: "Today", body: "The reader keeps **authored content** separate from your answer." }], sources: ["GLOSSARY.md"] },
      { kind: "topic", ref: "context", title: "Shared context", summary: "A concept used by both questions.", body: "- Read the Background\n- Compare the options", sources: ["ADR 0067"] },
      { kind: "assumed", ref: "assumption", decision: "Keep stored revisions", pick: "Retain the original", why: "No authored record should move." },
      { kind: "round", now, questions: [
        { ref: "first", title: "Keep the reading path?", description: "Read the context and compare both routes.", brief: { unblocks: "Choose the reading order for the reader release.", undo: "Restore the current order in the next release.", ask_reason: "undecided-by-evidence", evidence_checked: evidence }, topics: ["context"], terms: [{ term: "Flow", text: "Related work across Stages." }], today: [{ text: "The host serves the built reader.", source: "reader/ship.ts" }], example: "Read → compare → answer", needs: [{ need: "Follow the current path.", kind: "context-diagram" }], figures: [{ attachment: "path", kind: "context-diagram" }], options: [{ label: "Keep", does: "Retain the path.", gains: ["Familiar reading order"], costs: ["No new route"], recommended: "The path already works." }, { label: "Change", does: "Replace the path.", gains: ["Another route"], costs: ["Relearn the order"] }] },
        { ref: "second", title: "Read the next question?", description: "Keyboard navigation reaches this question.", brief: { unblocks: "Continue the keyboard walkthrough.", undo: "Return to the first question.", no_recommendation: "Neither order changes the result of this walkthrough.", ask_reason: "taste", evidence_checked: "The tab-order test found both routes reachable." }, needs: [{ need: "Understand the next choice.", kind: "prose" }], options: [{ label: "Continue", does: "Reads the next question.", gains: ["More context"], costs: ["More reading"] }] },
        { ref: "noted", title: "Where should the cap live?", description: "The number sits in code today.", brief: { unblocks: "Implement the cap in the chosen place.", undo: "Move it back to its original owner.", no_recommendation: "The operator has not said how often the cap changes.", ask_reason: "user-only-fact", evidence_checked: "The change log does not list any cap changes outside releases." }, needs: [{ need: "Compare where the cap lives.", kind: "prose" }], options: [{ label: "Keep in code", does: "Keeps the constant.", gains: ["Reviewed with code"], costs: ["A deploy per change"] }, { label: "Move to config", does: "Reads it from settings.", gains: ["Ops can change it"], costs: ["Config drift"] }] },
        { ref: "worded", title: "Should the check run on the server?", description: "Only the browser checks today.", brief: { unblocks: "Add the check to the chosen request path.", undo: "Revert the request validation change.", no_recommendation: "The server's lookup budget is not known.", ask_reason: "undecided-by-evidence", evidence_checked: "The API tests show the unchecked path. The latency budget does not allocate time for the extra lookup." }, needs: [{ need: "Compare where the check runs.", kind: "prose" }], options: [{ label: "Server too", does: "The API rejects carts.", gains: ["Cannot be bypassed"], costs: ["One more lookup"] }, { label: "Browser only", does: "Keeps the client check.", gains: ["No API change"], costs: ["A crafted request skips it"] }] },
      ] },
    ]);
    cli(["submit"], [
      { kind: "answer", question: published.refs.first, response: { status: "answered", picks: ["A"] } },
      { kind: "answer", question: published.refs.noted, response: { status: "answered", picks: ["A"], text: "Config would be nice later.", note_on: "B" } },
      { kind: "answer", question: published.refs.worded, response: { status: "answered", text: "A server check worries me.", note_on: "A" }, reading: { outcome: "concern", unresolved: "Whether one more lookup fits the budget." } },
    ]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${opened.live.url}#${published.refs.first}-evidence`);
    await page.getByRole("img", { name: "Reading path" }).locator("svg").waitFor();
    await page.locator(`#${published.refs.first}-evidence`).click();
    await page.goto(`${opened.live.url}#${published.refs.first}`);
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map((a) => a.finished)); });
      if (proof) {
        await page.screenshot({ path: join(proof, `${theme.toLowerCase()}.png`), fullPage: true });
        writeFileSync(join(proof, `${theme.toLowerCase()}.aria.txt`), await page.locator("body").ariaSnapshot());
      }
    }
    const question = page.locator(`#${published.refs.first}`);
    const firstBrief = question.getByRole("region", { name: "Decision brief" });
    expect(await firstBrief.isVisible()).toBe(true);
    expect(await firstBrief.evaluate(el => el.previousElementSibling?.querySelector("h2")?.textContent)).toContain("Keep the reading path?");
    expect(await firstBrief.getByText(now, { exact: true }).isVisible()).toBe(true);
    expect(await firstBrief.getByText("Evidence does not decide", { exact: true }).isVisible()).toBe(true);
    expect(await firstBrief.getByText(evidence, { exact: true }).isVisible()).toBe(true);
    expect(await firstBrief.innerText()).toContain("A. Keep");
    expect(await firstBrief.innerText()).toContain("The path already works.");
    expect(await firstBrief.innerText()).toContain("Choose the reading order for the reader release.");
    expect(await firstBrief.innerText()).toContain("Restore the current order in the next release.");
    const secondBrief = page.locator(`#${published.refs.second}`).getByRole("region", { name: "Decision brief" });
    expect(await secondBrief.locator("dt").allTextContents()).toEqual(["Now", "Reason to ask", "Evidence checked", "No recommendation", "After you answer"]);
    expect(await secondBrief.getByText("Neither order changes the result of this walkthrough.", { exact: true }).isVisible()).toBe(true);
    expect(await question.evaluate((el) => ({ display: getComputedStyle(el).display, gap: getComputedStyle(el).gap }))).toEqual({ display: "grid", gap: "10px" });
    const open = page.locator(`#${published.refs.second}`);
    expect(await open.getByRole("heading", { name: /Read the next question/ }).evaluate(el => {
      const style = getComputedStyle(el);
      return [style.fontSize, style.fontFamily];
    })).toEqual(["17px", expect.stringContaining("IosevkaTermSlab")]);
    expect(await open.getByText("Open", { exact: true }).count()).toBe(1);
    expect(await open.getByText("Waiting for your answer.").count()).toBe(0);
    expect(await question.getByRole("link", { name: /^(Choices|Evidence)$/ }).count()).toBe(0);
    expect(await question.getByText(/^Reader needs/).count()).toBe(0);
    expect(await question.locator(".options").evaluate((el) => ({ display: getComputedStyle(el).display, list: getComputedStyle(el).listStyleType }))).toEqual({ display: "grid", list: "none" });
    expect(await question.locator(".answer").count()).toBe(0);
    expect(await question.getByText("Your pick: A. Keep", { exact: true }).count()).toBe(1);
    expect(await question.getByRole("heading", { name: /Keep.*\(your answer\)/ }).count()).toBe(1);
    const noted = page.locator(`#${published.refs.noted}`);
    const worded = page.locator(`#${published.refs.worded}`);
    await page.goto(`${opened.live.url}#${published.refs.noted}`);
    await noted.getByRole("list", { name: "Choices" }).waitFor();
    const lineLabels = (q: typeof noted) => q.locator(".answer p").evaluateAll((ps) => ps.map((p) => p.firstElementChild!.textContent));
    expect(await lineLabels(noted)).toEqual(["Note on B"]);
    expect(await lineLabels(worded)).toEqual(["Words on A", "Concern", "Still to ask"]);
    const box = await worded.locator(".answer").evaluate((el) => {
      const s = getComputedStyle(el);
      const label = el.querySelector("p > :first-child")!;
      return { border: [s.borderBlockStartWidth, s.borderBlockEndWidth, s.borderInlineStartWidth, s.borderInlineEndWidth], radius: s.borderTopLeftRadius, sameColour: getComputedStyle(label).color === s.color && getComputedStyle(label.nextElementSibling!).color === s.color };
    });
    expect(box).toEqual({ border: ["1px", "1px", "1px", "1px"], radius: "4px", sameColour: true });
    const textStarts = async (q: typeof noted) => q.locator(".answer p").evaluateAll((ps) => ps.map((p) => Math.round(p.lastElementChild!.getBoundingClientRect().left - p.parentElement!.getBoundingClientRect().left)));
    const starts = [...(await textStarts(noted)), ...(await textStarts(worded))];
    expect(new Set(starts).size).toBe(1);
    const gaps = await worded.evaluate((el) => {
      const opts = [...el.querySelectorAll(".option")].map((o) => o.getBoundingClientRect());
      const answer = el.querySelector(".answer")!.getBoundingClientRect();
      return { lines: [...el.querySelectorAll(".option")].map((o) => getComputedStyle(o).borderBlockStartWidth), between: Math.round(opts[1]!.top - opts[0]!.bottom), toAnswer: Math.round(answer.top - opts[1]!.bottom) };
    });
    expect(gaps).toEqual({ lines: ["0px", "0px"], between: 16, toAnswer: 16 });
    const sources = question.locator("summary").filter({ hasText: /^Sources and context$/ });
    expect(await sources.isVisible()).toBe(true);
    expect(await question.getByText("Read the context and compare both routes.").isVisible()).toBe(true);
    expect(await question.getByText("Read → compare → answer").isVisible()).toBe(true);
    expect(await question.getByText("The host serves the built reader.").isVisible()).toBe(false);
    expect(await question.getByRole("link", { name: "Topic: Shared context" }).isVisible()).toBe(false);
    await sources.press("Enter");
    expect(await question.getByText("The host serves the built reader.").isVisible()).toBe(true);
    expect(await question.getByText("reader/ship.ts", { exact: true }).isVisible()).toBe(true);
    expect(await question.getByRole("link", { name: "Topic: Shared context" }).isVisible()).toBe(true);
    expect(await question.getByText("Related work across Stages.").isVisible()).toBe(true);
    await sources.press("Space");
    expect(await question.getByText("Related work across Stages.").isVisible()).toBe(false);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("n");
    expect(new URL(page.url()).hash).toBe(`#${published.refs.second}`);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${opened.live.url}#${published.refs.first}`);
    await firstBrief.waitFor();
    expect(await firstBrief.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await firstBrief.getByText(now, { exact: true }).innerText()).toContain(rolloutPlan);
    expect(await firstBrief.getByText(evidence, { exact: true }).innerText()).toBe(evidence);
    expect(cli(["show", "--flow", opened.flow]).revision).toBe(published.revision + 1);
    const earlierWords = "Does **checklist coverage** include the audit?\nPlease keep the saved report.";
    cli(["submit"], [{ kind: "answer", question: published.refs.second, response: { status: "answered", text: earlierWords },
      reading: { outcome: "concern", unresolved: "Whether the walkthrough includes the audit." } }]);
    const retryReason = "The earlier note asks about audit coverage. The checklist now includes the audit.";
    const retry = cli(["submit"], [
      { kind: "attachment", ref: "preview", type: "svg", caption: "Release checklist preview", origin: "preview.svg", path: "preview.svg" },
      { kind: "round", now: "The release walkthrough starts next.", questions: [{
        ref: "retry", again: published.refs.second, title: "Continue the walkthrough?", description: "The release walkthrough is ready.",
        brief: { asked_again_because: retryReason, unblocks: "Proceed to the release checklist.", undo: "Return to the reading path before publishing.", ask_reason: "explicit-decision-required", evidence_checked: "The earlier answer asked about audit coverage without choosing. The updated checklist keeps the signed audit report." },
        needs: [
          { need: "Read the original checklist excerpt.", kind: "source-excerpt" },
          { need: "Follow the path to checklist publication.", kind: "option-diagram" },
          { need: "Inspect the captured checklist preview.", kind: "option-preview" },
        ],
        figures: [{ text: "Original checklist: keep the signed audit report.", kind: "source-excerpt" }, { attachment: published.refs.path, kind: "option-diagram" }],
        options: [{ label: "Continue", does: "Opens the release checklist.", gains: ["Checklist coverage"], costs: ["One more step"], recommended: "The path check is complete.",
          preview: { attachment: "preview", kind: "option-preview" } }],
      }] },
    ]);
    await page.goto(`${opened.live.url}#${retry.refs.retry}`);
    const reasked = page.locator(`#${retry.refs.retry}`).getByRole("region", { name: "Decision brief" });
    await reasked.waitFor();
    expect(await reasked.locator("dt").allTextContents()).toEqual(["Now", "Reason to ask", "Evidence checked", "Asked again because", "Recommendation", "After you answer"]);
    expect(await reasked.getByText(retryReason, { exact: true }).isVisible()).toBe(true);
    expect(await reasked.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const retryQuestion = page.locator(`#${retry.refs.retry}`);
    const earlier = retryQuestion.locator("summary").filter({ hasText: /^Earlier attempt$/ });
    expect(await earlier.isVisible()).toBe(true);
    expect(await retryQuestion.getByText("Your words", { exact: true }).isVisible()).toBe(false);
    await earlier.press("Enter");
    expect(await retryQuestion.getByText("Your words", { exact: true }).isVisible()).toBe(true);
    expect(await retryQuestion.getByText("Does **checklist coverage** include the audit?", { exact: false }).textContent()).toBe(earlierWords);
    expect(await retryQuestion.getByText("Agent reading", { exact: true }).isVisible()).toBe(true);
    expect(await retryQuestion.getByText("Whether the walkthrough includes the audit.", { exact: true }).isVisible()).toBe(true);
    await earlier.press("Space");
    expect(await retryQuestion.getByText("Agent reading", { exact: true }).isVisible()).toBe(false);

    const retryUrl = `${opened.live.url}#${retry.refs.retry}`;
    const choices = retryQuestion.getByRole("list", { name: "Choices" });
    const figure = retryQuestion.getByRole("img", { name: "Reading path", exact: true });
    const enlarge = retryQuestion.getByRole("button", { name: "Enlarge figure: Reading path", exact: true });
    const overlay = page.getByRole("dialog", { name: "Reading path", exact: true });
    const capture = async (name: string) => {
      if (!proof) return;
      await page.screenshot({ path: join(proof, `${name}.png`), fullPage: true });
      writeFileSync(join(proof, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
    };
    expect(await figure.isVisible()).toBe(true);
    await figure.locator("svg").waitFor();
    const optionPreview = choices.locator('img[alt="Release checklist preview"]');
    expect(await optionPreview.evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth))).toBe(340);
    expect(await retryQuestion.getByText("Original checklist: keep the signed audit report.", { exact: true }).isVisible()).toBe(false);
    const narrowChoice = (await choices.boundingBox())!;
    const narrowFigure = (await figure.boundingBox())!;
    expect(narrowFigure.y).toBeGreaterThanOrEqual(narrowChoice.y + narrowChoice.height);
    await figure.press("ArrowRight");
    const inlinePan = await figure.evaluate(el => el.scrollLeft);
    expect(inlinePan).toBeGreaterThan(0);
    await figure.press("ArrowDown");
    await page.waitForFunction(() => (document.activeElement?.scrollTop ?? 0) > 0);
    const inlineVerticalPan = await figure.evaluate(el => el.scrollTop);
    expect(page.url()).toBe(retryUrl);
    await capture("inline-reask-320");

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopChoice = (await choices.boundingBox())!;
    const desktopFigure = (await figure.boundingBox())!;
    expect(desktopFigure.x).toBeGreaterThanOrEqual(desktopChoice.x + desktopChoice.width);
    expect(desktopFigure.y).toBeLessThan(desktopChoice.y + desktopChoice.height);
    expect(desktopFigure.height).toBeLessThanOrEqual(256);
    await capture("inline-reask-1280");
    const opener = await enlarge.elementHandle();
    await figure.click();
    await overlay.waitFor();
    const enlarged = overlay.getByRole("img", { name: "Reading path", exact: true });
    await enlarged.locator("svg").waitFor();
    expect((await enlarged.boundingBox())!.width).toBeGreaterThan(desktopFigure.width);
    expect((await overlay.boundingBox())!.width).toBeGreaterThan(1200);
    expect(await overlay.getByText("Read context before answering.").isVisible()).toBe(true);
    await capture("enlarged-after-pointer-1280");
    if (proof) await page.screenshot({ path: join(proof, "enlarged-after-pointer-1280-viewport.png") });
    const closeFigure = overlay.getByRole("button", { name: "Close figure", exact: true });
    const immediateReopen = await closeFigure.evaluate(async (close, trigger) => {
      const dialog = close.closest("dialog")!;
      const closed = new Promise<void>(done => dialog.addEventListener("close", () => done(), { once: true }));
      (close as HTMLButtonElement).click();
      const focusReturned = document.activeElement === trigger;
      // Activate the opener before the browser dispatches the previous close event.
      (trigger as HTMLButtonElement).click();
      await closed;
      return { focusReturned, open: dialog.open, focusInside: dialog.contains(document.activeElement) };
    }, opener);
    expect(immediateReopen).toEqual({ focusReturned: true, open: true, focusInside: true });
    await closeFigure.click();
    await overlay.waitFor({ state: "hidden" });
    expect(await enlarge.evaluate(el => document.activeElement === el)).toBe(true);
    await capture("focus-return-after-click-1280");

    await page.setViewportSize({ width: 320, height: 900 });
    await enlarge.press("Enter");
    await enlarged.locator("svg").waitFor();
    await enlarged.press("ArrowRight");
    const enlargedPan = await enlarged.evaluate(el => el.scrollLeft);
    expect(enlargedPan).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture("enlarged-after-keyboard-320");
    if (proof) await page.screenshot({ path: join(proof, "enlarged-after-keyboard-320-viewport.png") });
    await page.keyboard.press("Escape");
    await overlay.waitFor({ state: "hidden" });
    expect(await enlarge.evaluate(el => document.activeElement === el)).toBe(true);
    expect(page.url()).toBe(retryUrl);
    await capture("focus-return-after-escape-320");
    if (proof) writeFileSync(join(proof, "reask-figure-actions.json"), JSON.stringify({
      chromium: browser.version(), narrowChoice, narrowFigure, desktopChoice, desktopFigure, inlinePan, inlineVerticalPan, enlargedPan,
      clickOnFigure: true, closeByClickReturnedFocus: true, enterOpened: true, escapeFromDiagramReturnedFocus: true,
    }, null, 2));
    await page.goto(`${opened.live.url}#${retry.refs.retry}-figure-1`);
    await retryQuestion.getByText("Original checklist: keep the signed audit report.", { exact: true }).waitFor();
    const figureSource = retryQuestion.locator(`#${retry.refs.retry}-evidence`).locator("..").locator("summary").filter({ hasText: /^Source$/ });
    await figureSource.click();
    expect(await retryQuestion.getByText("Origin: path.mmd", { exact: true }).isVisible()).toBe(true);
    expect(new URL(page.url()).hash).toBe(`#${retry.refs.retry}-figure-1`);
    await capture("sources-revealed-by-figure-fragment-320");
    if (proof) {
      await page.screenshot({ path: join(proof, "decision-brief-reask-320.png"), fullPage: true });
      writeFileSync(join(proof, "decision-brief-reask-320.aria.txt"), await reasked.ariaSnapshot());
    }

    const old = cli(["open", "--skill", "grill-me", "--title", "Stored before Decision briefs"]);
    const oldId = "question-1";
    const oldBriefId = "question-2";
    const oldBriefLabels = ["Now", "No recommendation", "After you answer"];
    editStoredFlow(home, old.flow, state => {
      const round = { id: "round-1", stage: old.stage, n: 1, seq: 1, time: state.flow.created, now: "The signoff draft is ready." };
      state.rounds.push(round);
      state.questions.push({
        id: oldId, round: round.id, stage: old.stage, q: 1,
        title: "Keep the stored selection?", description: "This description was stored before Decision briefs.",
        options: [{ label: "A. Keep", does: "Keeps the current reader.", gains: ["Continuity"], costs: ["No new features"], recommended: "The old layout works." }],
      });
      state.questions.push({
        id: oldBriefId, round: round.id, stage: old.stage, q: 2,
        title: "Keep the signoff in the draft?", description: "This brief was stored before the Settle-or-ask test.",
        brief: { unblocks: "Finish the draft.", undo: "Move the signoff back.", no_recommendation: "Either placement works." },
        options: [{ label: "A. Leave it", does: "Keeps the signoff.", gains: ["Continuity"], costs: ["No new placement"] }],
      });
      state.next.round = state.seq = 1;
      state.next.question = 2;
      const publication = ++state.revision;
      state.reading = { historical: [], publications: [oldId, oldBriefId].map((id, index) => ({ id, kind: "question", stage: old.stage, position: index + 1, publication })) };
    });
    const source = join(home, ".vstack", "tmp", "_global", "grilling", "historical-brief-fixture");
    const fixtures = join(import.meta.dir, "fixtures", "flow-page-migrate");
    mkdirSync(join(source, "figures"), { recursive: true });
    copyFileSync(join(fixtures, "legacy.jsonl"), join(source, "page.jsonl"));
    copyFileSync(join(fixtures, "scope.svg"), join(source, "figures", "scope.svg"));
    const migrated = cli(["migrate", source]);
    await page.goto(`${migrated.live.url}#q-scope`);
    const oldScope = page.locator("#q-scope");
    await oldScope.getByText("The cap is global.", { exact: true }).waitFor();
    expect(await oldScope.getByText("src/limits.ts:10", { exact: true }).isVisible()).toBe(false);
    await oldScope.locator("summary").filter({ hasText: /^Sources and context$/ }).click();
    expect(await oldScope.getByText("src/limits.ts:10", { exact: true }).isVisible()).toBe(true);

    for (const record of [
      { flow: old.flow, stage: old.stage, id: oldId, description: "This description was stored before Decision briefs.", choice: "A. Keep", proof: "pre-cutover" },
      { flow: old.flow, stage: old.stage, id: oldBriefId, description: "This brief was stored before the Settle-or-ask test.", choice: "A. Leave it", proof: "pre-settle-or-ask", briefLabels: oldBriefLabels },
      { flow: migrated.flow, stage: "impl", id: "q-open", description: "Why q-open matters.", choice: "A. First", proof: "migrated" },
    ]) {
      const shown = cli(["show", "--flow", record.flow]);
      await page.goto(`${shown.live.url}#${record.id}`);
      const question = page.locator(`#${record.id}`);
      expect(await question.getByText(record.description, { exact: true }).isVisible()).toBe(true);
      expect(await question.getByRole("heading", { name: new RegExp(record.choice) }).isVisible()).toBe(true);
      const labels = question.getByRole("region", { name: "Decision brief" }).locator("dt");
      expect(await labels.allTextContents()).toEqual(record.briefLabels ?? []);
      expect(shown.next).toContain(record.id);
      if (proof) {
        await page.screenshot({ path: join(proof, `${record.proof}-320.png`), fullPage: true });
        writeFileSync(join(proof, `${record.proof}-320.aria.txt`), await question.ariaSnapshot());
      }
      cli(["submit", "--flow", record.flow, "--stage", record.stage], [
        { kind: "answer", question: record.id, response: { status: "answered", picks: ["A"] } },
      ]);
      await question.getByText(`Your pick: ${record.choice}`, { exact: true }).waitFor();
      expect(await labels.allTextContents()).toEqual(record.briefLabels ?? []);
    }
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
