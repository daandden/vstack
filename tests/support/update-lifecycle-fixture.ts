import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeUpdateFixture } from "./update-fixture.ts";
import { git, writeFiles } from "./fixture.ts";

export function lifecycleFixture() {
  const f = makeUpdateFixture();
  const root = f.checkout();
  const reg = Bun.YAML.parse(readFileSync(join(root, "decision-register.yaml"), "utf8")) as any;
  for (const row of reg.items) for (const artifact of row.artifacts) {
    if (row.disposition !== "adopt") {
      writeFiles(root, { [`${artifact}/SKILL.md`]: `---\nname: ${artifact.split("/").at(-1)}\ndescription: Fixture skill\n---\nKeep the local contribution.\n` });
      continue;
    }
    const repo = row.upstream === "matt" ? f.mattRepo : f.pstackRepo;
    const ref = row.held_at ?? (row.upstream === "matt" ? "v1.1.0" : f.pstack.c1);
    const path = row.held_path ?? row.path;
    for (const file of git(repo, "ls-tree", "-r", "--name-only", ref, "--", path).split("\n")) {
      const suffix = file.slice(path.length + 1);
      if (suffix === "agents/openai.yaml") continue;
      writeFiles(root, { [`${artifact}/${suffix}`]: git(repo, "show", `${ref}:${file}`) + "\n" });
    }
  }
  writeFiles(root, { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n" });
  git(root, "add", "-A"); git(root, "commit", "-qm", "installed baseline");
  return { ...f, root };
}
