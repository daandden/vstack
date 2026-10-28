// The Flow page authoring interface. A caller opens or joins a Stage once, then submits typed contributions to it;
// the script assigns ids, numbers, timestamps, labels, and links, and publishes the whole static page.
//
//   bun flow-page.ts open --skill <name> (--title <text> [--slug <slug>] | --flow <id>) [--ticket <id>]
//   bun flow-page.ts bind --flow <id> --stage <id>
//   bun flow-page.ts submit [--flow <id> --stage <id>] [<contribution.json> | -]
//   bun flow-page.ts show [--flow <id>]
//   bun flow-page.ts render --flow <id>
//
// Every command also takes --session <id> (default: $PI_SESSION_ID), --agent <id> (default: main), and
// --home <dir> (default: the user's home). A binding belongs to one session and agent in one project; without one,
// submit needs --flow and --stage. Stdout is one JSON receipt. Exit 1 is a refusal, printed to stderr, after which
// nothing was written; exit 2 is a usage error.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { contribute, newFlow, nowIso, openStage, Refusal, SLUG, slugOf, snapshot, stageOf, view, type State } from "./model.ts";
import { RENDERER, render } from "./render.ts";
import { createFlowFolder, flowsDir, pagePath, readBinding, statePath, withLock, writeAtomic, writeBinding } from "./store.ts";

const COMMANDS = ["open", "bind", "submit", "show", "render"];

function usage(message: string): never {
  process.stderr.write(`flow-page.ts: ${message}
usage: bun flow-page.ts open --skill <name> (--title <text> [--slug <slug>] | --flow <id>) [--ticket <id>]
       bun flow-page.ts bind --flow <id> --stage <id>
       bun flow-page.ts submit [--flow <id> --stage <id>] [<contribution.json> | -]
       bun flow-page.ts show [--flow <id>]
       bun flow-page.ts render --flow <id>
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
    options: Object.fromEntries(["skill", "title", "slug", "flow", "stage", "ticket", "session", "agent", "home"].map((k) => [k, { type: "string" as const }])),
  });
} catch (e) {
  usage((e as Error).message);
}
const { values: opt, positionals } = parsed;
const [command, ...rest] = positionals;
if (!COMMANDS.includes(command ?? "")) usage(`give a command: ${COMMANDS.join(", ")}`);
const allowed: Record<string, string[]> = { open: ["skill", "title", "slug", "flow", "ticket"], bind: ["flow", "stage"], submit: ["flow", "stage"], show: ["flow"], render: ["flow"] };
for (const k of Object.keys(opt)) if (!["session", "agent", "home", ...allowed[command]].includes(k)) usage(`${command} takes no --${k}`);
if (rest.length > (command === "submit" ? 1 : 0)) usage(`${command} takes no ${command === "submit" ? "more than one contribution file" : "positional arguments"}`);

const dir = flowsDir(resolve((opt.home as string | undefined) ?? homedir()), process.cwd());
const session = (opt.session as string | undefined) ?? process.env.PI_SESSION_ID ?? undefined;
const agent = (opt.agent as string | undefined) ?? "main";
const time = nowIso();

function folderOf(flow: string): string {
  if (!SLUG.test(flow)) refuse(`--flow must be a Flow id of lowercase letters, digits, and hyphens, got ${JSON.stringify(flow)}`);
  const folder = join(dir, flow);
  if (!existsSync(statePath(folder))) refuse(`this project has no Flow ${flow}`);
  return folder;
}
const load = (folder: string): State => JSON.parse(readFileSync(statePath(folder), "utf8"));

/** Renders first, so a state the renderer cannot show is never stored, then replaces the state and the page. */
function publish(folder: string, s: State): string {
  const html = render(view(s));
  writeAtomic(statePath(folder), `${JSON.stringify(s)}\n`);
  writeAtomic(pagePath(folder), html);
  return pagePath(folder);
}

/** The target named by --flow and --stage, else this session's binding. Nothing falls back to another session's work. */
function target(): { flow: string; stage: string } {
  if (opt.flow !== undefined || opt.stage !== undefined) {
    if (opt.flow === undefined || opt.stage === undefined) usage("name both --flow and --stage, or neither to use this session's binding");
    return { flow: opt.flow as string, stage: opt.stage as string };
  }
  if (!session) refuse("no session to look up a binding for: run from an omp session (which sets PI_SESSION_ID) or give --session, or name --flow and --stage");
  return readBinding(dir, session!, agent) ?? refuse(`session ${session} (agent ${agent}) is bound to no Flow in this project: run open or bind first, or name --flow and --stage`);
}

const bind = (flow: string, stage: string) => {
  if (!session) return false;
  writeBinding(dir, { flow, stage, session, agent, bound: time });
  return true;
};

async function main(): Promise<object> {
  switch (command) {
    case "open": {
      if (opt.skill === undefined) usage("open needs --skill, the skill whose run this Stage is");
      if (opt.flow !== undefined) {
        if (opt.title !== undefined || opt.slug !== undefined) usage("--title and --slug start a new Flow; leave them out with --flow");
        const folder = folderOf(opt.flow as string);
        return withLock(folder, () => {
          const s = load(folder);
          const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time);
          const page = publish(folder, s);
          return { flow: s.flow.id, stage: stage.id, revision: s.revision, page, bound: bind(s.flow.id, stage.id) };
        });
      }
      if (opt.title === undefined) usage("open needs --title for a new Flow, or --flow to add a Stage to an existing one");
      const slug = (opt.slug as string | undefined) ?? slugOf(opt.title as string);
      if (!SLUG.test(slug)) refuse(`--slug must be lowercase words joined by hyphens, got ${JSON.stringify(slug)}`);
      // Check the input before a folder exists, so a refusal leaves nothing behind.
      const probe = newFlow("probe", slug, opt.title as string, time);
      openStage(probe, opt.skill as string, opt.ticket as string | undefined, time);
      const { id, folder } = createFlowFolder(dir, slug);
      return withLock(folder, () => {
        const s = newFlow(id, slug, opt.title as string, time);
        const stage = openStage(s, opt.skill as string, opt.ticket as string | undefined, time);
        const page = publish(folder, s);
        return { flow: id, stage: stage.id, revision: s.revision, page, bound: bind(id, stage.id) };
      });
    }
    case "bind": {
      if (opt.flow === undefined || opt.stage === undefined) usage("bind needs --flow and --stage");
      if (!session) refuse("bind needs a session: run from an omp session (which sets PI_SESSION_ID) or give --session");
      const folder = folderOf(opt.flow as string);
      const s = load(folder);
      const stage = stageOf(s, opt.stage as string, "bind");
      if (stage.state === "finished") refuse(`Stage ${stage.id} is finished; open a new Stage to continue the Flow`);
      bind(s.flow.id, stage.id);
      return { flow: s.flow.id, stage: stage.id, revision: s.revision, page: pagePath(folder), bound: true };
    }
    case "submit": {
      const t = target();
      const folder = folderOf(t.flow);
      let input: unknown;
      const raw = rest[0] === undefined || rest[0] === "-" ? await Bun.stdin.text() : existsSync(rest[0]) ? readFileSync(rest[0], "utf8") : usage(`${rest[0]} does not exist`);
      try {
        input = JSON.parse(raw);
      } catch (e) {
        refuse(`the contribution is not valid JSON (${(e as Error).message})`);
      }
      return withLock(folder, () => {
        const s = load(folder);
        const receipt = contribute(s, t.stage, input, time);
        const page = publish(folder, s);
        return { flow: s.flow.id, stage: t.stage, revision: s.revision, page, ...receipt };
      });
    }
    case "show": {
      const flow = (opt.flow as string | undefined) ?? target().flow;
      const folder = folderOf(flow);
      return snapshot(view(load(folder)), pagePath(folder), RENDERER);
    }
    default: {
      if (opt.flow === undefined) usage("render needs --flow");
      const folder = folderOf(opt.flow as string);
      return withLock(folder, () => {
        const s = load(folder);
        return { flow: s.flow.id, revision: s.revision, page: publish(folder, s) };
      });
    }
  }
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  process.stderr.write(`flow-page.ts: ${e.message}\nNothing was written.\n`);
  process.exit(1);
}
