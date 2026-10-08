// Upstream tree listing, shared by every repo script that reads an Upstream at a ref.
//
// Two sources answer the same question ("which entries does this Upstream have at this ref?"):
// - clones: the cached clones under `~/.cache/vstack/upstreams/<key>` (or `VSTACK_UPSTREAMS`), read with
//   `git ls-tree`. Blobless clones are enough: only trees and blob SHAs are read, never blob contents.
// - github: the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`), used in CI.
// Both return git object SHAs, so byte identity is checked by comparing blob SHAs.
//
// The clone helpers below (syncClone, newestTag, newestCommit, resolveRef, readBlobs, renamePairs) are for
// update-plan, the one script that fetches. Neither source fetches, and nothing here moves a clone's HEAD.

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export type EntryType = "blob" | "tree" | "commit";

export interface TreeEntry {
  /** Path from the Upstream repo root, no leading or trailing slash. */
  path: string;
  type: EntryType;
  mode: string;
  sha: string;
}

export interface UpstreamRef {
  /** Pin key, also the clone directory name: matt, pstack, diagram, css, prose. */
  key: string;
  /** GitHub `owner/name`. */
  repo: string;
}

export class UpstreamTree {
  readonly byPath: Map<string, TreeEntry>;
  constructor(
    readonly commit: string,
    readonly entries: TreeEntry[],
  ) {
    this.byPath = new Map(entries.map((e) => [e.path, e]));
  }

  get(path: string): TreeEntry | undefined {
    return this.byPath.get(trimSlashes(path));
  }

  /** Blobs under a tree path, with paths relative to that tree. A blob path returns itself under its base name. */
  blobsUnder(path: string): TreeEntry[] {
    const root = trimSlashes(path);
    const self = this.byPath.get(root);
    if (self?.type === "blob") return [{ ...self, path: root.slice(root.lastIndexOf("/") + 1) }];
    const prefix = `${root}/`;
    return this.entries
      .filter((e) => e.type === "blob" && e.path.startsWith(prefix))
      .map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
  }
}

/** Raised when a source cannot answer (clone missing, ref unknown, API error). Not a register failure. */
export class UpstreamError extends Error {}

export interface UpstreamSource {
  readonly name: "clones" | "github";
  /** Full recursive listing (trees and blobs) of the Upstream repo at `ref` (tag, branch, or SHA). */
  tree(upstream: UpstreamRef, ref: string): Promise<UpstreamTree>;
}

export function defaultUpstreamsDir(): string {
  return process.env.VSTACK_UPSTREAMS || join(homedir(), ".cache", "vstack", "upstreams");
}

/** Where clones come from: `<remote>/<owner>/<name>.git`. `VSTACK_UPSTREAM_REMOTE` replaces https://github.com. */
export function defaultUpstreamRemote(): string {
  return process.env.VSTACK_UPSTREAM_REMOTE || "https://github.com";
}

function trimSlashes(p: string): string {
  return p.replace(/^\/+|\/+$/g, "");
}

function memoize(fetch: (u: UpstreamRef, ref: string) => Promise<UpstreamTree>) {
  const cache = new Map<string, Promise<UpstreamTree>>();
  return (u: UpstreamRef, ref: string) => {
    const k = `${u.key}\0${ref}`;
    let p = cache.get(k);
    if (!p) {
      p = fetch(u, ref);
      cache.set(k, p);
    }
    return p;
  };
}

/** Lists trees from cached clones under `dir/<key>`. Never fetches, checks out, or moves HEAD. */
export function cloneSource(dir: string): UpstreamSource {
  const git = (cwd: string, args: string[]) => {
    const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
    return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString().trim() };
  };
  return {
    name: "clones",
    tree: memoize(async (u, ref) => {
      const clone = join(dir, u.key);
      if (!existsSync(clone)) {
        throw new UpstreamError(
          `no clone of ${u.key} at ${clone}; run: git clone --filter=blob:none https://github.com/${u.repo}.git ${clone}`,
        );
      }
      const rev = git(clone, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      if (!rev.ok) {
        throw new UpstreamError(`ref ${ref} not found in the ${u.key} clone; run: git -C ${clone} fetch --tags origin`);
      }
      const commit = rev.out.trim();
      const ls = git(clone, ["ls-tree", "-r", "-t", "-z", "--full-tree", commit]);
      if (!ls.ok) throw new UpstreamError(`git ls-tree failed in ${clone}: ${ls.err}`);
      const entries: TreeEntry[] = [];
      for (const rec of ls.out.split("\0")) {
        if (!rec) continue;
        const tab = rec.indexOf("\t");
        const [mode, type, sha] = rec.slice(0, tab).split(" ");
        entries.push({ path: rec.slice(tab + 1), type: type as EntryType, mode, sha });
      }
      return new UpstreamTree(commit, entries);
    }),
  };
}

/** Lists trees through the GitHub REST API. `apiUrl` defaults to `GITHUB_API_URL` (set in Actions). */
export function githubSource(opts: { apiUrl?: string; token?: string } = {}): UpstreamSource {
  const api = (opts.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
  const token = opts.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const get = async (path: string): Promise<any> => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vstack-check-register",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${api}${path}`, { headers });
    } catch (e) {
      throw new UpstreamError(`GitHub API request ${path} failed: ${(e as Error).message}`);
    }
    if (!res.ok) throw new UpstreamError(`GitHub API ${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  return {
    name: "github",
    tree: memoize(async (u, ref) => {
      const c = await get(`/repos/${u.repo}/commits/${encodeURIComponent(ref)}`);
      const t = await get(`/repos/${u.repo}/git/trees/${c.commit.tree.sha}?recursive=1`);
      if (t.truncated) throw new UpstreamError(`GitHub truncated the tree listing of ${u.repo} at ${ref}`);
      const entries: TreeEntry[] = t.tree.map((e: any) => ({ path: e.path, type: e.type, mode: e.mode, sha: e.sha }));
      return new UpstreamTree(c.sha, entries);
    }),
  };
}

/** Git blob SHA-1 of file contents, equal to the SHA an Upstream tree lists for the same bytes. */
export function gitBlobSha(bytes: Uint8Array): string {
  const h = new Bun.CryptoHasher("sha1");
  h.update(`blob ${bytes.byteLength}\0`);
  h.update(bytes);
  return h.digest("hex");
}

function gitIn(cwd: string, args: string[], opts: { env?: Record<string, string>; stdin?: Uint8Array } = {}) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdin: opts.stdin,
    stdout: "pipe",
    stderr: "pipe",
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), bytes: r.stdout as Uint8Array, err: r.stderr.toString().trim() };
}

function mustGit(cwd: string, args: string[], what: string) {
  const r = gitIn(cwd, args);
  if (!r.ok) throw new UpstreamError(`${what} failed in ${cwd}: git ${args.join(" ")}: ${r.err}`);
  return r.out;
}

/**
 * Makes `dir/<key>` a blobless clone of the Upstream and brings it up to date: clones it when missing
 * (`--filter=blob:none --no-checkout`), else fetches branches and tags and refreshes `origin/HEAD`.
 * Returns the clone path. Never checks out or moves HEAD.
 */
export function syncClone(dir: string, u: UpstreamRef, remote: string): { clone: string; created: boolean } {
  const clone = join(dir, u.key);
  if (!existsSync(clone)) {
    mkdirSync(dir, { recursive: true });
    const url = `${remote.replace(/\/+$/, "")}/${u.repo}.git`;
    mustGit(dir, ["clone", "--quiet", "--filter=blob:none", "--no-checkout", url, clone], `cloning ${u.key}`);
    return { clone, created: true };
  }
  mustGit(clone, ["fetch", "--quiet", "--tags", "--force", "origin"], `fetching ${u.key}`);
  mustGit(clone, ["remote", "set-head", "origin", "--auto"], `refreshing origin/HEAD of ${u.key}`);
  return { clone, created: false };
}

const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** Orders two `v<semver>` tags; anything else sorts before every semver tag. */
export function compareSemverTags(a: string, b: string): number {
  const pa = SEMVER_TAG.exec(a)?.slice(1).map(Number);
  const pb = SEMVER_TAG.exec(b)?.slice(1).map(Number);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** The highest `v<major>.<minor>.<patch>` tag; pre-release and other tags (`mattpocock-skills@1.0.0`) never count. */
export function newestTag(clone: string): string | undefined {
  const tags = mustGit(clone, ["tag", "--list", "v*"], "listing tags").split("\n").filter((t) => SEMVER_TAG.test(t));
  return tags.sort(compareSemverTags).at(-1);
}

/** Full SHA of the newest commit on the remote's default branch (`origin/HEAD`) that touches `path` ("" = any). */
export function newestCommit(clone: string, path: string): string {
  const head = gitIn(clone, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/HEAD^{commit}"]);
  if (!head.ok) throw new UpstreamError(`no origin/HEAD in ${clone}; run: git -C ${clone} remote set-head origin --auto`);
  const args = ["rev-list", "-1", "refs/remotes/origin/HEAD"];
  if (path) args.push("--", path);
  const sha = mustGit(clone, args, "finding the newest commit").trim();
  if (!sha) throw new UpstreamError(`no commit on origin/HEAD touches ${path} in ${clone}`);
  return sha;
}

/** Full commit SHA of a ref, or undefined when the clone does not have it. */
export function resolveRef(clone: string, ref: string): string | undefined {
  const r = gitIn(clone, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.ok ? r.out.trim() : undefined;
}

/** Whether `refs/tags/<tag>` exists in the clone. */
export function hasTag(clone: string, tag: string): boolean {
  return gitIn(clone, ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok;
}

/** Whether commit `a` is an ancestor of (or equal to) commit `b`. */
export function isAncestor(clone: string, a: string, b: string): boolean {
  return gitIn(clone, ["merge-base", "--is-ancestor", a, b]).ok;
}

/**
 * Contents of blobs by SHA. A blobless clone lacks them: the missing ones are fetched from origin in one
 * request first (what git's own lazy fetch does per object), then read with `git cat-file --batch`.
 */
export function readBlobs(clone: string, shas: Iterable<string>): Map<string, Uint8Array> {
  const list = [...new Set(shas)];
  const out = new Map<string, Uint8Array>();
  if (list.length === 0) return out;
  const stdin = new TextEncoder().encode(`${list.join("\n")}\n`);
  const check = gitIn(clone, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], { stdin, env: { GIT_NO_LAZY_FETCH: "1" } });
  const missing = check.out.split("\n").filter((l) => l.endsWith(" missing")).map((l) => l.split(" ")[0]);
  if (missing.length > 0) {
    // Best effort: when the server refuses, cat-file below still fetches each blob lazily.
    gitIn(clone, ["-c", "fetch.negotiationAlgorithm=noop", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--recurse-submodules=no", "--filter=blob:none", "origin", ...missing]);
  }
  const r = gitIn(clone, ["cat-file", "--batch"], { stdin });
  if (!r.ok) throw new UpstreamError(`git cat-file failed in ${clone}: ${r.err}`);
  const buf = r.bytes;
  let pos = 0;
  for (const sha of list) {
    const nl = buf.indexOf(10, pos);
    const header = new TextDecoder().decode(buf.subarray(pos, nl));
    const [, type, size] = header.split(" ");
    if (type !== "blob") throw new UpstreamError(`blob ${sha} is not readable in ${clone} (${header})`);
    const start = nl + 1;
    out.set(sha, buf.slice(start, start + Number(size)));
    pos = start + Number(size) + 1;
  }
  return out;
}

export interface RenamePair {
  from: string;
  to: string;
  /** git's similarity index, 50 to 100. */
  similarity: number;
}

/**
 * git rename detection between two commits, limited to the given paths: each pair is a file deleted at
 * `from` and added at `to` whose contents are at least `threshold`% similar.
 */
export function renamePairs(clone: string, from: string, to: string, paths: string[], threshold = 50): RenamePair[] {
  if (paths.length === 0) return [];
  const out = mustGit(
    clone,
    ["--literal-pathspecs", "diff", "-z", "--name-status", `--find-renames=${threshold}%`, "--diff-filter=R", from, to, "--", ...paths],
    "detecting renames",
  );
  const tokens = out.split("\0");
  const pairs: RenamePair[] = [];
  for (let i = 0; i + 2 < tokens.length; i += 3) {
    pairs.push({ from: tokens[i + 1], to: tokens[i + 2], similarity: Number(tokens[i].slice(1)) });
  }
  return pairs;
}
