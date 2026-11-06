// Stands in for `omp worktree list --json` at the omp CLI boundary: lists every dir directly under
// $OMP_WORKTREE_DIR, except the names in $FAKE_OMP_HIDE (comma-separated). $FAKE_OMP_FAIL makes it fail.
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.join(" ") === "config get ovnfs.path") {
  console.log(process.env.FAKE_OVNFS_PATH ?? "(not set)");
  process.exit(0);
}
if (args.join(" ") === "config get worktree.base" && process.env.FAKE_OMP_BASE !== undefined) {
  console.log(process.env.FAKE_OMP_BASE);
  process.exit(0);
}
if (args.join(" ") !== "worktree list --json" || process.env.FAKE_OMP_FAIL) {
  console.error(`fake omp cannot run: ${args.join(" ")}`);
  process.exit(1);
}
if (process.env.FAKE_OMP_LISTING !== undefined) {
  console.log(process.env.FAKE_OMP_LISTING);
  process.exit(0);
}
const base = process.env.OMP_WORKTREE_DIR!;
const hidden = new Set((process.env.FAKE_OMP_HIDE ?? "").split(",").filter(Boolean));
let names: string[] = [];
try {
  names = readdirSync(base);
} catch {
  // omp lists nothing for a base that does not exist.
}
const entries = names.filter((n) => !hidden.has(n) && lstatSync(join(base, n)).isDirectory()).map((n) => ({ path: join(base, n), kind: "pr-checkout" }));
console.log(JSON.stringify(entries));
