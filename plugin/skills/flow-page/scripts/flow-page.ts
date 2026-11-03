// The Flow page authoring interface. A caller opens or joins a Stage once, then submits typed contributions to it;
// the script assigns ids, numbers, timestamps, labels, and links and commits them. The Local Flow host presents them.
//
// <flow> is a Flow id or a qualified alias such as spec:267. Every command also takes --session <id> (default:
// $PI_SESSION_ID), --agent <id> (default: main), and --home <dir> (default: the user's home). A binding belongs to one
// session and agent in one project. Without one, submit needs --flow and --stage. Stdout is one JSON receipt.
// Exit 1 refuses without committing Flow content. Host lifecycle metadata may be written. Exit 2 is a usage error.
// A receipt's `live` says whether the host presents the Flow; committed content never depends on it.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { canonicalFile, capture, type Root } from "./assets.ts";
import { addAliases, aliasesOf, closeFlow, contribute, newFlow, nowIso, openStage, parseAlias, reopenFlow, SLUG, slugOf, snapshot, stageOf, view, type Io, type State } from "./model.ts";
import { assetsDir, createFlowFolder, flowFolders, flowsDir, folderOfId, migrationIdentity, readBinding, readState, registerFolder, registerMigration, registeredFolder, statePath, withLock, writeAtomic, writeBinding } from "./store.ts";
import { connect, flowUrl, hostCommand } from "./live.ts";
import { captureHistoricalImages, historicalFlows, migrateHistorical, parseHistorical } from "./migrate.ts";
import { Refusal } from "./fields.ts";
import { registerObservation } from "./observations.ts";

const COMMANDS = ["open", "bind", "submit", "alias", "close", "reopen", "find", "move", "show", "bound", "host", "migrate"];

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
       bun flow-page.ts bound
       bun flow-page.ts host status|stop
       bun flow-page.ts migrate <grilling-folder>
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
  find: [], move: ["flow", "to"], show: ["flow"], bound: [], host: [], migrate: [],
};
for (const k of Object.keys(opt)) if (!["session", "agent", "home", ...allowed[command]].includes(k)) usage(`${command} takes no --${k}`);
const positional: Record<string, [number, number, string]> = {
  submit: [0, 1, "takes no more than one contribution file"], alias: [1, Infinity, "needs one or more <kind>:<value> aliases"], find: [1, 1, "needs exactly one <kind>:<value> alias or Flow id"],
  host: [1, 1, "needs status or stop"],
  migrate: [1, 1, "needs exactly one Grilling page folder"],
};
const [least, most, says] = positional[command] ?? [0, 0, "takes no positional arguments"];
if (rest.length < least || rest.length > most) usage(`${command} ${says}`);

const home = resolve((opt.home as string | undefined) ?? homedir());
const dir = flowsDir(home, process.cwd());
const session = (opt.session as string | undefined) ?? process.env.PI_SESSION_ID ?? undefined;
const agent = (opt.agent as string | undefined) ?? "main";
const time = nowIso();

const errno = (e: unknown) => (e as NodeJS.ErrnoException).code;

function aliasMatches(key: string) {
  const alias = parseAlias(key);
  const matches = (value: string) => /^(spec|ticket):/.test(alias) ? value.toLowerCase() === alias.toLowerCase() : value === alias;
  const current = flowFolders(dir).flatMap((name) => {
    const s = readState(join(dir, name));
    return s && aliasesOf(s).some(matches) ? [{ id: s.flow.id, folder: join(dir, name) }] : [];
  });
  const historical = historicalFlows(dirname(dir)).filter((h) => {
    if (!h.aliases.some(matches)) return false;
    const migrated = migrationIdentity(dir, h.source);
    if (migrated) {
      if (!folderOfId(dir, migrated.flow) && !current.length) refuse(`${alias} belonged to Flow ${migrated.flow}, whose content expired or was deleted. Its historical source cannot recreate that identity. Open a new Flow explicitly`);
      return false;
    }
    return !flowFolders(dir).some((name) => readState(join(dir, name))?.migrated?.from === h.source);
  });
  if (current.length + historical.length > 1) refuse(`${alias} names multiple Flows in this project: ${[...current.map((h) => h.id), ...historical.map((h) => h.source)].join(", ")}. Name a Flow by id or explicitly migrate one historical source`);
  return { alias, current, historical };
}

function locate(key: string): { id: string; folder: string } {
  if (key.includes(":")) {
    const { alias, current, historical } = aliasMatches(key);
    if (historical.length) refuse(`${alias} has historical structured Flow content at ${historical[0].source}. Continue it with migrate ${JSON.stringify(historical[0].source)} before opening a Stage`);
    if (!current.length) refuse(`no Flow in this project has ${alias}`);
    return current[0];
  }
  if (!SLUG.test(key)) refuse(`--flow must be a Flow id of lowercase letters, digits, and hyphens, or a qualified alias such as spec:267, got ${JSON.stringify(key)}`);
  const folder = folderOfId(dir, key);
  if (folder) return { id: key, folder };
  return refuse(registeredFolder(dir, key) !== undefined
    ? `Flow ${key} has no content any more: it expired after it was closed, or its folder was deleted. Nothing can be read or added under this id; open a new Flow`
    : `this project has no Flow ${key}`);
}

function observeAuthoring(folder: string, s: State, stage?: string): void {
  const bound = session ? readBinding(dir, session, agent) : undefined;
  try {
    registerObservation(folder, realpathSync(process.cwd()), s, stage ?? (bound?.flow === s.flow.id ? bound.stage : undefined));
  } catch {
    process.stderr.write("flow-page.ts: the command succeeded, but its checkout could not be registered for read-only observation. Do not resubmit.\n");
  }
}

async function locked<T>(key: string, fn: (folder: string, s: State) => T): Promise<T> {
  let at = locate(key);
  for (let tries = 0; tries < 5; tries++) {
    let done: { value: T } | undefined;
    try {
      done = await withLock(at.folder, () => {
        const s = readState(at.folder);
        if (s?.flow.id !== at.id) return undefined;
        const value = fn(at.folder, s);
        observeAuthoring(folderOfId(dir, at.id)!, s, (value as { stage?: string }).stage);
        return { value };
      });
    } catch (e) {
      if (errno(e) !== "ENOENT" || existsSync(at.folder)) throw e;
    }
    if (done) return done.value;
    at = locate(at.id);
  }
  return refuse(`Flow ${at.id} kept moving while this command waited; run it again`);
}

function roots(): Root[] {
  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: process.cwd(), stdout: "pipe", stderr: "ignore" });
  const project = top.exitCode === 0 ? top.stdout.toString().trim() : process.cwd();
  const out: Root[] = [{ name: "project", dir: realpathSync(project) }];
  if (existsSync(dirname(dir))) out.push({ name: "scratch", dir: realpathSync(dirname(dir)) });
  return out;
}

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

function publish(folder: string, s: State): void {
  for (const [file, bytes] of captured) {
    const path = join(assetsDir(folder), file);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeAtomic(path, bytes);
  }
  writeAtomic(statePath(folder), `${JSON.stringify(s)}\n`);
}

function binding() {
  if (!session) refuse("no session to look up a binding for: run from an omp session (which sets PI_SESSION_ID) or give --session, or name the Flow");
  return readBinding(dir, session!, agent) ?? refuse(`session ${session} (agent ${agent}) is bound to no Flow in this project: run open or bind first, or name the Flow`);
}

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
    case "migrate": {
      let from: string;
      try { from = realpathSync(rest[0]); } catch { return refuse(`migrate: ${rest[0]} does not exist`); }
      if (!existsSync(dirname(dir))) refuse("migrate: this project has no historical Scratch folder");
      const scratch = realpathSync(dirname(dir));
      const rel = relative(scratch, from);
      if (rel === ".." || rel.startsWith(`..${sep}`) || !rel || from === dir || from.startsWith(dir + sep)) refuse("migrate: the source must be a historical folder in this project's Scratch dir, outside its Flow store");
      const path = join(from, "page.jsonl");
      if (!existsSync(path)) refuse("migrate: this page has no structured page.jsonl state; its handwritten page stays untouched");
      const historical = parseHistorical(readFileSync(path, "utf8"));
      const migrationIo: Io = { ...io, capture: (path, type, where) => io.capture(resolve(from, path), type, where) };
      const migrated = migrateHistorical(historical, "probe", from, time, migrationIo);
      mkdirSync(dir, { recursive: true });
      return withLock(dir, () => {
        const identity = migrationIdentity(dir, from);
        if (identity && !folderOfId(dir, identity.flow)) refuse(`migrate: Flow ${identity.flow} expired or was deleted. The retained historical source cannot recreate that identity. Open a new Flow explicitly`);
        for (const name of flowFolders(dir)) {
          const folder = join(dir, name);
          const s = readState(folder);
          if (s?.migrated?.from !== from) continue;
          return locked(s.flow.id, (folder, current) => {
            if (current.migrated!.sha256 !== historical.sha256) refuse(`migrate: ${from} changed after migration to ${current.flow.id}; continue authoring that Flow instead of overwriting it`);
            const repaired = captureHistoricalImages(current, from, time, migrationIo);
            if (repaired) {
              current.revision++;
              publish(folder, current);
            }
            registerMigration(dir, { source: from, flow: current.flow.id, sha256: historical.sha256 });
            return { flow: current.flow.id, revision: current.revision, ...(repaired ? { repaired: true } : { repeated: true }) };
          });
        }
        const { id, folder } = createFlowFolder(dir, historical.slug);
        migrated.flow.id = id;
        migrated.aliases[0] = `folder:${id}`;
        publish(folder, migrated);
        registerMigration(dir, { source: from, flow: id, sha256: historical.sha256 });
        observeAuthoring(folder, migrated);
        return { flow: id, revision: migrated.revision };
      });
    }
    case "open": {
      if (opt.skill === undefined) usage("open needs --skill, the skill whose run this Stage is");
      if (opt.flow !== undefined) {
        if (opt.title !== undefined || opt.slug !== undefined) usage("--title and --slug start a new Flow; leave them out with --flow");
        return locked(opt.flow as string, (folder, s) => {
          const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
          publish(folder, s);
          return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: bind(s.flow.id, stage.id) };
        });
      }
      if (opt.title === undefined) usage("open needs --title for a new Flow, or --flow to add a Stage to an existing one");
      if (opt.parent !== undefined) usage("--parent names a Stage of an existing Flow; give it with --flow");
      const slug = (opt.slug as string | undefined) ?? slugOf(opt.title as string);
      if (!SLUG.test(slug)) refuse(`--slug must be lowercase words joined by hyphens, got ${JSON.stringify(slug)}`);
      const probe = newFlow("probe", slug, opt.title as string, time);
      openStage(probe, opt.skill as string, opt.ticket as string | undefined, time);
      const { id, folder } = createFlowFolder(dir, slug);
      return withLock(folder, () => {
        const s = newFlow(id, slug, opt.title as string, time);
        const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time);
        publish(folder, s);
        observeAuthoring(folder, s, stage.id);
        return { flow: id, stage: stage.id, revision: s.revision, bound: bind(id, stage.id) };
      });
    }
    case "bind": {
      if (opt.flow === undefined || opt.stage === undefined) usage("bind needs --flow and --stage");
      if (!session) refuse("bind needs a session: run from an omp session (which sets PI_SESSION_ID) or give --session");
      return locked(opt.flow as string, (_folder, s) => {
        const stage = stageOf(s, opt.stage as string, "bind");
        if (stage.state === "finished") refuse(`Stage ${stage.id} is finished; open a new Stage to continue the Flow`);
        bind(s.flow.id, stage.id);
        return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: true };
      });
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
        if (!repeated) publish(folder, s);
        return { flow: s.flow.id, stage: t.stage, revision, ...(repeated ? { repeated } : {}), ...receipt };
      });
    }
    case "alias": {
      const aliases = rest.map(parseAlias);
      return locked(flowKey(), (folder, s) => {
        const added = addAliases(s, aliases);
        if (added.length) publish(folder, s);
        return { flow: s.flow.id, revision: s.revision, added, aliases: aliasesOf(s) };
      });
    }
    case "close": {
      return locked(flowKey(), (folder, s) => {
        closeFlow(s, time);
        publish(folder, s);
        return { flow: s.flow.id, revision: s.revision, closed: time };
      });
    }
    case "reopen": {
      if (opt.skill === undefined) usage("reopen needs --skill, the skill whose run the new Stage is");
      return locked(flowKey(), (folder, s) => {
        const stage = reopenFlow(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
        publish(folder, s);
        return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: bind(s.flow.id, stage.id) };
      });
    }
    case "find": {
      if (rest[0].includes(":")) {
        const { historical } = aliasMatches(rest[0]);
        if (historical.length) return { migration_required: true, historical };
      }
      const { folder } = locate(rest[0]);
      const s = readState(folder)!;
      return { flow: s.flow.id, revision: s.revision, aliases: aliasesOf(s) };
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
        return { flow: s.flow.id, revision: s.revision, moved_from: from };
      });
    }
    case "bound": {
      const b = session ? readBinding(dir, session, agent) : undefined;
      if (!b) return { binding: null };
      const { folder } = locate(b.flow);
      const s = readState(folder)!;
      stageOf(s, b.stage, "bound");
      return { binding: b, flow: s.flow.id, stage: b.stage, revision: s.revision };
    }
    default: {
      const { folder } = locate(flowKey());
      const s = readState(folder)!;
      return { ...snapshot(view(s)), aliases: aliasesOf(s) };
    }
  }
}

const unbound = command === "bound" && (!session || !readBinding(dir, session, agent));
const live = command === "host" || unbound ? undefined : await connect(home);
try {
  const result = await main() as { flow?: string | { id: string } };
  if (live && result.flow) {
    const id = typeof result.flow === "string" ? result.flow : result.flow.id;
    const presentation = live.state === "serving"
      ? { state: "serving", url: flowUrl(live.port, live.secret.read, basename(dirname(dir)), id) }
      : live;
    Object.assign(result, { live: presentation });
    if (live.state === "unavailable") process.stderr.write(`flow-page.ts: the Flow reader needs the Local Flow host, which is not serving (${live.error}). The Flow content is stored; do not resubmit it. Fix the host, then run bound or show for the reader URL.\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  process.stderr.write(`flow-page.ts: ${e.message}\nNo Flow content was committed. Host lifecycle metadata may have been written.\n`);
  process.exitCode = 1;
} finally {
  if (live?.state === "serving") live.release();
}
