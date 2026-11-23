import { afterAll, beforeAll, expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-foundation-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);
const proof = process.env.FLOW_READER_EVIDENCE;
if (proof) mkdirSync(proof, { recursive: true });

function cli(args: string[], items?: object[]) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c20b-3147-74c5-9dfb-082a101dd15e", "--agent", "impl-431"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: join(root, "default-home") },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${p.stderr.toString()}`);
  return JSON.parse(p.stdout.toString());
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

const colorOf = (page: Page, selector: string, property: "color" | "backgroundColor") => page.locator(selector).evaluate((el, property) => {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = getComputedStyle(el)[property];
  c.fillRect(0, 0, 1, 1);
  return `#${[...c.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}, property);
const bodyColor = (page: Page) => colorOf(page, "body", "backgroundColor");

async function capture(page: Page, name: string) {
  if (!proof) return;
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map((animation) => animation.finished)); });
  await page.screenshot({ path: join(proof, `${name}.png`), fullPage: true });
  writeFileSync(join(proof, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
}

test("the offline reader foundation keeps Catppuccin shell, navigation and diagrams under the host CSP", async () => {
  const opened = cli(["open", "--skill", "implement", "--title", "Reader foundation"]);
  writeFileSync(join(root, "reader.mmd"), 'flowchart LR\n  reader["Read the Flow"] --> choice["Choose deliberately"]\n');
  const submitted = cli(["submit"], [
    { kind: "attachment", ref: "diagram", type: "mermaid", caption: "Read then choose", origin: "Foundation browser fixture", path: "reader.mmd", focus: ["choice"] },
    { kind: "task", ref: "build", title: "Build the reader foundation", state: "active" },
    { kind: "task", title: "Check keyboard navigation", state: "pending" },
    { kind: "end-state", requested: "commit" },
    { kind: "topic", ref: "spacing", title: "Compact spacing", summary: "The fixture records the chosen spacing.", body: "The bar and reading view use separate spacing.", sources: ["GLOSSARY.md"] },
    { kind: "round", now: "The compact reader is ready to compare with the proposed spacing.", questions: [{ ref: "choice", title: "Keep the compact reader?", brief: decisionBrief("the reader spacing"), description: "Read the Flow before choosing.", needs: [{ need: "Follow reading to choosing.", kind: "context-diagram" }], figures: [{ attachment: "diagram", kind: "context-diagram" }], options: [{ label: "Keep", does: "Keeps the reader compact", gains: ["Familiar reading"], costs: ["No larger spacing"] }] }] },
  ]);
  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
  try {
    await context.addInitScript(() => {
      (window as any).policyViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => (window as any).policyViolations.push(`${e.violatedDirective}: ${e.blockedURI}`));
    });
    const page = await context.newPage();
    const outside: string[] = [], errors: string[] = [];
    const origin = new URL(opened.live.url).origin;
    page.on("request", (r) => { if (!r.url().startsWith("data:") && new URL(r.url()).origin !== origin) outside.push(r.url()); });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const response = await page.goto(opened.live.url);
    const policy = response!.headers()["content-security-policy"]!;
    expect(policy).toContain("font-src 'self'");
    expect(policy).toMatch(/script-src 'self' 'sha256-/);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy.split("script-src")[1]!.split(";")[0]).not.toContain("'unsafe-inline'");
    const overview = page.getByRole("region", { name: "Overview", exact: true });
    const disclosures = overview.locator(":scope > details > summary");
    expect(await disclosures.allTextContents()).toEqual(["Progress", "Changed since your last visit", "All Stages", "Topics"]);
    expect(await overview.locator(":scope > details[open]").count()).toBe(0);
    expect(await overview.getByRole("region", { name: "Open decisions", exact: true }).isVisible()).toBe(true);
    const footer = page.getByRole("contentinfo");
    expect(await footer.getByText(`Revision ${submitted.revision}`, { exact: true }).isVisible()).toBe(true);
    await footer.getByRole("group", { name: "Color theme" }).waitFor();
    expect(await page.getByRole("heading", { level: 1, name: "Reader foundation", exact: true }).innerText()).toBe("Reader foundation");
    await capture(page, "overview-closed-and-footer");
    await disclosures.filter({ hasText: /^Progress$/ }).click();
    await overview.getByRole("region", { name: "Authored progress", exact: true }).getByText("1 active", { exact: false }).waitFor();
    expect(await overview.getByRole("region", { name: "Read-only observations", exact: true }).isVisible()).toBe(true);
    await disclosures.filter({ hasText: /^Changed since your last visit$/ }).focus();
    await page.keyboard.press("Enter");
    await overview.getByText("First visit in this browser", { exact: false }).waitFor();
    await disclosures.filter({ hasText: /^All Stages$/ }).click();
    const stageList = overview.getByRole("list", { name: "Stages", exact: true });
    expect(await stageList.getByRole("link", { name: "Implement", exact: true }).getAttribute("href")).toBe(`#${opened.stage}`);
    await disclosures.filter({ hasText: /^Topics$/ }).click();
    const topic = overview.getByRole("link", { name: "Compact spacing", exact: true });
    expect(await topic.getAttribute("href")).toBe(`#${submitted.refs.spacing}`);
    await capture(page, "overview-opened-disclosures");
    await topic.click();
    await page.locator(`#${submitted.refs.spacing}`).waitFor();
    const authored = cli(["show"]);
    expect(authored.revision).toBe(submitted.revision);
    expect(authored.next).toEqual([submitted.refs.choice]);
    expect(authored.progress.complete).toBe(false);
    await page.goto(`${opened.live.url}#${submitted.refs.choice}`);
    await page.getByRole("img", { name: "Read then choose" }).locator("svg").waitFor();
    const drawing = await page.getByRole("img", { name: "Read then choose" }).locator("svg").elementHandle();
    const colors: Record<string, string> = {};
    for (const [label, expected] of [["Light", "#eff1f5"], ["Dark", "#1e1e2e"]]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      expect(await bodyColor(page)).toBe(expected);
      expect(await page.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed")).toBe("true");
      await page.mouse.move(0, 0);
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map((animation) => animation.finished)); });
      expect(await colorOf(page, ".theme button:first-child", "color")).toBe(label === "Light" ? "#5c5f77" : "#bac2de");
      colors[label!] = await drawing!.evaluate((el) => getComputedStyle(el.querySelector("text")!).fill);
      await capture(page, `${label!.toLowerCase()}-stage`);
      await page.getByRole("navigation", { name: "Flow navigation", exact: true }).locator('a[href="#overview"]').click();
      await page.locator("#observations").waitFor();
      expect(await page.locator("#progress").innerText()).toContain("1 active");
      await capture(page, `${label!.toLowerCase()}-overview`);
      await page.getByRole("button", { name: "Stages", exact: true }).click();
      await page.getByRole("tabpanel", { name: "Stages", exact: true }).getByRole("link", { name: "Implement", exact: true }).click();
      await page.getByRole("img", { name: "Read then choose" }).waitFor();
    }
    expect(colors.Light).not.toBe(colors.Dark);
    expect(await drawing!.evaluate((el) => el.isConnected)).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Dark", exact: true }).waitFor();
    expect(await bodyColor(page)).toBe("#1e1e2e");
    await page.getByRole("button", { name: "System", exact: true }).click();
    expect(await bodyColor(page)).toBe("#eff1f5");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => getComputedStyle(document.documentElement).colorScheme === "dark");
    expect(await bodyColor(page)).toBe("#1e1e2e");
    for (const width of [320, 360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.keyboard.press("n");
      expect(await page.evaluate(() => location.hash)).toBe(`#${submitted.refs.choice}`);
      await capture(page, `dark-${width}`);
    }
    expect(await page.evaluate(() => (window as any).policyViolations)).toEqual([]);
    expect(errors).toEqual([]);
    expect(outside).toEqual([]);
    const tokens = await page.locator("html").evaluate((el) => {
      const style = getComputedStyle(el);
      return Object.fromEntries(["--ui-bg", "--ui-text", "--ui-primary"].map((key) => [key, style.getPropertyValue(key).trim()]));
    });
    if (proof) writeFileSync(join(proof, "runtime.json"), JSON.stringify({ policy, outside, errors, tokens, colors }, null, 2));
    for (const token of Object.values(tokens)) expect(token).not.toBe("");
  } finally { await context.close(); }
}, 120_000);

test("Flow lifecycle notices remain outside the identity-only masthead", async () => {
  const opened = cli(["open", "--skill", "explain", "--title", "Lifecycle notices"]);
  cli(["submit"], [{ kind: "stage", state: "finished" }]);
  const closed = cli(["close", "--flow", opened.flow]);
  const page = await browser.newPage();
  try {
    await page.goto(closed.live.url);
    const footer = page.getByRole("contentinfo");
    await footer.getByText(/^Closed\b/).waitFor();
    expect(await page.locator(".masthead").innerText()).toBe("Lifecycle notices");
    const reopened = cli(["reopen", "--flow", opened.flow, "--skill", "explain"]);
    await footer.getByText(/^Reopened\b/).waitFor();
    expect(await footer.getByText(`Revision ${reopened.revision}`, { exact: true }).isVisible()).toBe(true);
    expect(await page.locator(".masthead").innerText()).toBe("Lifecycle notices");
  } finally {
    await page.close();
  }
}, 30_000);
