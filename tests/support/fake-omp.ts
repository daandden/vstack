// A stand-in for the omp CLI, for update-plan tests: the two calls the script makes, with no omp home.
//   omp config get worktree.base   prints $FAKE_OMP_BASE, else "(not set)" as omp does
//   omp wt add -b <branch> <path> <commit>
//                                  makes the worktree with git; with FAKE_OMP_CLONE=1 it also copies the
//                                  checkout's ignored node_modules/ and prints "Cloned from <root> via apfs",
//                                  as omp's clone does; otherwise it is a plain checkout with no such line
// Every call is appended to $FAKE_OMP_LOG as a JSON array of its arguments.

import { appendFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (process.env.FAKE_OMP_LOG) appendFileSync(process.env.FAKE_OMP_LOG, `${JSON.stringify(args)}\n`);

if (args[0] === "config" && args[1] === "get" && args[2] === "worktree.base") {
  console.log(process.env.FAKE_OMP_BASE || "(not set)");
  process.exit(0);
}

if (args[0] === "wt" && args[1] === "add") {
  const rest = args.slice(2);
  const b = rest.indexOf("-b");
  const branch = b >= 0 ? rest.splice(b, 2)[1] : undefined;
  const [path, commit] = rest;
  const cwd = process.cwd();
  const r = Bun.spawnSync(["git", "worktree", "add", ...(branch ? ["-b", branch] : []), path, ...(commit ? [commit] : [])], { cwd, stdout: "pipe", stderr: "pipe" });
  process.stdout.write(r.stdout.toString());
  process.stderr.write(r.stderr.toString());
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
  if (process.env.FAKE_OMP_CLONE === "1") {
    if (existsSync(join(cwd, "node_modules"))) cpSync(join(cwd, "node_modules"), join(path, "node_modules"), { recursive: true });
    console.log(`Cloned from ${cwd} via apfs`);
  }
  process.exit(0);
}

console.error(`fake omp: unsupported call: ${args.join(" ")}`);
process.exit(1);
