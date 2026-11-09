import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./support/fixture.ts";
import { storedFolder } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-artifacts-")));
const homes: string[] = [];
function run(home: string, args: string[], input?: object) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "artifacts"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);
const ok = (r: ReturnType<typeof run>) => {
  expect(r.stderr).toBe(""); expect(r.code).toBe(0); return JSON.parse(r.stdout);
};
const submit = (home: string, ...items: object[]) => run(home, ["submit"], { version: 1, items });
function world() {
  const home = join(root, `home-${homes.length}`); mkdirSync(home); homes.push(home);
  return home;
}
afterAll(() => {
  for (const home of homes) run(home, ["host", "stop"]);
  rmSync(root, { recursive: true, force: true });
});
const artifact = (extra: object) => ({ kind: "attachment", ref: "app", type: "artifact", caption: "Checkout prototype", origin: "fixture", launch: "bun app.ts", revision: "fixture-1", ...extra });
const prototype = { kind: "result", ref: "prototype", shape: "prototype", title: "Checkout", artifact: "app" };
/** The host's reader interface: the Flow content with the host's artifact availability. */
const contentOf = async (url: string) => (await (await fetch(new URL("content", url))).json()) as any;

test("an HTML bundle is captured once and runs only on an isolated read-only viewer origin", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "prototype", "--title", "Artifact isolation"]));
  writeFileSync(join(root, "checkout.html"), '<!doctype html><button>Buy</button><script src="app.js"></script>');
  writeFileSync(join(root, "app.js"), 'document.querySelector("button").onclick = e => e.target.textContent = "Bought";');
  const sent = ok(submit(home, artifact({ runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "checkout.html" }, { path: "app.js", source: "app.js" }] } }), prototype));
  const viewer: string = (await contentOf(opened.live.url)).runtimes[sent.refs.app].url;
  expect(viewer).toBeDefined();
  expect(new URL(viewer).origin).not.toBe(new URL(opened.live.url).origin);
  const entry = await fetch(viewer);
  expect(entry.status).toBe(200);
  expect(await entry.text()).toBe(readFileSync(join(root, "checkout.html"), "utf8"));
  expect(await (await fetch(new URL("app.js", viewer))).text()).toBe(readFileSync(join(root, "app.js"), "utf8"));
  writeFileSync(join(root, "app.js"), "throw new Error('changed source');");
  expect(await (await fetch(new URL("app.js", viewer))).text()).not.toContain("changed source");
  for (const path of ["unregistered.js", "../data/state.json", "/.host/hello", "/author", "/merge", "/_flow-reader/missing.js"]) {
    expect((await fetch(new URL(path, viewer))).status).toBeGreaterThanOrEqual(400);
  }
  expect((await fetch(viewer, { method: "POST", body: "{}" })).status).toBe(405);
  expect((await fetch(opened.live.url, { headers: { Origin: new URL(viewer).origin } })).status).toBe(403);
  expect((await fetch(new URL("content", opened.live.url), { headers: { Origin: new URL(viewer).origin } })).status).toBe(403);
  expect(new URL(viewer).pathname).not.toContain(new URL(opened.live.url).pathname.split("/").filter(Boolean).at(-1)!);
  expect((await fetch(new URL(".host/stop", new URL(viewer).origin), { method: "POST" })).status).not.toBe(200);
  expect(await (await fetch(opened.live.url)).text()).not.toContain(new URL(viewer).origin);
  const stored = ok(run(home, ["show"])).attachments[0].bundle.files.find((f: any) => f.path === "app.js").file;
  const captured = join(storedFolder(home, sent.flow), "assets", stored);
  unlinkSync(captured);
  symlinkSync("/etc/hosts", captured);
  expect((await fetch(new URL("app.js", viewer))).status).toBe(404);
  ok(run(home, ["host", "stop"]));
});

test("a local app opens its real route only while available; missing backends and terminal artifacts keep their launch steps", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "prototype", "--title", "Runtime availability"]));
  const app = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    return new URL(req.url).pathname === "/checkout" ? new Response("<!doctype html><button>Pay</button>", { headers: { "Content-Type": "text/html" } }) : new Response("not found", { status: 404 });
  } });
  try {
    const url = `http://127.0.0.1:${app.port}/checkout`;
    const sent = ok(submit(home, artifact({ runtime: "local-app", url }), prototype));
    expect((await contentOf(opened.live.url)).runtimes[sent.refs.app]).toEqual({ url });
    app.stop(true);
    const missing = (await contentOf(opened.live.url)).runtimes[sent.refs.app];
    expect(missing.url).toBeUndefined();
    expect(missing.reason).toContain("not reachable");
    const terminal = ok(submit(home, artifact({ runtime: "terminal", unavailable: "Requires an interactive terminal", launch: "bash wizard.sh" }), prototype));
    const shown = ok(run(home, ["show"]));
    expect(shown.attachments.at(-1).availability).toBe("unavailable");
    expect(shown.attachments.at(-1).launch).toBe("bash wizard.sh");
    const model = await contentOf(opened.live.url);
    expect(model.runtimes[terminal.refs.app]).toBeUndefined();
    const offered = model.attachments.find((a: any) => a.id === terminal.refs.app);
    expect(offered).toMatchObject({ availability: "unavailable", reason: "Requires an interactive terminal", launch: "bash wizard.sh" });
  } finally {
    app.stop(true);
    ok(run(home, ["host", "stop"]));
  }
});

test("unsafe bundles, nonlocal app routes, and non-artifact prototypes are refused without changing the Flow", () => {
  const home = world();
  ok(run(home, ["open", "--skill", "prototype", "--title", "Artifact refusals"]));
  writeFileSync(join(root, "fixture.html"), "<!doctype html><p>Fixture</p>");
  symlinkSync("/etc/hosts", join(root, "escape.html"));
  const before = ok(run(home, ["show"]));
  const files = [{ path: "index.html", source: "fixture.html" }];
  for (const extra of [
    { runtime: "html", bundle: { entry: "../index.html", files } },
    { runtime: "html", bundle: { entry: "index.html", files: [...files, ...files] } },
    { runtime: "html", bundle: { entry: "missing.html", files } },
    { runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "/etc/hosts" }] } },
    { runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "escape.html" }] } },
    { runtime: "local-app", url: "https://example.com/app" },
    { runtime: "local-app", url: "http://127.0.0.1.evil.example:1234/" },
    { runtime: "local-app", url: "http://user:password@127.0.0.1:1234/" },
  ]) {
    expect(submit(home, artifact(extra), prototype).code).toBe(1);
    expect(ok(run(home, ["show"]))).toEqual(before);
  }
  expect(submit(home, { kind: "attachment", ref: "app", type: "file", caption: "Not runnable", origin: "fixture", path: "fixture.html" }, prototype).code).toBe(1);
  expect(ok(run(home, ["show"])).attachments).toHaveLength(0);
  ok(run(home, ["host", "stop"]));
});

test("captured figures and option previews survive source changes and serve only registered image bytes", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "grill-me", "--title", "Visual choice"]));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>';
  writeFileSync(join(root, "choice.svg"), svg);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  writeFileSync(join(root, "choice.png"), png);
  const sent = ok(submit(home,
    { kind: "background", title: "Context", summary: "Compare captured alternatives", sections: [{ heading: "Scope", body: "One checkout." }], sources: ["fixture"], figures: [{ attachment: "diagram" }] },
    { kind: "round", questions: [{ ref: "choose", title: "Which layout?", description: "Compare the diagram and preview.", needs: [{ need: "Locate the checkout boundary.", kind: "context-diagram" }, { need: "See the compact option.", kind: "option-preview" }], figures: [{ attachment: "diagram", kind: "context-diagram" }], options: [{ label: "Compact", does: "Uses less space", gains: ["Space"], costs: ["Density"], preview: { attachment: "pixel", kind: "option-preview" } }] }] },
    { kind: "attachment", ref: "diagram", type: "svg", caption: "Green checkout layout", origin: "Captured fixture", path: "choice.svg" },
    { kind: "attachment", ref: "pixel", type: "image", caption: "Compact checkout preview", origin: "Captured fixture", path: "choice.png" },
  ));
  const snapshot = ok(run(home, ["show"]));
  const q = snapshot.stages[0].questions[0];
  expect(q.figures).toEqual([{ id: `${sent.refs.choose}-figure-1`, attachment: sent.refs.diagram, kind: "context-diagram" }]);
  expect(q.options[0].preview).toEqual({ id: `${sent.refs.choose}-option-1-preview`, attachment: sent.refs.pixel, kind: "option-preview" });
  expect(snapshot.stages[0].background_figures).toEqual([{ id: "background-1-figure-1", attachment: sent.refs.diagram }]);
  writeFileSync(join(root, "choice.svg"), "<svg>changed</svg>");
  const model = await contentOf(opened.live.url);
  const fileOf = (id: string) => model.attachments.find((a: any) => a.id === id);
  const question = model.questions.find((x: any) => x.id === sent.refs.choose);
  expect([question.figures[0].attachment, question.options[0].preview.attachment].map((id: string) => fileOf(id).caption)).toEqual(["Green checkout layout", "Compact checkout preview"]);
  const captured = await fetch(new URL(`assets/${fileOf(sent.refs.diagram).file}`, opened.live.url));
  expect(captured.status).toBe(200);
  expect(captured.headers.get("content-type")).toContain("image/svg+xml");
  expect(await captured.text()).toBe(svg);
  expect(Buffer.from(await (await fetch(new URL(`assets/${fileOf(sent.refs.pixel).file}`, opened.live.url))).arrayBuffer())).toEqual(png);
  expect((await fetch(new URL("assets/unregistered.svg", opened.live.url))).status).toBe(404);
  const before = ok(run(home, ["show"]));
  for (const figure of [{ attachment: "missing" }, { html: "<b>raw</b>" }, { attachment: sent.refs.diagram, css: "body{}" }]) {
    expect(submit(home, { kind: "round", questions: [{ title: "Unsafe?", description: "Must not commit.", needs: [{ need: "Locate the current boundary.", kind: "context-diagram" }], figures: [{ ...figure, kind: "context-diagram" }], options: [{ label: "No", does: "Refuses", gains: ["Safety"], costs: ["None"] }] }] }).code).toBe(1);
    expect(ok(run(home, ["show"])).revision).toBe(before.revision);
  }
  for (const attachment of [
    { kind: "attachment", ref: "invalid", type: "file", caption: "Not a figure", origin: "Fixture", path: "choice.png" },
    { kind: "attachment", ref: "invalid", type: "image", caption: "Unavailable figure", origin: "Fixture", unavailable: "No capture exists" },
  ]) {
    const refused = submit(home, attachment, { kind: "round", questions: [{ title: "Preview?", description: "Needs captured image bytes.", needs: [{ need: "See the proposed option.", kind: "option-preview" }], options: [{ label: "No", does: "Refuses", gains: ["Safety"], costs: ["None"], preview: { attachment: "invalid", kind: "option-preview" } }] }] });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("must be a captured image, SVG, or Mermaid figure");
    expect(ok(run(home, ["show"]))).toEqual(before);
  }
  ok(run(home, ["host", "stop"]));
});

test("a Mermaid diagram source is captured once, satisfies diagram needs, and is served as the stored text", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "grill-me", "--title", "Diagram source"]));
  const source = 'flowchart TD\n  a1["Read the page"]:::actor --> a2["Answer the question"]:::ok\n  class a2 ok\n  click a1 callback\n  click a2 href "https://example.com"\n';
  writeFileSync(join(root, "reading.mmd"), source);
  const diagram = { kind: "attachment", ref: "flow", type: "mermaid", caption: "Reading then answering", origin: "Mermaid source reading.mmd", path: "reading.mmd", focus: ["a2"] };
  const round = (figure: object) => ({ kind: "round", questions: [{ ref: "order", title: "Which order?", description: "Compare the reading order.", needs: [{ need: "Follow today's reading steps.", kind: "context-diagram" }, { need: "Compare where each option answers.", kind: "option-diagram" }], figures: [{ ...figure, kind: "context-diagram" }, { ...figure, kind: "option-diagram" }], options: [{ label: "Read first", does: "Reads before answering", gains: ["Context"], costs: ["Time"] }] }] });
  const sent = ok(submit(home, diagram, round({ attachment: "flow" })));
  const shown = ok(run(home, ["show"]));
  expect(shown.attachments).toEqual([expect.objectContaining({ id: sent.refs.flow, type: "mermaid", availability: "captured", focus: ["a2"], revision: new Bun.CryptoHasher("sha256").update(source).digest("hex") })]);
  expect(shown.stages[0].questions[0].figures.map((f: any) => f.attachment)).toEqual([sent.refs.flow, sent.refs.flow]);
  writeFileSync(join(root, "reading.mmd"), "flowchart TD\n  changed\n");
  const model = await contentOf(opened.live.url);
  const stored = model.attachments.find((a: any) => a.id === sent.refs.flow);
  expect(stored).toMatchObject({ type: "mermaid", caption: "Reading then answering", focus: ["a2"] });
  const served = await fetch(new URL(`assets/${stored.file}`, opened.live.url));
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(await served.text()).toBe(source);

  const before = ok(run(home, ["show"]));
  writeFileSync(join(root, "broken.mmd"), "flowchart TD\n  a1 --> \n  ((\n");
  writeFileSync(join(root, "picture.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  for (const [attachment, refusal] of [
    [{ ...diagram, path: "broken.mmd" }, "is not Mermaid that Pele renders"],
    [{ ...diagram, focus: [] }, "focus must"],
    [{ ...diagram, focus: ["a1", "a2", "a3"] }, "focus must"],
    [{ ...diagram, focus: ['a"]'] }, "focus must"],
    [{ ...diagram, type: "svg", path: "picture.svg" }, "focus is not a field here"],
  ] as const) {
    const refused = submit(home, attachment, round({ attachment: "flow" }));
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(refusal);
    expect(ok(run(home, ["show"]))).toEqual(before);
  }
  ok(run(home, ["host", "stop"]));
});

test.each([
  ["unknown role", "flowchart LR\n A:::green --> B\n", [], "Unknown color role: green"],
  ["unknown role with click", 'flowchart LR\n A:::okk --> B\n click A href "https://example.com"\n', [], "Unknown color role: okk"],
  ["conflicting roles", "flowchart LR\n A:::ok --> B\n class A bad\n", [], "Element A has more than one color role"],
  ["classDef paint", "flowchart LR\n A:::ok --> B\n classDef ok fill:#a6e3a1\n", [], "The Mermaid sets its own color"],
  ["unused classDef paint", "flowchart LR\n A --> B\n classDef unused fill:red\n", [], "The Mermaid sets its own color"],
  ["style paint", "flowchart LR\n A --> B\n style B stroke:#f00\n", [], "The Mermaid sets its own color"],
  ["linkStyle paint", "flowchart LR\n A --> B\n linkStyle 0 stroke:red\n", [], "The Mermaid sets its own color"],
  ["missing focus", "flowchart LR\n A --> B\n", ["Missing"], "Missing focus target: Missing"],
  ["ambiguous focus", "flowchart LR\n A A@--> B\n", ["A"], "Ambiguous focus target: A"],
  ["hidden focus", 'agentflow-beta LR\n flow G[Group]@{ view: collapsed }\n C[Child]\n end\n', ["C"], "No visible geometry"],
] as const)("submit refuses %s with the export's message and commits none of the contribution", (name, source, focus, message) => {
  const home = world();
  ok(run(home, ["open", "--skill", "grill-me", "--title", `Figure refusal: ${name}`]));
  try {
    writeFileSync(join(root, "valid.mmd"), "flowchart LR\n Start:::actor --> Done:::ok\n");
    const attachment = { kind: "attachment", ref: "invalid", type: "mermaid", caption: "Figure validation", origin: "Fixture", path: "refused.mmd", ...(focus.length ? { focus } : {}) };
    const document = (attachments: string[]) => ({ kind: "result", shape: "document", title: "Atomic contribution", sections: [{ heading: "Figures", blocks: attachments.map((figure) => ({ figure })) }] });
    ok(submit(home, { ...attachment, ref: "seed", path: "valid.mmd", focus: ["Done"] }, document(["seed"])));
    const before = ok(run(home, ["show"]));
    const folder = storedFolder(home, before.flow.id);
    const state = readFileSync(join(folder, "data/state.json"), "utf8");
    const assets = readdirSync(join(folder, "assets"), { recursive: true });
    writeFileSync(join(root, "refused.mmd"), source);
    const exported = Bun.spawnSync([
      process.execPath, join(import.meta.dir, "../plugin/skills/vstack-figures/scripts/render.ts"),
      join(root, "refused.mmd"), join(root, "refused.svg"), ...focus.flatMap((id) => ["--focus", id]),
    ], { stdout: "pipe", stderr: "pipe" });
    expect(exported.exitCode).toBe(1);
    expect(exported.stderr.toString()).toContain(message);
    const refused = submit(home,
      document(["valid", "invalid"]),
      { ...attachment, ref: "valid", path: "valid.mmd", focus: ["Done"] },
      attachment,
    );
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toContain(exported.stderr.toString().trim());
    expect(ok(run(home, ["show"]))).toEqual(before);
    expect(readFileSync(join(folder, "data/state.json"), "utf8")).toBe(state);
    expect(readdirSync(join(folder, "assets"), { recursive: true })).toEqual(assets);
  } finally {
    ok(run(home, ["host", "stop"]));
  }
});

test("the reader shell allows only its own scripts and same-origin resources", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "grill-me", "--title", "Shell policy"]));
  const shell = await fetch(opened.live.url);
  const html = await shell.text();
  const policy = Object.fromEntries(shell.headers.get("content-security-policy")!.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  for (const [directive, sources] of Object.entries({ "base-uri": ["'none'"], "form-action": ["'none'"], "frame-ancestors": ["'none'"], "object-src": ["'none'"], "img-src": ["'self'", "data:"], "connect-src": ["'self'"], "font-src": ["'self'"], "media-src": ["'self'"] })) {
    expect(policy[directive]).toEqual(sources);
  }
  expect(policy["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
  expect(policy["script-src"]).toContain("'self'");
  expect(policy["script-src"].filter((s: string) => s.startsWith("'unsafe"))).toEqual([]);
  const inline = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs]) => !/\bsrc=|application\/json/.test(attrs!)).map(([, , body]) => `'sha256-${new Bun.CryptoHasher("sha256").update(body!).digest("base64")}'`);
  expect(inline.length).toBeGreaterThan(0);
  for (const hash of inline) expect(policy["script-src"]).toContain(hash);
  ok(run(home, ["host", "stop"]));
});
