import { ConfigError } from "../vstack-repo.ts";
import type { CheckContext } from "./types.ts";

export function git(root: string, args: string[]) {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString().trim() };
}

export function resolveBase(ctx: CheckContext): { sha?: string; label: string } {
  const given = ctx.baseRef?.trim();
  if (given && !/^0+$/.test(given)) {
    const r = git(ctx.root, ["rev-parse", "--verify", "--quiet", `${given}^{commit}`]);
    if (!r.ok) throw new ConfigError(`repository-check base ${given} is not a commit in ${ctx.root}`);
    return { sha: r.out, label: `${given} (given)` };
  }
  const mb = git(ctx.root, ["merge-base", "HEAD", "origin/HEAD"]);
  if (mb.ok && mb.out) return { sha: mb.out, label: "merge base of HEAD and origin/HEAD" };
  const head = git(ctx.root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head.ok) return { sha: head.out, label: "HEAD (no origin/HEAD; only uncommitted changes count)" };
  return { label: "none (no commits)" };
}
