import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

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
  if (!process.env.FAKE_OVNFS_RETAIN_DIRECTORY) {
    rmSync(entries[i].path, { recursive: true });
    if (entries[i].git) rmSync(entries[i].git!, { recursive: true, force: true });
  }
  entries.splice(i, 1);
  if (!sticky) snapshots.splice(0, snapshots.length, ...snapshots.filter(s => s.checkout !== name));
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
    if (process.env.FAKE_OMP_CLONED) {
      const path = rest[0] === "-b" ? rest[2] : rest[0] === "--detach" ? rest[1] : rest[0];
      const others = Bun.spawnSync([process.env.FAKE_GIT!, "ls-files", "--others", "-z"], { cwd: process.cwd() });
      if (others.exitCode) throw new Error(others.stderr.toString());
      for (const name of others.stdout.toString().split("\0").filter(Boolean)) {
        mkdirSync(dirname(join(path, name)), { recursive: true });
        cpSync(join(process.cwd(), name), join(path, name), { recursive: true, dereference: false });
      }
      console.log(`Cloned from ${process.cwd()} via fixture`);
    }
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
  } else if (rest[0] === "rm") {
    const name = rest.at(-1)!;
    const flags = rest.slice(1, -1);
    if (process.env.FAKE_OVNFS_UNSUPPORTED_RM_FLAGS && flags.length) {
      console.error("fixture: unknown flag " + flags[0]); process.exit(1);
    }
    const checkout = entries.find(entry => entry.name === name);
    if (checkout && !flags.includes("--force") && process.env.FAKE_OVNFS_PROTECT_COMMITS) {
      const head = Bun.spawnSync([process.env.FAKE_GIT!, "-C", checkout.path, "rev-parse", "HEAD"]);
      if (head.exitCode) throw new Error(head.stderr.toString());
      const refs = Bun.spawnSync([process.env.FAKE_GIT!, "-C", checkout.source, "for-each-ref", "--contains", head.stdout.toString().trim()]);
      if (refs.exitCode || refs.stdout.length === 0) {
        console.error("fixture: checkout has unsaved commits; use --force, ovnfs land, or ovnfs apply");
        process.exit(1);
      }
    }
    remove(name, flags.includes("--sticky-snapshots"));
  } else if (rest[0] === "ls") {
    if (process.env.FAKE_OVNFS_LIST_FAIL) { console.error("fixture listing unavailable"); process.exit(1); }
    console.log(process.env.FAKE_OVNFS_LISTING ?? JSON.stringify({ checkouts: entries, snapshots }));
  } else if (rest[0] === "status") {
    console.log(JSON.stringify({ mount: root }));
  }
  else if (rest[0] === "diff") console.log(process.env.FAKE_OVNFS_DIFF ?? JSON.stringify({ changes: [] }));
  else process.exit(1);
}
