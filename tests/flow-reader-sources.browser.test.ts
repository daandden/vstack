import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("Today facts stay readable while their matching sources toggle by keyboard on stored questions", async () => {
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
    const opened = cli(["open", "--skill", "session", "--title", "Stored source disclosure"]);
    const seeded = cli(["submit"], { version: 1, items: [{ kind: "round", questions: [{
      ref: "capacity", title: "Replace blocking streams?", description: "A seventh page waits for another reader to close.",
      needs: [{ need: "Understand the connection limit.", kind: "prose" }],
      today: [
        { text: "Six open streams prevent the next page from loading.", source: "host.ts:94" },
        { text: "Closing one page releases the waiting request.", source: "capacity-proof.json:17" },
      ],
      options: [{ label: "Replace streams", does: "Use connection-safe updates.", gains: ["Additional pages load."], costs: ["Preserve revision delivery."] }],
    }] }] });
    cli(["host", "stop"]);
    const resumed = cli(["show", "--flow", opened.flow]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${resumed.live.url}#${seeded.refs.capacity}`);
    const question = page.locator(`#${seeded.refs.capacity}`);
    await question.waitFor();
    const facts = ["Six open streams prevent the next page from loading.", "Closing one page releases the waiting request."];
    for (const fact of facts) expect(await question.getByText(fact, { exact: true }).isVisible()).toBe(true);
    const disclosure = question.locator("details").filter({ has: page.locator("summary", { hasText: /^Sources/ }) });
    expect(await disclosure.count()).toBe(1);
    expect(await disclosure.getAttribute("open")).toBeNull();
    for (const source of ["host.ts:94", "capacity-proof.json:17"]) expect(await question.getByText(source, { exact: true }).isVisible()).toBe(false);
    const summary = disclosure.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    for (const source of ["host.ts:94", "capacity-proof.json:17"]) expect(await disclosure.getByText(source, { exact: true }).isVisible()).toBe(true);
    await page.keyboard.press("Space");
    expect(await disclosure.getAttribute("open")).toBeNull();
    for (const fact of facts) expect(await question.getByText(fact, { exact: true }).isVisible()).toBe(true);
    expect(cli(["show", "--flow", opened.flow]).revision).toBe(seeded.revision);
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
