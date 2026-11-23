// The Flow page authoring interface. A caller opens or joins a Stage once, then submits typed contributions to it;
// the script assigns ids, numbers, timestamps, labels, and links and commits them. The Local Flow host presents them.
//
// <flow> is a Flow id or a qualified alias such as spec:267. Every command also takes --session <id> (default:
// $PI_SESSION_ID), --agent <id> (default: main), and --home <dir> (default: the user's home). A binding belongs to one
// session and agent in one project. Without one, submit needs --flow and --stage. Stdout is one JSON receipt.
// Exit 1 refuses without committing Flow content. Host lifecycle metadata may be written. Exit 2 is a usage error.
// A receipt's `live` says whether the host presents the Flow; committed content never depends on it.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { canonicalFile, capture, type Root } from "./assets.ts";
import { addAliases, aliasesOf, closeFlow, contribute, latestAsks, newFlow, nowIso, openStage, parseAlias, reopenFlow, SLUG, slugOf, snapshot, stageOf, view, type Io, type State } from "./model.ts";
import { projectStore, type FlowWrite } from "./store.ts";
import { connect, flowUrl, hostCommand, originOf, prepareStorage } from "./live.ts";
import { captureHistoricalImages, historicalFlows, migrateHistorical, parseHistorical } from "./migrate.ts";
import { readComments } from "./comments.ts";
import { Refusal } from "./fields.ts";
import { ContributionRefusal, contributionKinds, refusalDiagnostic, resultContracts } from "./contracts.ts";
import { describeContribution, describeResult } from "./discovery.ts";
import { registerObservation } from "./observations.ts";
import { projectCommonDir } from "../../vstack-tmp/scripts/scratch.ts";

const COMMANDS = ["open", "bind", "submit", "validate", "catalog", "describe", "alias", "close", "reopen", "find", "move", "show", "bound", "ask-status", "target", "picker", "host", "migrate"];

function usage(message: string): never {
  process.stderr.write(`flow-page.ts: ${message}
usage: bun flow-page.ts open --skill <name> (--title <text> [--slug <slug>] | --flow <flow> [--parent <stage>]) [--ticket <id>]
       bun flow-page.ts bind --flow <flow> --stage <id>
       bun flow-page.ts submit [--flow <flow> --stage <id>] [<contribution.json> | -]
       bun flow-page.ts validate [--flow <flow> --stage <id>] [<contribution.json> | -]
       bun flow-page.ts catalog
       bun flow-page.ts describe <shape|kind> [--compact]
       bun flow-page.ts alias [--flow <flow>] <kind>:<value>...
       bun flow-page.ts close [--flow <flow>]
       bun flow-page.ts reopen --skill <name> [--flow <flow>] [--parent <stage>] [--ticket <id>]
       bun flow-page.ts find <kind>:<value>
       bun flow-page.ts move [--flow <flow>] --to <folder-key>
       bun flow-page.ts show [--flow <flow>]
       bun flow-page.ts bound
       bun flow-page.ts ask-status [<question-id>...]
       bun flow-page.ts target --session <id>
       bun flow-page.ts picker open|clear --picker <id> [<question-id>...]
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

function askFormHtml(questions: NonNullable<ReturnType<typeof contribute>["ask"]>["questions"]): string {
  let html = "<form>";
  for (const q of questions) {
    const name = Bun.escapeHTML(q.id);
    const type = q.multi ? "checkbox" : "radio";
    html += `<fieldset><legend>${Bun.escapeHTML(q.question)}</legend>`;
    for (const [i, option] of q.options.entries()) {
      const label = Bun.escapeHTML(option.label);
      html += `<label><input type="${type}" name="${name}" value="${label}"${i === q.recommended ? " checked" : ""}>${label}</label>`;
    }
    html += "</fieldset>";
  }
  return html + "</form>";
}

const stringOptions = ["skill", "title", "slug", "flow", "stage", "parent", "ticket", "to", "session", "agent", "home", "picker"] as const;
let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { ...Object.fromEntries(stringOptions.map((k) => [k, { type: "string" as const }])) as Record<typeof stringOptions[number], { type: "string" }>, compact: { type: "boolean" } },
  });
} catch (e) {
  usage((e as Error).message);
}
const { values: opt, positionals } = parsed;
const [command, ...rest] = positionals;
if (!COMMANDS.includes(command ?? "")) usage(`give a command: ${COMMANDS.join(", ")}`);
const allowed: Record<string, string[]> = {
  open: ["skill", "title", "slug", "flow", "parent", "ticket"], bind: ["flow", "stage"], submit: ["flow", "stage"], validate: ["flow", "stage"], alias: ["flow"], close: ["flow"], reopen: ["skill", "flow", "parent", "ticket"],
  catalog: [], describe: ["compact"], find: [], move: ["flow", "to"], show: ["flow"], bound: [], "ask-status": [], target: [], picker: ["picker"], host: [], migrate: [],
};
for (const k of Object.keys(opt)) if (!["session", "agent", "home", ...allowed[command]].includes(k)) usage(`${command} takes no --${k}`);
const positional: Record<string, [number, number, string]> = {
  submit: [0, 1, "takes no more than one contribution file"], alias: [1, Infinity, "needs one or more <kind>:<value> aliases"], find: [1, 1, "needs exactly one <kind>:<value> alias or Flow id"],
  validate: [0, 1, "takes no more than one contribution file"],
  describe: [1, 1, "needs exactly one Result shape or contribution kind"],
  host: [1, 1, "needs status or stop"],
  migrate: [1, 1, "needs exactly one Grilling page folder"],
  picker: [1, Infinity, "needs open or clear, and optional question ids"],
  "ask-status": [0, Infinity, "takes optional question ids"],
};
const [least, most, says] = positional[command] ?? [0, 0, "takes no positional arguments"];
if (rest.length < least || rest.length > most) usage(`${command} ${says}`);
if (command === "picker" && (!["open", "clear"].includes(rest[0]) || !opt.picker)) usage("picker needs open or clear and --picker <id>");
if (command === "catalog") {
  process.stdout.write(`${JSON.stringify({
    shapes: Object.entries(resultContracts).map(([shape, contract]) => ({ shape, purpose: contract.purpose })),
    kinds: Object.keys(contributionKinds),
  })}\n`);
  process.exit(0);
}
if (command === "describe") {
  const name = rest[0];
  const short = opt.compact === true;
  if (Object.hasOwn(resultContracts, name)) process.stdout.write(`${describeResult(name, resultContracts[name], short)}\n`);
  else if (Object.hasOwn(contributionKinds, name)) process.stdout.write(`${describeContribution(name, contributionKinds[name], short)}\n`);
  else usage(`unknown Result shape or contribution kind ${JSON.stringify(name)}; choose ${[...Object.keys(resultContracts), ...Object.keys(contributionKinds)].join(", ")}`);
  process.exit(0);
}

const home = resolve((opt.home as string | undefined) ?? homedir());
const readonly = command === "validate" || command === "ask-status";
if (command !== "host" && !readonly) await prepareStorage(home);
const store = projectStore(home, process.cwd(), readonly);
const session = (opt.session as string | undefined) ?? process.env.PI_SESSION_ID ?? undefined;
const agent = (opt.agent as string | undefined) ?? "main";
const time = nowIso();

const scratch = store.scratch;

function aliasMatches(key: string) {
  const alias = parseAlias(key);
  const matches = (value: string) => /^(spec|ticket):/.test(alias) ? value.toLowerCase() === alias.toLowerCase() : value === alias;
  const current = store.findIds(alias).map(s => ({ id: s.flow.id }));
  const historical = historicalFlows(scratch).filter((h) => {
    if (!h.aliases.some(matches)) return false;
    const migrated = store.migration(h.source);
    if (migrated) {
      if (store.revision(migrated.flow) === undefined && !current.length) refuse(`${alias} belonged to Flow ${migrated.flow}, whose content expired or was deleted. Its historical source cannot recreate that identity. Open a new Flow explicitly`);
      return false;
    }
    return !store.migratedFrom(h.source);
  });
  if (current.length + historical.length > 1) refuse(`${alias} names multiple Flows in this project: ${[...current.map((h) => h.id), ...historical.map((h) => h.source)].join(", ")}. Name a Flow by id or explicitly migrate one historical source`);
  return { alias, current, historical };
}

function locate(key: string): { id: string } {
  if (key.includes(":")) {
    const { alias, current, historical } = aliasMatches(key);
    if (historical.length) refuse(`${alias} has historical structured Flow content at ${historical[0].source}. Continue it with migrate ${JSON.stringify(historical[0].source)} before opening a Stage`);
    if (!current.length) refuse(`no Flow in this project has ${alias}`);
    if (store.revision(current[0].id) === undefined) refuse(`Flow ${current[0].id} has no content any more: it expired or was deleted. Open a new Flow`);
    return current[0];
  }
  if (!SLUG.test(key)) refuse(`--flow must be a Flow id of lowercase letters, digits, and hyphens, or a qualified alias such as spec:267, got ${JSON.stringify(key)}`);
  if (store.revision(key) !== undefined) return { id: key };
  return refuse(store.hasId(key)
    ? `Flow ${key} has no content any more: it expired after it was closed, or its folder was deleted. Nothing can be read or added under this id; open a new Flow`
    : `this project has no Flow ${key}`);
}

function observeAuthoring(s: State, stage?: string): void {
  const bound = session ? store.binding(session, agent) : undefined;
  try {
    registerObservation(store, realpathSync(process.cwd()), s, stage ?? (bound?.flow === s.flow.id ? bound.stage : undefined));
  } catch {
    process.stderr.write("flow-page.ts: the command succeeded, but its checkout could not be registered for read-only observation. Do not resubmit.\n");
  }
}

function locked<T>(key: string, fn: (write: FlowWrite, s: State) => T): T {
  const { id } = locate(key);
  return store.commit(id, (s, write) => {
    const value = fn(write, s);
    observeAuthoring(s, (value as { stage?: string }).stage);
    return value;
  });
}

function roots(canonical = false): Root[] {
  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: process.cwd(), stdout: "pipe", stderr: "ignore" });
  const project = top.exitCode === 0 ? top.stdout.toString().trim() : process.cwd();
  const out: Root[] = [{ name: "project", dir: realpathSync(project) }];
  if (existsSync(scratch)) out.push({ name: "scratch", dir: realpathSync(scratch) });
  if (canonical) {
    const common = projectCommonDir(process.cwd());
    const shared = common && join(common, "vstack");
    if (shared && existsSync(join(shared, "config")) && statSync(join(shared, "config")).isDirectory()) {
      const domain = join(shared, "domain");
      if (existsSync(domain) && statSync(domain).isDirectory() && realpathSync(shared) === shared && realpathSync(domain) === domain) {
        out.unshift({ name: "vstack-domain", dir: domain });
      }
    }
  }
  return out;
}

const captured = new Map<string, Uint8Array>();
const io: Io = {
  capture(path, type, where, focus) {
    const { bytes, ...c } = capture(path, type, roots(), process.cwd(), where, focus);
    captured.set(c.file, bytes);
    return c;
  },
  canonical(path, where, root) {
    const rs = roots(true);
    const base = root === undefined ? process.cwd() : (rs.find((r) => r.name === root)?.dir ?? refuse(`${where}: this project has no ${root} directory to find ${path} in`));
    return canonicalFile(path, rs, base, where);
  },
};

function publish(write: FlowWrite, s: State): void {
  write.save(s, captured);
}

function binding() {
  if (!session) refuse("no session to look up a binding for: run from an omp session (which sets PI_SESSION_ID) or give --session, or name the Flow");
  return store.binding(session!, agent) ?? refuse(`session ${session} (agent ${agent}) is bound to no Flow in this project: run open or bind first, or name the Flow`);
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
  store.bind({ flow, stage, session, agent, bound: time });
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
      if (!existsSync(scratch)) refuse("migrate: this project has no historical Scratch folder");
      const historicalScratch = realpathSync(scratch);
      const rel = relative(historicalScratch, from);
      if (rel === ".." || rel.startsWith(`..${sep}`) || !rel || store.contains(from)) refuse("migrate: the source must be a historical folder in this project's Scratch dir, outside its Flow store");
      const path = join(from, "page.jsonl");
      if (!existsSync(path)) refuse("migrate: this page has no structured page.jsonl state; its handwritten page stays untouched");
      const historical = parseHistorical(readFileSync(path, "utf8"));
      const migrationIo: Io = { ...io, capture: (path, type, where, focus) => io.capture(resolve(from, path), type, where, focus) };
      const migrated = migrateHistorical(historical, "probe", from, time, migrationIo);
      return store.migrating(() => {
        const identity = store.migration(from);
        if (identity && !store.read(identity.flow)) refuse(`migrate: Flow ${identity.flow} expired or was deleted. The retained historical source cannot recreate that identity. Open a new Flow explicitly`);
        const prior = store.migratedFrom(from);
        if (prior) {
          return locked(prior.flow.id, (write, current) => {
            if (current.migrated!.sha256 !== historical.sha256) refuse(`migrate: ${from} changed after migration to ${current.flow.id}; continue authoring that Flow instead of overwriting it`);
            const repaired = captureHistoricalImages(current, from, time, migrationIo);
            if (repaired) {
              current.revision++;
              publish(write, current);
            }
            store.registerMigration({ source: from, flow: current.flow.id, sha256: historical.sha256 });
            return { flow: current.flow.id, revision: current.revision, ...(repaired ? { repaired: true } : { repeated: true }) };
          });
        }
        return store.create(historical.slug, (id, write) => {
          migrated.flow.id = id;
          migrated.aliases[0] = `folder:${id}`;
          publish(write, migrated);
          store.registerMigration({ source: from, flow: id, sha256: historical.sha256 });
          observeAuthoring(migrated);
          return { flow: id, revision: migrated.revision };
        });
      });
    }
    case "open": {
      if (opt.skill === undefined) usage("open needs --skill, the skill whose run this Stage is");
      if (opt.flow !== undefined) {
        if (opt.title !== undefined || opt.slug !== undefined) usage("--title and --slug start a new Flow; leave them out with --flow");
        return locked(opt.flow as string, (write, s) => {
          const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
          publish(write, s);
          return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: bind(s.flow.id, stage.id) };
        });
      }
      if (opt.title === undefined) usage("open needs --title for a new Flow, or --flow to add a Stage to an existing one");
      if (opt.parent !== undefined) usage("--parent names a Stage of an existing Flow; give it with --flow");
      const slug = (opt.slug as string | undefined) ?? slugOf(opt.title as string);
      if (!SLUG.test(slug)) refuse(`--slug must be lowercase words joined by hyphens, got ${JSON.stringify(slug)}`);
      const probe = newFlow("probe", slug, opt.title as string, time);
      openStage(probe, opt.skill as string, opt.ticket as string | undefined, time);
      return store.create(slug, (id, write) => {
        const s = newFlow(id, slug, opt.title as string, time);
        const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time);
        publish(write, s);
        observeAuthoring(s, stage.id);
        return { flow: id, stage: stage.id, revision: s.revision, bound: bind(id, stage.id) };
      });
    }
    case "bind": {
      if (opt.flow === undefined || opt.stage === undefined) usage("bind needs --flow and --stage");
      if (!session) refuse("bind needs a session: run from an omp session (which sets PI_SESSION_ID) or give --session");
      return locked(opt.flow as string, (_write, s) => {
        const stage = stageOf(s, opt.stage as string, "bind");
        if (stage.state === "finished") refuse(`Stage ${stage.id} is finished; open a new Stage to continue the Flow`);
        bind(s.flow.id, stage.id);
        return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: true };
      });
    }
    case "validate":
    case "submit": {
      const t = target();
      let input: unknown;
      const raw = rest[0] === undefined || rest[0] === "-" ? await Bun.stdin.text() : existsSync(rest[0]) ? readFileSync(rest[0], "utf8") : usage(`${rest[0]} does not exist`);
      try {
        input = JSON.parse(raw);
      } catch (e) {
        throw new ContributionRefusal([{ code: "invalid_json", path: "$", message: `the contribution is not valid JSON (${(e as Error).message})`, allowed: "JSON object" }]);
      }
      const apply = (write: FlowWrite | undefined, s: State) => {
        try {
          const { revision, repeated, refs, ask } = contribute(s, t.stage, input, time, io);
          if (command === "validate") return { ok: true, diagnostics: [] };
          if (!repeated) publish(write!, s);
          return { flow: s.flow.id, stage: t.stage, revision, ...(repeated ? { repeated } : {}), refs, ...(ask ? { ask: { ...ask, html: askFormHtml(ask.questions) } } : {}) };
        } catch (error) {
          if (error instanceof ContributionRefusal) throw error;
          throw new ContributionRefusal([refusalDiagnostic(error, input)]);
        }
      };
      if (command === "validate") {
        const { id } = locate(t.flow);
        const s = store.read(id) ?? refuse(`Flow ${t.flow} has no stored content`);
        return apply(undefined, s);
      }
      return locked(t.flow, apply);
    }
    case "alias": {
      const aliases = rest.map(parseAlias);
      return locked(flowKey(), (write, s) => {
        const added = addAliases(s, aliases);
        if (added.length) publish(write, s);
        return { flow: s.flow.id, revision: s.revision, added, aliases: aliasesOf(s) };
      });
    }
    case "close": {
      return locked(flowKey(), (write, s) => {
        closeFlow(s, time);
        publish(write, s);
        return { flow: s.flow.id, revision: s.revision, closed: time };
      });
    }
    case "reopen": {
      if (opt.skill === undefined) usage("reopen needs --skill, the skill whose run the new Stage is");
      return locked(flowKey(), (write, s) => {
        const stage = reopenFlow(s, opt.skill as string, opt.ticket as string | undefined, time, opt.parent as string | undefined);
        publish(write, s);
        return { flow: s.flow.id, stage: stage.id, revision: s.revision, bound: bind(s.flow.id, stage.id) };
      });
    }
    case "find": {
      if (rest[0].includes(":")) {
        const { historical } = aliasMatches(rest[0]);
        if (historical.length) return { migration_required: true, historical };
      }
      const { id } = locate(rest[0]);
      return store.summary(id)!;
    }
    case "move": {
      const to = opt.to as string | undefined;
      if (to === undefined) usage("move needs --to, the new folder key");
      if (!SLUG.test(to!)) refuse(`--to must be lowercase words joined by hyphens, got ${JSON.stringify(to)}`);
      return locked(flowKey(), (write, s) => write.move(s, to!));
    }
    case "picker": {
      if (!session || agent !== "main") return { presence: false };
      const key = store.key;
      const b = store.binding(session, "main");
      if (rest[0] === "open" && !b) return { binding: null, presence: false };
      const s = b ? store.read(locate(b.flow).id)! : undefined;
      const questions = s ? rest.slice(1).filter(id => view(s).questions.has(id)) : [];
      const p = { key, session, picker: opt.picker, ...(b ? { flow: b.flow, stage: b.stage } : {}), questions, expires: Date.now() + 30_000 };
      let presence = false;
      if (live?.state === "serving") {
        try {
          presence = (await fetch(`${originOf(live.port)}/.host/picker`, {
            method: rest[0] === "open" ? "PUT" : "DELETE",
            headers: { authorization: `Bearer ${live.secret.control}`, "content-type": "application/json" },
            body: JSON.stringify(p), signal: AbortSignal.timeout(500),
          })).ok;
        } catch {}
      }
      return { binding: b ?? null, ...(b ? { flow: b.flow, stage: b.stage } : {}), presence };
    }
    case "ask-status": {
      const binding = session ? store.binding(session, agent, true) : undefined;
      if (!binding) return { binding: null };
      const s = store.read(locate(binding.flow).id) ?? refuse(`bound Flow ${binding.flow} could not be read`);
      stageOf(s, binding.stage, "bound");
      const latest = latestAsks(s, binding.stage);
      const refusals: string[] = [];
      for (const name of rest) {
        const q = s.questions.find(q => q.id === name);
        const reason = !q ? "not a published question"
          : q.stage !== binding.stage ? `belongs to Stage ${q.stage}, not the bound Stage ${binding.stage}`
          : latest.get(q.q)?.id !== name ? "superseded by a re-ask"
          : s.retirements.some(r => r.question === name) ? "question is retired"
          : s.answers.some(a => a.question === name) ? "already has a recorded answer"
          : undefined;
        if (reason) refusals.push(`${JSON.stringify(name)}: ${reason}`);
      }
      return { binding, refusals };
    }
    case "target":
    case "bound": {
      const b = session ? store.binding(session, command === "target" ? "main" : agent) : undefined;
      if (!b) return command === "target" ? { target: null } : { binding: null };
      const { id } = locate(b.flow);
      const s = store.read(id)!;
      stageOf(s, b.stage, "bound");
      return { binding: b, flow: s.flow.id, stage: b.stage, revision: s.revision, ...(command === "target" ? { target: null, picker: null } : {}) };
    }
    default: {
      const { id } = locate(flowKey());
      const s = store.read(id)!;
      return { ...snapshot(view(s)), aliases: aliasesOf(s), reader_comments: readComments(store, id).comments };
    }
  }
}

const unbound = ["bound", "target", "picker"].includes(command) && (!session || !store.binding(session, command === "bound" ? agent : "main")) && !(command === "picker" && rest[0] === "clear");
const live = command === "host" || readonly || unbound ? undefined : await connect(home);
try {
  const result = await main() as { flow?: string | { id: string }; stage?: string; target?: string | null; picker?: string | null };
  if (live && result.flow) {
    const id = typeof result.flow === "string" ? result.flow : result.flow.id;
    const presentation = live.state === "serving"
      ? { state: "serving", url: flowUrl(live.port, live.secret.read, store.key, id) }
      : live;
    Object.assign(result, { live: presentation });
    if (command === "target" && presentation.state === "serving" && "url" in presentation) {
      let fragment = result.stage!;
      try {
        const response = await fetch(new URL("presence", presentation.url), { signal: AbortSignal.timeout(500) });
        if (response.ok) {
          const { presences } = await response.json() as { presences: { session: string; stage: string; questions: string[]; picker: string }[] };
          const presence = presences.find(p => p.session === session && p.stage === result.stage);
          fragment = presence?.questions[0] ?? fragment;
          result.picker = presence?.picker ?? null;
        }
      } catch {}
      result.target = `${presentation.url}#${fragment}`;
    }
    if (live.state === "unavailable") process.stderr.write(`flow-page.ts: the Flow reader needs the Local Flow host, which is not serving (${live.error}). The Flow content is stored; do not resubmit it. Fix the host, then run bound or show for the reader URL.\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  if (["validate", "submit"].includes(command)) {
    const diagnostics = e instanceof ContributionRefusal ? e.diagnostics : [refusalDiagnostic(e, undefined)];
    process.stdout.write(`${JSON.stringify({ ok: false, diagnostics })}\n`);
  }
  process.stderr.write(`flow-page.ts: ${e.message}\nNo Flow content was committed. Host lifecycle metadata may have been written.\n`);
  process.exitCode = 1;
} finally {
  if (live?.state === "serving") live.release();
}
