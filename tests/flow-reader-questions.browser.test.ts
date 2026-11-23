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
  writeFileSync(join(root, "path.mmd"), 'flowchart LR\n  a[Read the context] --> b[Answer the question]\n');
  const browser = await chromium.launch({ headless: true });
  try {
    const opened = cli(["open", "--skill", "grill-me", "--title", "Questions and shared context"]);
    const published = cli(["submit"], [
      { kind: "attachment", ref: "path", type: "mermaid", caption: "Reading path", description: "Read `context` before answering.", origin: "path.mmd", path: "path.mmd", focus: ["b"] },
      { kind: "background", title: "Background", summary: "Two routes share the same context.", sections: [{ heading: "Today", body: "The reader keeps **authored content** separate from your answer." }], sources: ["GLOSSARY.md"] },
      { kind: "topic", ref: "context", title: "Shared context", summary: "A concept used by both questions.", body: "- Read the Background\n- Compare the options", sources: ["ADR 0067"] },
      { kind: "assumed", ref: "assumption", decision: "Keep stored revisions", pick: "Retain the original", why: "No authored record should move." },
      { kind: "round", now, questions: [
        { ref: "first", title: "Keep the reading path?", description: "Read the context and compare both routes.", brief: { unblocks: "Choose the reading order for the reader release.", undo: "Restore the current order in the next release." }, topics: ["context"], terms: [{ term: "Flow", text: "Related work across Stages." }], today: [{ text: "The host serves the built reader.", source: "reader/ship.ts" }], example: "Read → compare → answer", needs: [{ need: "Follow the current path.", kind: "context-diagram" }], figures: [{ attachment: "path", kind: "context-diagram" }], options: [{ label: "Keep", does: "Retain the path.", gains: ["Familiar reading order"], costs: ["No new route"], recommended: "The path already works." }, { label: "Change", does: "Replace the path.", gains: ["Another route"], costs: ["Relearn the order"] }] },
        { ref: "second", title: "Read the next question?", description: "Keyboard navigation reaches this question.", brief: { unblocks: "Continue the keyboard walkthrough.", undo: "Return to the first question.", no_recommendation: "Neither order changes the result of this walkthrough." }, needs: [{ need: "Understand the next choice.", kind: "prose" }], options: [{ label: "Continue", does: "Reads the next question.", gains: ["More context"], costs: ["More reading"] }] },
        { ref: "noted", title: "Where should the cap live?", description: "The number sits in code today.", brief: { unblocks: "Implement the cap in the chosen place.", undo: "Move it back to its original owner.", no_recommendation: "The operator has not said how often the cap changes." }, needs: [{ need: "Compare where the cap lives.", kind: "prose" }], options: [{ label: "Keep in code", does: "Keeps the constant.", gains: ["Reviewed with code"], costs: ["A deploy per change"] }, { label: "Move to config", does: "Reads it from settings.", gains: ["Ops can change it"], costs: ["Config drift"] }] },
        { ref: "worded", title: "Should the check run on the server?", description: "Only the browser checks today.", brief: { unblocks: "Add the check to the chosen request path.", undo: "Revert the request validation change.", no_recommendation: "The server's lookup budget is not known." }, needs: [{ need: "Compare where the check runs.", kind: "prose" }], options: [{ label: "Server too", does: "The API rejects carts.", gains: ["Cannot be bypassed"], costs: ["One more lookup"] }, { label: "Browser only", does: "Keeps the client check.", gains: ["No API change"], costs: ["A crafted request skips it"] }] },
      ] },
    ]);
    cli(["submit"], [
      { kind: "answer", question: published.refs.first, response: { status: "answered", picks: ["A"] } },
      { kind: "answer", question: published.refs.noted, response: { status: "answered", picks: ["A"], text: "Config would be nice later.", note_on: "B" } },
      { kind: "answer", question: published.refs.worded, response: { status: "answered", text: "A server check worries me.", note_on: "A" }, reading: { outcome: "concern", unresolved: "Whether one more lookup fits the budget." } },
    ]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${opened.live.url}#${published.refs.first}`);
    await page.getByRole("img", { name: "Reading path" }).locator("svg").waitFor();
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
    expect(await firstBrief.evaluate(el => el.previousElementSibling?.tagName)).toBe("H2");
    expect(await firstBrief.locator("dt").allTextContents()).toEqual(["Now", "Recommendation", "After you answer"]);
    expect(await firstBrief.getByText(now, { exact: true }).isVisible()).toBe(true);
    expect(await firstBrief.innerText()).toContain("A. Keep");
    expect(await firstBrief.innerText()).toContain("The path already works.");
    expect(await firstBrief.innerText()).toContain("Choose the reading order for the reader release.");
    expect(await firstBrief.innerText()).toContain("Restore the current order in the next release.");
    const secondBrief = page.locator(`#${published.refs.second}`).getByRole("region", { name: "Decision brief" });
    expect(await secondBrief.locator("dt").allTextContents()).toEqual(["Now", "No recommendation", "After you answer"]);
    expect(await secondBrief.getByText("Neither order changes the result of this walkthrough.", { exact: true }).isVisible()).toBe(true);
    expect(await question.evaluate((el) => ({ display: getComputedStyle(el).display, gap: getComputedStyle(el).gap }))).toEqual({ display: "grid", gap: "10px" });
    expect(await question.locator(".options").evaluate((el) => ({ display: getComputedStyle(el).display, list: getComputedStyle(el).listStyleType }))).toEqual({ display: "grid", list: "none" });
    expect(await question.locator(".answer").count()).toBe(0);
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
    const terms = question.locator("summary").filter({ hasText: /^Term notes/ });
    await terms.focus();
    await page.keyboard.press("Enter");
    expect(await question.getByText("Related work across Stages.").isVisible()).toBe(true);
    await page.keyboard.press("Space");
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
    expect(cli(["show", "--flow", opened.flow]).revision).toBe(published.revision + 1);
    const retryReason = "The earlier attempt has no answer. Confirm the path before the release walkthrough.";
    const retry = cli(["submit"], [{ kind: "round", now: "The release walkthrough starts next.", questions: [{
      ref: "retry", again: published.refs.second, title: "Continue the walkthrough?", description: "The release walkthrough is ready.",
      brief: { asked_again_because: retryReason, unblocks: "Proceed to the release checklist.", undo: "Return to the reading path before publishing." },
      needs: [{ need: "Know what the walkthrough covers.", kind: "prose" }],
      options: [{ label: "Continue", does: "Opens the release checklist.", gains: ["Checklist coverage"], costs: ["One more step"], recommended: "The path check is complete." }],
    }] }]);
    await page.goto(`${opened.live.url}#${retry.refs.retry}`);
    const reasked = page.locator(`#${retry.refs.retry}`).getByRole("region", { name: "Decision brief" });
    await reasked.waitFor();
    expect(await reasked.locator("dt").allTextContents()).toEqual(["Now", "Asked again because", "Recommendation", "After you answer"]);
    expect(await reasked.getByText(retryReason, { exact: true }).isVisible()).toBe(true);
    expect(await reasked.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (proof) {
      await page.screenshot({ path: join(proof, "decision-brief-reask-320.png"), fullPage: true });
      writeFileSync(join(proof, "decision-brief-reask-320.aria.txt"), await reasked.ariaSnapshot());
    }

    const old = cli(["open", "--skill", "grill-me", "--title", "Stored before Decision briefs"]);
    const oldId = "question-1";
    editStoredFlow(home, old.flow, state => {
      const round = { id: "round-1", stage: old.stage, n: 1, seq: 1, time: state.flow.created };
      state.rounds.push(round);
      state.questions.push({
        id: oldId, round: round.id, stage: old.stage, q: 1,
        title: "Keep the stored selection?", description: "This description was stored before Decision briefs.",
        options: [{ label: "A. Keep", does: "Keeps the current reader.", gains: ["Continuity"], costs: ["No new features"], recommended: "The old layout works." }],
      });
      state.next.round = state.next.question = state.seq = 1;
      state.reading = { historical: [], publications: [{ id: oldId, kind: "question", stage: old.stage, position: 1, publication: ++state.revision }] };
    });
    const source = join(home, ".vstack", "tmp", "_global", "grilling", "historical-brief-fixture");
    const fixtures = join(import.meta.dir, "fixtures", "flow-page-migrate");
    mkdirSync(join(source, "figures"), { recursive: true });
    copyFileSync(join(fixtures, "legacy.jsonl"), join(source, "page.jsonl"));
    copyFileSync(join(fixtures, "scope.svg"), join(source, "figures", "scope.svg"));
    const migrated = cli(["migrate", source]);

    for (const record of [
      { flow: old.flow, stage: old.stage, id: oldId, description: "This description was stored before Decision briefs.", choice: "A. Keep", proof: "pre-cutover" },
      { flow: migrated.flow, stage: "impl", id: "q-open", description: "Why q-open matters.", choice: "A. First", proof: "migrated" },
    ]) {
      const shown = cli(["show", "--flow", record.flow]);
      await page.goto(`${shown.live.url}#${record.id}`);
      const question = page.locator(`#${record.id}`);
      expect(await question.getByText(record.description, { exact: true }).isVisible()).toBe(true);
      expect(await question.getByRole("heading", { name: new RegExp(record.choice) }).isVisible()).toBe(true);
      expect(await question.getByRole("region", { name: "Decision brief" }).count()).toBe(0);
      expect(shown.next).toContain(record.id);
      if (proof) {
        await page.screenshot({ path: join(proof, `${record.proof}-320.png`), fullPage: true });
        writeFileSync(join(proof, `${record.proof}-320.aria.txt`), await question.ariaSnapshot());
      }
      cli(["submit", "--flow", record.flow, "--stage", record.stage], [
        { kind: "answer", question: record.id, response: { status: "answered", picks: ["A"] } },
      ]);
      await question.getByText(`Your pick: ${record.choice}`, { exact: true }).waitFor();
      expect(await question.getByRole("region", { name: "Decision brief" }).count()).toBe(0);
    }
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
