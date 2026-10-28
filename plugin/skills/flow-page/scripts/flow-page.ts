// The Flow page authoring interface. A caller opens or joins a Stage once, then submits typed contributions to it;
// the script assigns ids, numbers, timestamps, labels, and links, commits them, and publishes the static page.
//
//   bun flow-page.ts open --skill <name> (--title <text> [--slug <slug>] | --flow <flow> [--parent <stage>]) [--ticket <id>]
//   bun flow-page.ts bind --flow <flow> --stage <id>
//   bun flow-page.ts submit [--flow <flow> --stage <id>] [<contribution.json> | -]
//   bun flow-page.ts alias [--flow <flow>] <kind>:<value>...
//   bun flow-page.ts close [--flow <flow>]
//   bun flow-page.ts reopen --skill <name> [--flow <flow>] [--parent <stage>] [--ticket <id>]
//   bun flow-page.ts find <kind>:<value>
//   bun flow-page.ts move [--flow <flow>] --to <folder-key>
//   bun flow-page.ts show [--flow <flow>]
//   bun flow-page.ts render --flow <flow>
//
// <flow> is a Flow id or a qualified alias such as spec:267. Every command also takes --session <id> (default:
// $PI_SESSION_ID), --agent <id> (default: main), and --home <dir> (default: the user's home). A binding belongs to one
// session and agent in one project; without one, submit needs --flow and --stage. Stdout is one JSON receipt. Exit 1
// is a refusal, printed to stderr, after which nothing was written; exit 2 is a usage error. A receipt whose
// `presentation` is stale means the content is committed but the page still shows an older revision.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { canonicalFile, capture, type Root } from "./assets.ts";
import { addAliases, aliasesOf, closeFlow, contribute, newFlow, nowIso, openStage, parseAlias, Refusal, reopenFlow, SLUG, slugOf, snapshot, stageOf, view, type Io, type State } from "./model.ts";
import { RENDERER, render } from "./render.ts";
import { assetsDir, createFlowFolder, flowFolders, flowsDir, folderOfId, pagePath, pageRevision, readBinding, readState, registerFolder, registeredFolder, statePath, withLock, writeAtomic, writeBinding } from "./store.ts";
import { connect, flowUrl, hostCommand } from "./live.ts";

const COMMANDS = ["open", "bind", "submit", "alias", "close", "reopen", "find", "move", "show", "render", "host"];

function usage(message: string): never {
  process.stderr.write(`flow-page.ts: ${message}
usage: bun flow-page.ts open --skill <name> (--title <text> [--slug <slug>] | --flow <flow> [--parent <stage>]) [--ticket <id>]
       bun flow-page.ts bind --flow <flow> --stage <id>
       bun flow-page.ts submit [--flow <flow> --stage <id>] [<contribution.json> | -]
       bun flow-page.ts alias [--flow <flow>] <kind>:<value>...
       bun flow-page.ts close [--flow <flow>]
       bun flow-page.ts reopen --skill <name> [--flow <flow>] [--parent <stage>] [--ticket <id>]
       bun flow-page.ts find <kind>:<value>
       bun flow-page.ts move [--flow <flow>] --to <folder-key>
       bun flow-page.ts show [--flow <flow>]
       bun flow-page.ts render --flow <flow>
       bun flow-page.ts host status|stop
<flow> is a Flow id or a qualified alias such as spec:267
every command: [--session <id>] [--agent <id>] [--home <dir>]
`);
  process.exit(2);
}
const refuse = (message: string): never => {
  throw new Refusal(message);
};

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: Object.fromEntries(["skill", "title", "slug", "flow", "stage", "parent", "ticket", "to", "session", "agent", "home"].map((k) => [k, { type: "string" as const }])),
  });
} catch (e) {
  usage((e as Error).message);
}
const { values: opt, positionals } = parsed;
const [command, ...rest] = positionals;
if (!COMMANDS.includes(command ?? "")) usage(`give a command: ${COMMANDS.join(", ")}`);
const allowed: Record<string, string[]> = {
  open: ["skill", "title", "slug", "flow", "parent", "ticket"], bind: ["flow", "stage"], submit: ["flow", "stage"], alias: ["flow"], close: ["flow"], reopen: ["skill", "flow", "parent", "ticket"],
  find: [], move: ["flow", "to"], show: ["flow"], render: ["flow"], host: [],
};
for (const k of Object.keys(opt)) if (!["session", "agent", "home", ...allowed[command]].includes(k)) usage(`${command} takes no --${k}`);
const positional: Record<string, [number, number, string]> = {
  submit: [0, 1, "takes no more than one contribution file"], alias: [1, Infinity, "needs one or more <kind>:<value> aliases"], find: [1, 1, "needs exactly one <kind>:<value> alias or Flow id"],
  host: [1, 1, "needs status or stop"],
};
const [least, most, says] = positional[command] ?? [0, 0, "takes no positional arguments"];
if (rest.length < least || rest.length > most) usage(`${command} ${says}`);

const home = resolve((opt.home as string | undefined) ?? homedir());
const dir = flowsDir(home, process.cwd());
const session = (opt.session as string | undefined) ?? process.env.PI_SESSION_ID ?? undefined;
const agent = (opt.agent as string | undefined) ?? "main";
const time = nowIso();

const errno = (e: unknown) => (e as NodeJS.ErrnoException).code;

/** The Flow a key names in this project: an id through the id registry, or a qualified alias that exactly one Flow has. */
function locate(key: string): { id: string; folder: string } {
  if (key.includes(":")) {
    const alias = parseAlias(key);
    const hits = flowFolders(dir).flatMap((name) => {
      const s = readState(join(dir, name));
      return s && aliasesOf(s).includes(alias) ? [{ id: s.flow.id, folder: join(dir, name) }] : [];
    });
    if (hits.length === 0) refuse(`no Flow in this project has ${alias}`);
    if (hits.length > 1) refuse(`${alias} names ${hits.length} Flows in this project: ${hits.map((h) => h.id).join(", ")}; name one by its id`);
    return hits[0];
  }
  if (!SLUG.test(key)) refuse(`--flow must be a Flow id of lowercase letters, digits, and hyphens, or a qualified alias such as spec:267, got ${JSON.stringify(key)}`);
  const folder = folderOfId(dir, key);
  if (folder) return { id: key, folder };
  // The registry keeps every id ever given, so an id with no Flow left lost its content; it is never started again empty.
  return refuse(registeredFolder(dir, key) !== undefined
    ? `Flow ${key} has no content any more: it expired after it was closed, or its folder was deleted. Nothing can be read or added under this id; open a new Flow`
    : `this project has no Flow ${key}`);
}

/** Runs `fn` on the Flow's latest state under its lock. A Flow that moved while this waited is found again by id. */
async function locked<T>(key: string, fn: (folder: string, s: State) => T): Promise<T> {
  let at = locate(key);
  for (let tries = 0; tries < 5; tries++) {
    let done: { value: T } | undefined;
    try {
      done = await withLock(at.folder, () => {
        const s = readState(at.folder);
        return s?.flow.id === at.id ? { value: fn(at.folder, s) } : undefined;
      });
    } catch (e) {
      if (errno(e) !== "ENOENT" || existsSync(at.folder)) throw e;
    }
    if (done) return done.value;
    at = locate(at.id);
  }
  return refuse(`Flow ${at.id} kept moving while this command waited; run it again`);
}

type Presentation = { state: "current" | "stale"; revision?: number; error?: string };

/** What the published page shows: current when it renders the committed revision, else stale with the revision it shows. */
function presentationOf(folder: string, s: State): Presentation {
  const shown = pageRevision(folder);
  return shown === s.revision ? { state: "current", revision: shown } : { state: "stale", ...(shown !== undefined ? { revision: shown } : {}) };
}

/** Replaces the page with one rendered from `s`. A failure keeps the last good page and reports it stale. */
function project(folder: string, s: State): Presentation {
  try {
    writeAtomic(pagePath(folder), render(view(s)));
    return { state: "current", revision: s.revision };
  } catch (e) {
    const error = (e as Error).message;
    const p = { ...presentationOf(folder, s), error };
    process.stderr.write(`flow-page.ts: revision ${s.revision} is committed, but the page could not be published (${error}); it still shows ${p.revision === undefined ? "no revision" : `revision ${p.revision}`}. Run render to publish it again; do not resubmit.\n`);
    return p;
  }
}

/** The directories a contribution may read files from: the project (its git work tree, else the working directory)
 *  and the project's Scratch dir, each resolved through symlinks. */
function roots(): Root[] {
  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: process.cwd(), stdout: "pipe", stderr: "ignore" });
  const project = top.exitCode === 0 ? top.stdout.toString().trim() : process.cwd();
  const out: Root[] = [{ name: "project", dir: realpathSync(project) }];
  if (existsSync(dirname(dir))) out.push({ name: "scratch", dir: realpathSync(dirname(dir)) });
  return out;
}

/** Captured bytes waiting for publish, by their stored file name. */
const captured = new Map<string, Uint8Array>();
const io: Io = {
  capture(path, type, where) {
    const { bytes, ...c } = capture(path, type, roots(), process.cwd(), where);
    captured.set(c.file, bytes);
    return c;
  },
  canonical(path, where, root) {
    const rs = roots();
    const base = root === undefined ? process.cwd() : (rs.find((r) => r.name === root)?.dir ?? refuse(`${where}: this project has no ${root} directory to find ${path} in`));
    return canonicalFile(path, rs, base, where);
  },
};

/** Stores captured assets, then commits `s` in one atomic replace, then publishes its page. Assets land first, so
 *  committed state never names a missing file. An asset's directory is its sha256, so one that exists is already right. */
function publish(folder: string, s: State): Presentation {
  for (const [file, bytes] of captured) {
    const path = join(assetsDir(folder), file);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeAtomic(path, bytes);
  }
  writeAtomic(statePath(folder), `${JSON.stringify(s)}\n`);
  return project(folder, s);
}

function binding() {
  if (!session) refuse("no session to look up a binding for: run from an omp session (which sets PI_SESSION_ID) or give --session, or name the Flow");
  return readBinding(dir, session!, agent) ?? refuse(`session ${session} (agent ${agent}) is bound to no Flow in this project: run open or bind first, or name the Flow`);
}

/** The target named by --flow and --stage, else this session's binding. Nothing falls back to another session's work. */
function target(): { flow: string; stage: string } {
  if (opt.flow !== undefined || opt.stage !== undefined) {
    if (opt.flow === undefined || opt.stage === undefined) usage("name both --flow and --stage, or neither to use this session's binding");
    return { flow: opt.flow as string, stage: opt.stage as string };
  }
  return binding();
}
const flowKey = (): string => (opt.flow as string | undefined) ?? binding().flow;

const bind = (flow: string, stage: string) => {
  if (!session) return false;
  writeBinding(dir, { flow, stage, session, agent, bound: time });
  return true;
};

async function main(): Promise<object> {
  switch (command) {
    case "host": {
      if (rest[0] !== "status" && rest[0] !== "stop") usage("host needs status or stop");
      return { host: await hostCommand(home, rest[0] as "status" | "stop") };
    }
    case "open": {
      if (opt.skill === undefined) usage("open needs --skill, the skill whose run this Stage is");
      if (opt.flow !== undefined) {
        if (opt.title !== undefined || opt.slug !== undefined) usage("--title and --slug start a new Flow; leave them out with --flow");
        return locked(opt.flow as string, (folder, s) => {
          const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
          const presentation = publish(folder, s);
          return { flow: s.flow.id, stage: stage.id, revision: s.revision, page: pagePath(folder), presentation, bound: bind(s.flow.id, stage.id) };
        });
      }
      if (opt.title === undefined) usage("open needs --title for a new Flow, or --flow to add a Stage to an existing one");
      if (opt.parent !== undefined) usage("--parent names a Stage of an existing Flow; give it with --flow");
      const slug = (opt.slug as string | undefined) ?? slugOf(opt.title as string);
      if (!SLUG.test(slug)) refuse(`--slug must be lowercase words joined by hyphens, got ${JSON.stringify(slug)}`);
      // Check the input before a folder exists, so a refusal leaves nothing behind.
      const probe = newFlow("probe", slug, opt.title as string, time);
      openStage(probe, opt.skill as string, opt.ticket as string | undefined, time);
      const { id, folder } = createFlowFolder(dir, slug);
      return withLock(folder, () => {
        const s = newFlow(id, slug, opt.title as string, time);
        const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time);
        const presentation = publish(folder, s);
        return { flow: id, stage: stage.id, revision: s.revision, page: pagePath(folder), presentation, bound: bind(id, stage.id) };
      });
    }
    case "bind": {
      if (opt.flow === undefined || opt.stage === undefined) usage("bind needs --flow and --stage");
      if (!session) refuse("bind needs a session: run from an omp session (which sets PI_SESSION_ID) or give --session");
      const { folder } = locate(opt.flow as string);
      const s = readState(folder)!;
      const stage = stageOf(s, opt.stage as string, "bind");
      if (stage.state === "finished") refuse(`Stage ${stage.id} is finished; open a new Stage to continue the Flow`);
      bind(s.flow.id, stage.id);
      return { flow: s.flow.id, stage: stage.id, revision: s.revision, page: pagePath(folder), bound: true };
    }
    case "submit": {
      const t = target();
      let input: unknown;
      const raw = rest[0] === undefined || rest[0] === "-" ? await Bun.stdin.text() : existsSync(rest[0]) ? readFileSync(rest[0], "utf8") : usage(`${rest[0]} does not exist`);
      try {
        input = JSON.parse(raw);
      } catch (e) {
        refuse(`the contribution is not valid JSON (${(e as Error).message})`);
      }
      return locked(t.flow, (folder, s) => {
        const { revision, repeated, ...receipt } = contribute(s, t.stage, input, time, io);
        const presentation = repeated ? presentationOf(folder, s) : publish(folder, s);
        return { flow: s.flow.id, stage: t.stage, revision, page: pagePath(folder), presentation, ...(repeated ? { repeated } : {}), ...receipt };
      });
    }
    case "alias": {
      const aliases = rest.map(parseAlias);
      return locked(flowKey(), (folder, s) => {
        const added = addAliases(s, aliases);
        const presentation = added.length ? publish(folder, s) : presentationOf(folder, s);
        return { flow: s.flow.id, revision: s.revision, added, aliases: aliasesOf(s), page: pagePath(folder), presentation };
      });
    }
    case "close": {
      return locked(flowKey(), (folder, s) => {
        closeFlow(s, time);
        return { flow: s.flow.id, revision: s.revision, closed: time, page: pagePath(folder), presentation: publish(folder, s) };
      });
    }
    case "reopen": {
      if (opt.skill === undefined) usage("reopen needs --skill, the skill whose run the new Stage is");
      return locked(flowKey(), (folder, s) => {
        const stage = reopenFlow(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
        const presentation = publish(folder, s);
        return { flow: s.flow.id, stage: stage.id, revision: s.revision, page: pagePath(folder), presentation, bound: bind(s.flow.id, stage.id) };
      });
    }
    case "find": {
      const { folder } = locate(rest[0]);
      const s = readState(folder)!;
      return { flow: s.flow.id, revision: s.revision, aliases: aliasesOf(s), page: pagePath(folder), presentation: presentationOf(folder, s) };
    }
    case "move": {
      const to = opt.to as string | undefined;
      if (to === undefined) usage("move needs --to, the new folder key");
      if (!SLUG.test(to!)) refuse(`--to must be lowercase words joined by hyphens, got ${JSON.stringify(to)}`);
      return locked(flowKey(), (folder, s) => {
        const from = basename(folder);
        const dest = join(dir, to!);
        if (dest === folder) refuse(`Flow ${s.flow.id} is already in ${to}`);
        // Reserve the destination first: mkdir is exclusive, and renaming onto the empty folder then replaces it.
        try {
          mkdirSync(dest);
        } catch (e) {
          refuse(errno(e) === "EEXIST" ? `${to} is taken in this project; choose another folder key` : `could not move Flow ${s.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
        }
        try {
          renameSync(folder, dest);
        } catch (e) {
          rmdirSync(dest);
          refuse(`could not move Flow ${s.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
        }
        try {
          registerFolder(dir, s.flow.id, to!);
          if (addAliases(s, [`folder:${to}`]).length) writeAtomic(statePath(dest), `${JSON.stringify(s)}\n`);
        } catch (e) {
          renameSync(dest, folder);
          registerFolder(dir, s.flow.id, from);
          refuse(`could not move Flow ${s.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
        }
        return { flow: s.flow.id, revision: s.revision, moved_from: from, page: pagePath(dest), presentation: project(dest, s) };
      });
    }
    case "show": {
      const { folder } = locate(flowKey());
      const s = readState(folder)!;
      return { ...snapshot(view(s), pagePath(folder), RENDERER), aliases: aliasesOf(s), presentation: presentationOf(folder, s) };
    }
    default: {
      if (opt.flow === undefined) usage("render needs --flow");
      return locked(opt.flow as string, (folder, s) => ({ flow: s.flow.id, revision: s.revision, page: pagePath(folder), presentation: project(folder, s) }));
    }
  }
}

const live = command === "host" ? undefined : await connect(home);
try {
  const result = await main() as { flow?: string | { id: string }; page?: string };
  if (live && result.page && result.flow) {
    const id = typeof result.flow === "string" ? result.flow : result.flow.id;
    const presentation = live.state === "serving"
      ? { state: "serving", url: flowUrl(live.port, live.secret.read, basename(dirname(dir)), id) }
      : live;
    Object.assign(result, { live: presentation });
    if (live.state === "unavailable") process.stderr.write(`flow-page.ts: live serving unavailable (${live.error}). Use the static page: ${result.page}\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  process.stderr.write(`flow-page.ts: ${e.message}\nNothing was written.\n`);
  process.exitCode = 1;
} finally {
  if (live?.state === "serving") live.release();
}
