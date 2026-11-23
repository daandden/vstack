import { expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const question = (ref: string, again?: string, reason?: string) => ({ ref, brief: decisionBrief(ref, { again: reason }), ...(again ? { again } : {}), title: `Review ${ref}?`, description: `Compare the ${ref} evidence before deciding.`, needs: [{ need: `Read the ${ref} proposal`, kind: "prose" }], options: [{ label: "Keep the recorded evidence", does: `Retains the ${ref} record.`, gains: [`Traceable ${ref} decision`], costs: [`More ${ref} reading`] }] });

test("question outcomes keep current readings and direct evidence, choices, and latest-attempt navigation", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-question-outcomes-")));
  const home = join(root, "home");
  mkdirSync(home);
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  function cli(args: string[], items?: object[]) {
    const child = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "01a1cf9b-7357-7275-a7cc-46e155c3a3e2", "--agent", "VerifyRepair2"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return JSON.parse(child.stdout.toString()) as { flow: string; stage: string; refs: Record<string, string>; live: { url: string } };
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    writeFileSync(join(root, "evidence.mmd"), "flowchart TD\n  source[Retain source evidence] --> review[Review before choosing]\n");
    const opened = cli(["open", "--title", "Question outcome navigation", "--skill", "research"]);
    const first = cli(["submit"], [
      { kind: "attachment", ref: "diagram", type: "mermaid", path: "evidence.mmd", origin: "Local fixture", caption: "Decision evidence" },
      { kind: "result", ref: "evidence", shape: "document", title: "Deployment evidence", attachments: ["diagram"], sections: [{ heading: "Assessment", blocks: [{ prose: "Permission needs an explicit decision." }] }] },
      { kind: "round", now: "The decision evidence is available for review.", questions: [
        { ...question("corrected"), title: "Can the deployment proceed after the assessment of incomplete source evidence?", needs: [{ need: "Compare all recorded evidence", kind: "context-diagram" }], figures: Array.from({ length: 8 }, () => ({ attachment: "diagram", kind: "context-diagram" })) },
        question("picked"), question("written"), question("headless"), question("cancelled"), question("empty"), question("timed-out"), question("open"), question("reasked"),
      ] },
    ]);
    const q = first.refs;
    cli(["submit"], [
      { kind: "answer", question: q.corrected, response: { status: "answered", text: "Possibly a technical shaft, not sure <script>alert(1)</script> &amp;" }, reading: { outcome: "resolved", decision: "Proceed with deployment", basis: "Incorrectly inferred permission" } },
      { kind: "answer", question: q.picked, response: { status: "answered", picks: ["A"] } },
      { kind: "answer", question: q.written, response: { status: "answered", text: "Keep the complete audit trail" }, reading: { outcome: "resolved", decision: "Retain the audit trail", basis: "The words settle retention" } },
      ...["headless", "cancelled", "empty", "timed-out"].map(status => ({ kind: "answer", question: q[status], response: { status, ...(status === "empty" ? {} : { picks: ["A"] }) } })),
    ]);
    const reasked = cli(["submit"], [{ kind: "round", now: "The decision evidence is available for review.", questions: [question("reasked-again", q.reasked, "The earlier question has no answer.")] }]).refs["reasked-again"]!;
    cli(["submit"], [{ kind: "answer", question: reasked, response: { status: "answered", picks: ["A"] } }]);
    await page.goto(`${opened.live.url}#${q.corrected}`);
    const summary = (id: string) => page.locator(`#${id}`).getByRole("region", { name: "Current outcome", exact: true });
    await summary(q.corrected).waitFor({ timeout: 5000 });
    expect(await summary(q.corrected).innerText()).toContain("Proceed with deployment");
    cli(["submit"], [{ kind: "stage", state: "finished", retire: ["headless", "cancelled", "empty", "timed-out", "open"].map(ref => ({ question: q[ref], reason: `The ${ref} decision remains unsettled.` })) }]);
    cli(["open", "--flow", opened.flow, "--skill", "implement", "--parent", opened.stage]);
    const corrected = cli(["submit"], [
      { kind: "reading", ref: "withdrawn", question: q.corrected, reading: { outcome: "ambiguous", unresolved: "Uncertainty is not permission. Ask again before deployment." } },
      { kind: "corrects", target: `${q.corrected}/reading`, replacement: "withdrawn", reason: "The old reading invented permission." },
      { kind: "round", now: "The decision evidence is available for review.", questions: [{ ...question("retry", q.corrected, "The correction showed the previous words did not settle the decision."), options: [...question("retry").options, { label: "Ask before deployment", does: "Requires an explicit deployment decision.", gains: ["No inferred permission"], costs: ["Another review"] }] }] },
    ]);
    await summary(q.corrected).filter({ hasText: "Unresolved after correction" }).waitFor();
    expect(await summary(q.corrected).innerText()).not.toContain("Proceed with deployment");
    expect(await summary(q.corrected).innerText()).toContain("Uncertainty is not permission");
    const article = page.locator(`#${q.corrected}`);
    expect(await article.locator(".answer").innerText()).toContain("Possibly a technical shaft, not sure <script>alert(1)</script> &amp;");
    expect(await article.locator("[data-picked]").count()).toBe(0);
    expect(await article.locator("figure").count()).toBe(8);
    await article.getByRole("link", { name: "Choices", exact: true }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.corrected}-choices`);
    expect(await page.locator(`#${q.corrected}-choices`).isVisible()).toBe(true);
    await page.goto(`${opened.live.url}#${q.corrected}`);
    await article.getByRole("link", { name: "Evidence", exact: true }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.corrected}-evidence`);
    expect(await page.locator(`#${q.corrected}-evidence figure`).count()).toBe(8);
    const top = await page.locator(`#${q.corrected}-evidence`).evaluate(el => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(await page.locator(".bar").evaluate(el => el.getBoundingClientRect().bottom) - 1);
    await page.reload();
    expect(new URL(page.url()).hash).toBe(`#${q.corrected}-evidence`);
    await summary(q.corrected).getByRole("link", { name: /Latest attempt/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${corrected.refs.retry}`);
    expect(await summary(corrected.refs.retry).innerText()).toContain("Open");
    await page.locator(`#${corrected.refs.retry}`).getByRole("link", { name: /asked earlier/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${q.corrected}`);
    await page.goto(`${opened.live.url}#${q.open}`);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("n");
    expect(new URL(page.url()).hash).not.toBe(`#${corrected.refs.retry}`);
    for (const [ref, text] of Object.entries({ picked: "Your pick: A. Keep the recorded evidence", written: "Retain the audit trail", headless: "Headless, not your answer", cancelled: "Cancelled, not your answer", empty: "Empty response, not your answer", "timed-out": "Timed out, not your answer", open: "Retired" })) {
      await page.goto(`${opened.live.url}#${q[ref]}`);
      await summary(q[ref]).waitFor();
      expect(await summary(q[ref]).innerText()).toContain(text);
    }
    await page.goto(`${opened.live.url}#${q.reasked}`);
    const earlier = summary(q.reasked);
    await earlier.waitFor();
    expect(await earlier.innerText()).toContain("Re-asked");
    expect(await earlier.innerText()).not.toContain("Open");
    expect(await earlier.getByRole("link", { name: "Latest attempt: Q9 (attempt 2)", exact: true }).isVisible()).toBe(true);
    expect(await earlier.innerText()).toContain("Your pick: A. Keep the recorded evidence");
    expect(await page.locator(`#${q.reasked} .answer`).innerText()).toContain("Re-asked");
    expect(await page.locator(`#${q.reasked} .answer`).innerText()).not.toContain("Not answered");
    const shown = cli(["show", "--flow", opened.flow]) as unknown as { stages: { questions: { id: string; open: boolean }[] }[] };
    expect(shown.stages[0]!.questions.find(x => x.id === q.reasked)?.open).toBe(false);
    await page.goto(`${opened.live.url}#overview`);
    expect(await page.locator("#overview-stages").innerText()).toContain("Re-asked");
    expect(await page.locator("#overview-stages").innerText()).not.toContain("Proceed with deployment");
    cli(["submit"], [{ kind: "answer", question: corrected.refs.retry, response: { status: "answered", picks: ["B"] } }]);
    const timedOutRetry = cli(["submit"], [{ kind: "round", now: "The decision evidence is available for review.", questions: [question("timeout-retry", q["timed-out"], "The earlier picker timed out.")] }]).refs["timeout-retry"]!;
    cli(["submit"], [{ kind: "answer", question: timedOutRetry, response: { status: "answered", picks: ["A"] } }]);
    cli(["submit"], [{ kind: "stage", state: "finished" }]);
    await page.goto(`${opened.live.url}#${q.corrected}`);
    await page.reload();
    const correctedOutcome = summary(q.corrected);
    await correctedOutcome.filter({ hasText: "Your pick: B. Ask before deployment" }).waitFor();
    const proof = process.env.FLOW_READER_EVIDENCE;
    if (proof) {
      mkdirSync(proof, { recursive: true });
      writeFileSync(join(proof, "reasked-cross-stage.aria.txt"), await article.ariaSnapshot());
    }
    expect(await correctedOutcome.locator("p").first().innerText()).toBe("Re-asked");
    expect(await correctedOutcome.getByRole("link", { name: "Latest attempt: Q1 in Implement", exact: true }).getAttribute("href")).toBe(`#${corrected.refs.retry}`);
    expect(await correctedOutcome.innerText()).toContain("Unresolved after correction: Uncertainty is not permission. Ask again before deployment.");
    expect(await article.innerText()).not.toMatch(/\bOpen\b|Not answered|Still to ask/);
    await correctedOutcome.getByRole("link", { name: /Latest attempt/ }).click();
    expect(new URL(page.url()).hash).toBe(`#${corrected.refs.retry}`);
    expect(await summary(corrected.refs.retry).innerText()).toContain("Your pick: B. Ask before deployment");
    expect(await summary(corrected.refs.retry).innerText()).not.toContain("Re-asked");
    await page.goto(`${opened.live.url}#${q["timed-out"]}`);
    const timedOutOutcome = summary(q["timed-out"]);
    await timedOutOutcome.getByRole("link", { name: "Latest attempt: Q2 in Implement", exact: true }).waitFor();
    expect(await timedOutOutcome.locator("p").first().innerText()).toBe("Re-asked");
    expect(await timedOutOutcome.locator("p").nth(1).innerText()).toContain("Timed out, not your answer");
    expect(await timedOutOutcome.innerText()).toContain("Your pick: A. Keep the recorded evidence");
    expect(await timedOutOutcome.getByRole("link", { name: "Latest attempt: Q2 in Implement", exact: true }).getAttribute("href")).toBe(`#${timedOutRetry}`);
    expect(await page.locator(`#${q["timed-out"]}`).innerText()).not.toMatch(/\bOpen\b|Not answered|Still to ask/);
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${opened.live.url}#${q.corrected}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        await article.getByRole("link", { name: "Choices", exact: true }).focus();
        await page.keyboard.press("Enter");
        expect(new URL(page.url()).hash).toBe(`#${q.corrected}-choices`);
        const proof = process.env.FLOW_READER_EVIDENCE;
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await page.goto(`${opened.live.url}#${q.corrected}`);
          await page.screenshot({ path: join(proof, `outcome-${theme.toLowerCase()}-${width}.png`), fullPage: true });
          writeFileSync(join(proof, `outcome-${theme.toLowerCase()}-${width}.aria.txt`), await page.locator("body").ariaSnapshot());
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
