import { appendFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const root = process.env.FAKE_OVNFS_ROOT!;
const stateFile = join(root, "checkouts.json");
const entries: { name: string; path: string; source: string; dirty: boolean }[] = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : [];
const save = () => writeFileSync(stateFile, JSON.stringify(entries));
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
    const path = join(root, name);
    git(root, "clone", "--no-hardlinks", source, path);
    if (rest.includes("--rev")) git(path, "checkout", "--detach", rest[rest.indexOf("--rev") + 1]);
    else cpSync(join(source, "tracked"), join(path, "tracked"));
    if (existsSync(join(source, "node_modules"))) cpSync(join(source, "node_modules"), join(path, "node_modules"), { recursive: true });
    const checkout = { name, path, source, dirty: false }; entries.push(checkout); save();
    console.log(JSON.stringify({ checkout }));
  } else if (rest[0] === "rm") {
    const i = entries.findIndex(e => e.name === rest[1]);
    if (i < 0) process.exit(1);
    rmSync(entries[i].path, { recursive: true }); entries.splice(i, 1); save(); console.log("{}");
  } else if (rest[0] === "ls") {
    if (process.env.FAKE_OVNFS_LIST_FAIL) { console.error("fixture listing unavailable"); process.exit(1); }
    console.log(process.env.FAKE_OVNFS_LISTING ?? JSON.stringify({ checkouts: entries, snapshots: [] }));
  }
  else if (rest[0] === "diff") console.log(JSON.stringify({ changes: [] }));
  else process.exit(1);
}
