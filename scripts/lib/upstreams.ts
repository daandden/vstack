// Upstream tree listing, shared by every repo script that reads an Upstream at a ref.
//
// Two sources answer the same question ("which entries does this Upstream have at this ref?"):
// - clones: the cached clones under `~/.cache/vstack/upstreams/<key>` (or `VSTACK_UPSTREAMS`), read with
//   `git ls-tree`. Blobless clones are enough: only trees and blob SHAs are read, never blob contents.
// - github: the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`), used in CI.
// Both return git object SHAs, so byte identity is checked by comparing blob SHAs.

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

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
