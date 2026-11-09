import { appendFileSync, cpSync, existsSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const root = process.env.FAKE_OVNFS_ROOT!;
const stateFile = join(root, "checkouts.json");
const entries: { name: string; path: string; source: string; dirty: boolean; git?: string }[] = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : [];
const snapshotFile = join(root, "snapshots.json");
const snapshots: { id: string; checkout: string }[] = existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, "utf8")) : [];
const save = () => { writeFileSync(stateFile, JSON.stringify(entries)); writeFileSync(snapshotFile, JSON.stringify(snapshots)); };
const remove = (name: string, sticky: boolean) => {
  const i = entries.findIndex(e => e.name === name);
  if (i < 0) process.exit(1);
  rmSync(entries[i].path, { recursive: true });
  if (entries[i].git) rmSync(entries[i].git!, { recursive: true, force: true });
  entries.splice(i, 1);
  if (!sticky && !process.env.FAKE_OVNFS_OLD_DAEMON) snapshots.splice(0, snapshots.length, ...snapshots.filter(s => s.checkout !== name));
  save(); console.log("{}");
};
const git = (cwd: string, ...args: string[]) => {
  const p = Bun.spawnSync([process.env.FAKE_GIT!, ...args], { cwd });
  if (p.exitCode) throw new Error(p.stderr.toString());
};
appendFileSync(join(root, "calls.jsonl"), `${JSON.stringify({ cli: basename(process.argv[1]), args })}\n`);
if (basename(process.argv[1]) === "omp") {
  if (args[0] === "config") {
    console.log(args.at(-1) === "ovnfs.path" ? process.env.FAKE_OVNFS_PATH ?? "(not set)" : root);
  } else {
    const rest = args.slice(2);
    if (rest[0] === "-b") git(process.cwd(), "worktree", "add", "-b", rest[1], rest[2], rest[3]);
    else git(process.cwd(), "worktree", "add", ...rest);
    if (process.env.FAKE_OMP_CLONED) console.log(`Cloned from ${process.cwd()} via fixture`);
  }
} else {
  const rest = args.filter(a => a !== "--json");
  if (rest[0] === "new") {
    if (process.env.FAKE_OVNFS_FAIL) { console.error("fixture daemon unavailable"); process.exit(1); }
    const source = rest[1]; const name = rest[rest.indexOf("--name") + 1];
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) {
      console.error("invalid checkout name"); process.exit(1);
    }
    if (rest.includes("--rev") && entries.some(entry => realpathSync(entry.path) === realpathSync(source))) {
      console.error("--rev and --from apply only to folders"); process.exit(1);
    }
    const path = join(root, name);
    git(root, "clone", "--no-hardlinks", source, path);
    if (rest.includes("--rev")) git(path, "checkout", "--detach", rest[rest.indexOf("--rev") + 1]);
    else for (const entry of readdirSync(source)) {
      if (entry !== ".git") cpSync(join(source, entry), join(path, entry), { recursive: true });
    }
    if (existsSync(join(source, "node_modules"))) cpSync(join(source, "node_modules"), join(path, "node_modules"), { recursive: true });
    const checkout = { name, path, source, dirty: false }; entries.push(checkout); save();
    console.log(JSON.stringify({ checkout }));
  } else if (rest[0] === "rm") remove(rest[1], false);
  else if (rest[0] === "ctl" && rest[1] === "rm") {
    const request = JSON.parse(rest[2]);
    if (process.env.FAKE_OVNFS_OLD_DAEMON && "sticky_snapshots" in request) {
      console.error('invalid: json: unknown field "sticky_snapshots"'); process.exit(1);
    }
    remove(request.checkout, request.sticky_snapshots === true);
  } else if (rest[0] === "ls") {
    if (process.env.FAKE_OVNFS_LIST_FAIL) { console.error("fixture listing unavailable"); process.exit(1); }
    console.log(process.env.FAKE_OVNFS_LISTING ?? JSON.stringify({ checkouts: entries, snapshots }));
  }
  else if (rest[0] === "diff") console.log(process.env.FAKE_OVNFS_DIFF ?? JSON.stringify({ changes: [] }));
  else process.exit(1);
}
