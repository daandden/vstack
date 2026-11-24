import { expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV, git } from "./support/fixture.ts";
import { repoKey, scratchRoot } from "../plugin/skills/vstack-tmp/scripts/scratch.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("historical Today facts stay visible and new questions fold Today facts with their sources", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-sources-")));
  const home = join(root, "home");
  mkdirSync(home);
  git(root, "init", "-q");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed");
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], input?: object): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "reader-sources", "--agent", "fixture"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true, ...(process.env.VSTACK_TEST_BROWSER_CHANNEL ? { channel: process.env.VSTACK_TEST_BROWSER_CHANNEL } : {}) });
  try {
    const facts = [
      { text: "Six open streams prevent the next page from loading.", source: "host.ts:94" },
      { text: "Closing one page releases the waiting request.", source: "capacity-proof.json:17" },
    ];
    const question = {
      title: "Replace blocking streams?",
      description: "A seventh page waits for another reader to close.",
      needs: [{ need: "Understand the connection limit.", kind: "prose" }],
      today: facts,
      options: [{ label: "Replace streams", does: "Use connection-safe updates.", gains: ["Additional pages load."], costs: ["Preserve revision delivery."] }],
    };
    const historical = join(scratchRoot(home), repoKey(root), "grilling", "historical-sources");
    mkdirSync(historical, { recursive: true });
    writeFileSync(join(historical, "page.jsonl"), [
      { type: "page", id: "page", title: "Historical source disclosure" },
      { type: "stage", id: "first", skill: "session", state: "in-progress", order: 1 },
      { type: "round", id: "r1", stage: "first", time: "2026-10-28T20:09:59+07:00", session: 1, round: 1 },
      { ...question, type: "question", id: "old-capacity", round: "r1", q: 1,
        options: question.options.map(option => ({ ...option, label: `A. ${option.label}` })) },
    ].map(row => JSON.stringify(row)).join("\n") + "\n");
    const migrated = cli(["migrate", historical]);
    const opened = cli(["open", "--skill", "session", "--title", "New source disclosure"]);
    const seeded = cli(["submit"], { version: 1, items: [{
      kind: "round", now: "The current connection limit can be reproduced.",
      questions: [{ ...question, ref: "capacity", brief: decisionBrief("the stream transport") }],
    }] });
    cli(["host", "stop"]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    for (const [flow, id, brief] of [[migrated.flow, "old-capacity", false], [opened.flow, seeded.refs.capacity, true]] as const) {
      const resumed = cli(["show", "--flow", flow]);
      await page.goto(`${resumed.live.url}#${id}`);
      const record = page.locator(`#${id}`);
      await record.waitFor();
      expect(await record.getByRole("region", { name: "Decision brief" }).count()).toBe(Number(brief));
      const summary = record.getByText("Sources and context", { exact: true });
      const disclosure = summary.locator("..");
      const checkVisibility = async (open: boolean) => {
        expect(await disclosure.getAttribute("open") !== null).toBe(open);
        for (const fact of facts) {
          expect(await record.getByText(fact.text, { exact: true }).isVisible()).toBe(open || !brief);
          expect(await disclosure.getByText(fact.source, { exact: true }).isVisible()).toBe(open);
          expect(await disclosure.getByText(fact.text, { exact: true }).count()).toBe(Number(brief));
        }
      };
      await checkVisibility(false);
      await summary.focus();
      await page.keyboard.press("Enter");
      await checkVisibility(true);
      await page.keyboard.press("Space");
      await checkVisibility(false);
      expect(cli(["show", "--flow", flow]).revision).toBe(resumed.revision);
    }
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
