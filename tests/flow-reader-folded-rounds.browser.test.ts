import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { decisionBrief } from "./support/decision-brief.ts";
import { ENV } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const question = (ref: string, title: string, previous?: { id: string; reason: string }) => ({
  ref, title, description: `Read the ${ref} evidence before choosing.`, needs: [{ need: `Review the ${ref} evidence`, kind: "prose" }],
  brief: decisionBrief(ref, { again: previous?.reason }),
  ...(previous ? { again: previous.id } : {}),
  options: [{ label: "Keep the record", does: `Preserves the ${ref} evidence.`, gains: [`Keeps ${ref} traceable`], costs: [`More ${ref} reading`] }],
});
const result = (ref: string, title: string) => ({ kind: "result", ref, shape: "document", title, sections: [{ heading: "Evidence", blocks: [{ prose: "Keep the source record." }] }] });

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-folded-rounds-")));
  const home = join(root, "home");
  mkdirSync(home);
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  function cli(args: string[], items?: object[]) {
    const child = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "01a20794-d24f-70b8-8eb7-ca9f864d1cf3", "--agent", "Implement569"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${child.stderr.toString()}`);
    return JSON.parse(child.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  return { home, cli, browser, async close() { await browser.close(); cli(["host", "stop"]); rmSync(root, { recursive: true, force: true }); } };
}

test("a Stage reads like one block per round with the intervening Result and declared Q order intact", async () => {
  const f = await fixture();
  try {
    const opened = f.cli(["open", "--skill", "research", "--title", "Choosing a retention route"]);
    const first = f.cli(["submit"], [{ kind: "round", now: "The signed source and its audit copy are ready for review.", questions: [question("retention", "Retain the signed source?"), question("audit", "Keep an audit copy?")] }]);
    const second = f.cli(["submit"], [result("report", "Evidence between the asks"), { kind: "round", now: "The evidence report is available after the first round.", questions: [question("owner", "Wait for the owner?"), question("retry", "Retain the signed source this time?", { id: first.refs.retention, reason: "The first ask preceded the evidence report and has no answer." })] }]);
    const shown = f.cli(["show", "--flow", opened.flow]);
    expect(shown.reading.publications.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual([
      [first.refs.retention, 1], [first.refs.audit, 2], [second.refs.report, 3], [second.refs.owner, 4], [second.refs.retry, 5],
    ]);
    const [round1, round2] = shown.stages[0].rounds;
    const page = await f.browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${opened.live.url}#${round2.id}`);
    const stage = page.getByRole("region", { name: "Research", exact: true });
    await stage.waitFor();
    const headers = stage.getByRole("heading", { name: /^Round [12]$/ });
    expect(await headers.allTextContents()).toEqual(["Round 1", "Round 2"]);
    const round = page.locator(`#${round2.id}`);
    expect(await round.innerText()).toMatch(/Round 2.*Q3, Q1/s);
    expect(await round.innerText()).toMatch(/ago|just now/);
    expect(await round.locator("time").getAttribute("datetime")).toBe(round2.time);
    expect(await stage.locator(`[id="${round1.id}"], [id="${second.refs.report}"], [id="${round2.id}"]`).evaluateAll(els => els.map(el => el.id))).toEqual([round1.id, second.refs.report, round2.id]);
    const questionIds = [first.refs.retention, first.refs.audit, second.refs.owner, second.refs.retry];
    expect(await stage.locator(questionIds.map(id => `[id="${id}"]`).join(", ")).evaluateAll(els => els.map(el => el.id))).toEqual(questionIds);
    expect(await stage.locator('[title^="First published at position"]').allTextContents()).toEqual(["03"]);
    expect(new URL(page.url()).hash).toBe(`#${round2.id}`);
  } finally { await f.close(); }
}, 120_000);

test("folded questions show their own decision provenance and earlier attempts point to the latest ask", async () => {
  const f = await fixture();
  try {
    const opened = f.cli(["open", "--skill", "research", "--title", "Reviewing decision history"]);
    const q = f.cli(["submit"], [{ kind: "round", now: "The source records and publication route are ready for review.", questions: [
      question("picked", "Keep a copy of the signed source?"),
      question("words", "Keep the audit trail?"),
      question("concern", "Publish the route now?"),
      question("timed", "Use the cached copy?"),
      question("cancelled", "Notify both reviewers?"),
      question("empty", "Retain the rejected draft?"),
      question("headless", "Request another review?"),
      question("retired", "Track a separate follow-up?"),
      question("unsettled", "Send the original note?"),
    ] }]).refs;
    f.cli(["submit"], [
      { kind: "answer", question: q.picked, response: { status: "answered", picks: ["A"] } },
      { kind: "answer", question: q.words, response: { status: "answered", text: "Keep the full audit trail." }, reading: { outcome: "resolved", decision: "Retain every audit entry", basis: "The note says to keep all entries." } },
      { kind: "answer", question: q.concern, response: { status: "answered", text: "Will this publish private details?" }, reading: { outcome: "concern", unresolved: "Check which fields would become public." } },
      { kind: "answer", question: q.timed, response: { status: "timed-out", picks: ["A"] } },
      { kind: "answer", question: q.cancelled, response: { status: "cancelled", picks: ["A"] } },
      { kind: "answer", question: q.empty, response: { status: "empty" } },
      { kind: "answer", question: q.headless, response: { status: "headless", picks: ["A"] } },
    ]);
    const first = f.cli(["submit"], [{ kind: "round", now: "The review identified private fields in the original material.", questions: [
      question("retry", "Publish the route with private fields removed?", { id: q.concern, reason: "The reader raised a concern about publishing private details." }),
      question("retry-note", "Send a redacted note?", { id: q.unsettled, reason: "The original note did not receive an answer before redaction." }),
    ] }]).refs;
    f.cli(["submit"], [{ kind: "stage", state: "finished", retire: [q.timed, q.cancelled, q.empty, q.headless, q.retired, first.retry, first["retry-note"]].map(question => ({ question, reason: "Deferred to a later Stage." })) }]);
    const later = f.cli(["open", "--flow", opened.flow, "--parent", opened.stage, "--skill", "implement"]);
    const latest = f.cli(["submit"], [{ kind: "round", now: "The earlier Stage deferred publication. The privacy check is complete.", questions: [question("latest", "Publish after the privacy review?", { id: first.retry, reason: "The review was still pending when the earlier Stage finished." })] }]).refs.latest;
    const page = await f.browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${opened.live.url}#${opened.stage}`);
    const stage = page.getByRole("region", { name: "Research", exact: true });
    await stage.waitFor();
    for (const [ref, status] of Object.entries({
      picked: "Your pick: A. Keep the record", words: "Agent read your words: Retain every audit entry",
      concern: "Concern", timed: "Timed out, not your answer", cancelled: "Cancelled, not your answer",
      empty: "Empty response, not your answer", headless: "Headless, not your answer", retired: "Retired", unsettled: "Not settled",
    })) {
      const row = stage.locator(`#${q[ref]}`);
      expect(await row.innerText()).toContain(status);
      expect(await row.getByRole("list", { name: "Choices" }).isVisible()).toBe(false);
      if (ref !== "picked") expect(await row.innerText()).not.toContain("Your pick:");
    }
    await capture(page, "question-outcomes-folded");
    const picked = stage.locator(`#${q.picked}`);
    expect(await picked.innerText()).toContain("Q1: Keep a copy of the signed source?");
    const summary = picked.locator("summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    expect(await picked.getByRole("heading", { name: /your answer/ }).isVisible()).toBe(true);
    await page.keyboard.press("Space");
    expect(await picked.getByRole("list", { name: "Choices" }).isVisible()).toBe(false);
    const link = stage.locator(`#${q.concern}`).getByRole("link", { name: /Latest attempt.*Implement/ });
    expect(await link.getAttribute("href")).toBe(`#${latest}`);
    await link.focus();
    await page.keyboard.press("Enter");
    const openQuestion = page.getByRole("region", { name: "Implement", exact: true }).locator(`#${latest}`);
    await openQuestion.getByRole("list", { name: "Choices" }).waitFor();
    expect(new URL(page.url()).hash).toBe(`#${latest}`);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(latest);
    expect(later.stage).not.toBe(opened.stage);
  } finally { await f.close(); }
}, 120_000);

async function capture(page: Page, name: string) {
  const proof = process.env.FLOW_READER_EVIDENCE;
  if (!proof) return;
  mkdirSync(proof, { recursive: true });
  await page.screenshot({ path: join(proof, `${name}.png`), fullPage: true });
  writeFileSync(join(proof, `${name}.aria.txt`), await page.getByRole("main").ariaSnapshot());
}

test("adjacent Assumed picks share one folded row without swallowing a Result or its later neighbours", async () => {
  const f = await fixture();
  try {
    const opened = f.cli(["open", "--skill", "research", "--title", "Testing Stage history links"]);
    const assumed = (ref: string, decision: string) => ({ kind: "assumed", ref, decision, pick: `Keep ${ref} for now`, why: "This provisional choice can be undone." });
    const longTitle = "Retain notes for customer-feedback-from-enterprise-onboarding-and-production-deployment-audits";
    const q = f.cli(["submit"], [
      assumed("archive", longTitle), assumed("verification", "Keep Đặng Thị Ngọc Hân's notes"),
      result("proved", "Evidence between the agent decisions"),
      assumed("separate", "Use a second review"),
      { kind: "round", now: "The evidence is available to revisit the verification notes.", questions: [{ ...question("reopen", "Revisit the verification notes?"), reopens: "verification", results: ["proved"] }] },
    ]).refs;
    f.cli(["submit"], [
      { kind: "answer", question: q.reopen, response: { status: "answered", picks: ["A"] } },
      { kind: "stage", state: "finished" },
    ]);
    f.cli(["open", "--flow", opened.flow, "--parent", opened.stage, "--skill", "implement"]);
    const corrected = f.cli(["submit"], [
      assumed("corrected", "Require an archive review"),
      { kind: "corrects", target: q.archive, replacement: "corrected", reason: "The archive needs another review." },
    ]).refs.corrected;
    const page = await f.browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${opened.live.url}#${opened.stage}`);
    const stage = page.getByRole("region", { name: "Research", exact: true });
    await stage.waitFor();
    const batches = stage.locator("summary").filter({ hasText: /decisions? the agent made/ });
    expect(await batches.count()).toBe(2);
    expect(await batches.first().innerText()).toContain("2 decisions the agent made");
    expect(await batches.last().innerText()).toContain("1 decision the agent made");
    expect(await batches.first().innerText()).toContain("name it in a picker note");
    const report = stage.getByRole("heading", { name: "Evidence between the agent decisions" });
    const reportTop = () => report.evaluate(el => el.getBoundingClientRect().top + scrollY);
    const before = await reportTop();
    expect(await batches.first().evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeLessThan(before);
    expect(await batches.last().evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeGreaterThan(before);
    const first = stage.getByRole("heading", { name: longTitle });
    const second = stage.getByRole("heading", { name: "Keep Đặng Thị Ngọc Hân's notes" });
    expect(await first.isVisible()).toBe(false);
    expect(await second.isVisible()).toBe(false);
    await capture(page, "stage-folded-1280");
    await batches.first().click();
    expect(await first.isVisible()).toBe(true);
    expect(await second.isVisible()).toBe(true);
    expect(await reportTop()).toBeGreaterThan(before);
    expect(await stage.getByRole("heading", { name: "Use a second review" }).isVisible()).toBe(false);
    const warning = stage.locator(`#${q.archive}`).getByRole("complementary", { name: "Correction notice" });
    expect(await warning.innerText()).toContain("The archive needs another review.");
    await warning.getByRole("link", { name: /^Corrected by/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${corrected}`);
    const replacement = page.locator(`#${corrected}`);
    expect(await replacement.getByRole("heading", { name: "Require an archive review" }).isVisible()).toBe(true);
    await replacement.getByRole("link", { name: /^Assumed:/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.archive}`);
    expect(await first.isVisible()).toBe(true);
    await stage.locator(`#${q.verification}`).getByRole("link", { name: "Reopened in Q1" }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.reopen}`);
    const reopen = stage.locator(`#${q.reopen}`);
    expect(await reopen.getByRole("list", { name: "Choices" }).isVisible()).toBe(true);
    await reopen.getByRole("link", { name: /Reopens an Assumed pick/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.verification}`);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(q.verification);
    const deepLink = await f.browser.newPage({ viewport: { width: 320, height: 900 } });
    await deepLink.goto(`${opened.live.url}#${q.reopen}-choices`);
    const choices = deepLink.getByRole("list", { name: "Choices" });
    await choices.waitFor();
    expect(await choices.getAttribute("id")).toBe(`${q.reopen}-choices`);
    expect(new URL(deepLink.url()).hash).toBe(`#${q.reopen}-choices`);
    const bar = deepLink.getByRole("navigation", { name: "Flow navigation", exact: true });
    expect(await bar.evaluate((el, id) =>
      document.getElementById(id)!.getBoundingClientRect().top - el.getBoundingClientRect().bottom, `${q.reopen}-choices`)).toBeGreaterThanOrEqual(-1);
    await deepLink.reload();
    await choices.waitFor();
    expect(new URL(deepLink.url()).hash).toBe(`#${q.reopen}-choices`);
    await deepLink.goto(`${opened.live.url}#${opened.stage}-assumed`);
    await deepLink.getByRole("heading", { name: longTitle }).waitFor();
    expect(new URL(deepLink.url()).hash).toBe(`#${opened.stage}-assumed`);
    const noOverflow = () => deepLink.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0);
    for (const theme of ["Light", "Dark"]) {
      await deepLink.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await deepLink.setViewportSize({ width, height: 900 });
        expect(await noOverflow()).toBe(true);
        await capture(deepLink, `stage-expanded-${theme.toLowerCase()}-${width}`);
      }
    }
    await deepLink.setViewportSize({ width: 320, height: 900 });
    await deepLink.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await noOverflow()).toBe(true);
    await capture(deepLink, "stage-expanded-text-growth-proxy");
    await deepLink.close();
    expect(errors).toEqual([]);
  } finally { await f.close(); }
}, 120_000);

test("a migrated Stage keeps retained order, one boundary notice, and old round and question fragments", async () => {
  const f = await fixture();
  try {
    const legacy = join(f.home, ".vstack", "tmp", "_global", "round-history");
    const time = "2024-10-28T20:09:59+07:00";
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "page.jsonl"), [
      { type: "page", id: "page", title: "Retained review" },
      { type: "stage", id: "legacy", skill: "research", state: "in-progress", order: 1 },
      { type: "background", id: "legacy-background", stage: "legacy", title: "Old background", summary: "Retained context.", sections: [{ heading: "Finding", body: "Still useful." }], sources: ["archive.md"] },
      { type: "round", id: "legacy-round", stage: "legacy", time, session: 1, round: 1 },
      { type: "question", id: "legacy-q", round: "legacy-round", q: 1, title: "Keep the previous source?", description: "The original evidence is in the archive.", options: [{ label: "A. Keep", does: "Keeps the archive.", gains: ["One record"], costs: ["More reading"] }] },
      { type: "answer", question: "legacy-q", other: "Keep the archive under its old name.", id: "legacy-answer" },
    ].map(record => JSON.stringify(record)).join("\n") + "\n");
    const migrated = f.cli(["migrate", legacy]);
    const modern = f.cli(["submit", "--flow", migrated.flow, "--stage", "legacy"], [result("modern", "Current evidence")]);
    const shown = f.cli(["show", "--flow", migrated.flow]);
    expect(shown.reading.historical.map((block: { id: string }) => block.id)).toEqual(["legacy-background", "legacy-q"]);
    expect(shown.reading.publications[0]).toMatchObject({ id: modern.refs.modern, position: 1 });
    const page = await f.browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${migrated.live.url}#round-legacy-round`);
    const stage = page.getByRole("region", { name: "Research", exact: true });
    await stage.waitFor();
    expect(await stage.getByText(/exact publication order/i).allTextContents()).toEqual(["Historical content in retained order. Exact publication order is unknown."]);
    expect(await stage.getByText("First-publication order starts here").count()).toBe(0);
    expect(await stage.locator(`#legacy-background, #legacy-round, #legacy-q, #${modern.refs.modern}`).evaluateAll(els => els.map(el => el.id))).toEqual(["legacy-background", "legacy-round", "legacy-q", modern.refs.modern]);
    const round = stage.locator("#legacy-round");
    expect(await round.getByRole("heading", { name: "Round 1" }).isVisible()).toBe(true);
    expect(await round.locator("time").getAttribute("datetime")).toBe(time);
    expect(await round.innerText()).toMatch(/ago/);
    const question = page.locator("#legacy-q");
    expect(await question.innerText()).toContain("Recorded answer: Keep the archive under its old name.");
    expect(await question.getByRole("list", { name: "Choices" }).isVisible()).toBe(false);
    await page.goto(`${migrated.live.url}#q-legacy-q`);
    await question.getByRole("list", { name: "Choices" }).waitFor();
    expect(new URL(page.url()).hash).toBe("#q-legacy-q");
    expect(await question.getByRole("region", { name: "Current outcome" }).innerText()).toBe("Recorded answer: Keep the archive under its old name.");
    expect(await question.getByText("The original evidence is in the archive.").isVisible()).toBe(true);
    expect(await question.getByText("Keep the archive under its old name.", { exact: true }).isVisible()).toBe(true);
    await capture(page, "stage-historical");
  } finally { await f.close(); }
}, 120_000);
