import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  writeFiles(root, {
    "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n",
    "principle-questions.json": JSON.stringify({ expected: { type: "noul", instructions: "Expected" }, other: { type: "noul", instructions: "Other" } }),
    "sample-prompts.json": JSON.stringify({ prompts: [{ id: "sample", prompt: "Fix this", expected: ["expected"], allowed: [] }] }),
  });
  git(root, "add", "-A"); git(root, "commit", "-qm", "installed baseline");
  const calls = join(f.dir, "calls.jsonl"); writeFileSync(calls, "");
  function executable(name: string, source: string) {
    const file = join(f.dir, name + ".ts"); writeFileSync(file, source);
    const exe = join(f.dir, name); writeFileSync(exe, `#!/bin/sh\nexec "${process.execPath}" "${file}" "$@"\n`); chmodSync(exe, 0o755); return exe;
  }
  const gh = executable("gh", `import { appendFileSync } from "node:fs"; const args = process.argv.slice(2); appendFileSync(${JSON.stringify(calls)}, JSON.stringify(["gh", ...args])+"\\n"); console.log(args[0] === "api" ? process.env.RELEASES ?? "[[]]" : args[1] === "list" ? process.env.OPEN_PR ?? "[]" : "https://example.invalid/pull/98");`);
  const push = executable("push", `import { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(calls)}, JSON.stringify(["push", ...process.argv.slice(2)])+"\\n"); if(process.env.FAIL_PUSH) process.exit(1);`);
  const smoke = executable("smoke", `import { readdirSync } from "node:fs"; import { join } from "node:path"; if(process.env.FAIL_SMOKE) process.exit(1); console.log(JSON.stringify({ skillCommands: readdirSync(join(process.argv[2], "skills")), agents: [], genericRules: "", tools: (process.env.SMOKE_TOOLS ?? "").split(",").filter(Boolean), warnings: [] }));`);
  async function planned(selection: string[] = []) {
    const result = await f.run(root, selection, { FAKE_OMP_CLONE: "1" });
    if (result.code !== 0) throw new Error(result.stderr);
    const plan = result.plan;
    const decisions = plan.rows.filter((r: any) => r.class !== "unchanged").map((r: any) => ({ id: r.id, action: ["adapt", "merge"].includes(r.disposition) || ["moved", "removed"].includes(r.class) ? "hold" : "accept", reason_check: "Reason still holds." }));
    const fresh = plan.new[0];
    const draft = join(plan.out, "drafts/fresh"); mkdirSync(draft, { recursive: true });
    writeFileSync(join(draft, "SKILL.md"), "---\nname: fresh\ndescription: Fresh fixture\n---\nRead the local files.\n");
    decisions.push({ id: "matt/fresh", upstream: "matt", path: fresh.path, action: "accept", disposition: "adapt", reason: "Use local files.", reason_check: "New item fits.", artifacts: ["plugin/skills/fresh"], drafts: { "plugin/skills/fresh": draft } } as any);
    for (const n of plan.new.slice(1)) decisions.push({ id: `${n.upstream}/new-${n.path.split("/").at(-1)}`, upstream: n.upstream, path: n.path, action: "defer", gist: "Review later.", reason_check: "Deferred new item." } as any);
    const file = join(plan.out, "choices.json"); writeFileSync(file, JSON.stringify({ decisions }));
    return { plan, decisions, file, planFile: join(plan.out, "plan.json") };
  }
  return { ...f, root, gh, push, smoke, calls: () => readFileSync(calls, "utf8").split("\n").filter(Boolean).map(s => JSON.parse(s)), planned };
}
