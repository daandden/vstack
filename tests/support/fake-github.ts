// A local stand-in for the two GitHub REST endpoints the github Upstream source calls, answered from the
// fixture Upstream repos: `<dir>/<name>` serves `fixture/<name>`.

import { join } from "node:path";
import { git } from "./fixture.ts";

export function fakeGitHub(dir: string) {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      let m = url.pathname.match(/^\/repos\/fixture\/([^/]+)\/commits\/(.+)$/);
      if (m) {
        const repo = join(dir, m[1]);
        const ref = decodeURIComponent(m[2]);
        try {
          return Response.json({ sha: git(repo, "rev-parse", `${ref}^{commit}`), commit: { tree: { sha: git(repo, "rev-parse", `${ref}^{tree}`) } } });
        } catch {
          return Response.json({ message: "No commit found" }, { status: 422 });
        }
      }
      m = url.pathname.match(/^\/repos\/fixture\/([^/]+)\/git\/trees\/([0-9a-f]{40})$/);
      if (m && url.searchParams.get("recursive") === "1") {
        const tree = git(join(dir, m[1]), "ls-tree", "-r", "-t", "--full-tree", m[2])
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [meta, path] = line.split("\t");
            const [mode, type, sha] = meta.split(" ");
            return { path, mode, type, sha };
          });
        return Response.json({ sha: m[2], tree, truncated: false });
      }
      return Response.json({ message: "Not Found" }, { status: 404 });
    },
  });
}
