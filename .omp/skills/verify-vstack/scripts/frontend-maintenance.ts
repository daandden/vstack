import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const [checkout, evidence, cache] = process.argv.slice(2).map(path => resolve(path));
if (!checkout || !evidence || !cache) throw new Error('Usage: bun maintenance.ts <checkout> <new evidence directory> <upstream cache>');
mkdirSync(evidence, { recursive: false });
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'UI fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'UI fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2026-11-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-02T00:00:00Z' };
const calls: unknown[] = [];
function run(name: string, args: string[], cwd = checkout, input?: string) {
  const r = spawnSync(args[0]!, args.slice(1), { cwd, env, input, encoding: 'utf8' });
  const result = { name, command: args, cwd, exit: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error?.message };
  calls.push(result); writeFileSync(join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  if (r.status !== 0) throw new Error(`${name} failed: ${result.error || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function hashes(root: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (item.name === '.git' || item.name === 'node_modules') continue;
    const path = join(prefix, item.name);
    if (item.isDirectory()) Object.assign(result, hashes(root, path));
    else if (item.isFile()) result[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  }
  return result;
}
const original = hashes(checkout);
const pin = (parse(readFileSync(join(checkout, 'pins.yaml'), 'utf8')) as any).upstreams.emil.pin;
const reg = parse(readFileSync(join(checkout, 'decision-register.yaml'), 'utf8')) as any;
const rows = reg.items.filter((r: any) => r.upstream === 'emil');
const active = rows.find((r: any) => r.id === 'emil/emil-design-eng');
assert(active?.disposition === 'adapt', 'The shipped contribution must remain adapted.');
const registry = JSON.parse(run('register', ['bun', 'scripts/check-register.ts', '--json', '--upstreams', cache]));
assert(registry.ok, 'Integrated register check failed.');
const remote = join(evidence, 'remote', 'emilkowalski', 'skills.git');
mkdirSync(join(remote, '..'), { recursive: true });
run('fixture-source', ['git', 'clone', '--bare', join(cache, 'emil'), remote]);
const git = (name: string, args: string[], input?: string) => run(name, ['git', '--git-dir', remote, ...args], checkout, input);
const oldSkill = git('old-skill', ['show', `${pin}:skills/emil-design-eng/SKILL.md`]);
const changedSkill = oldSkill.replace('100-160ms', '110-160ms');
assert(changedSkill !== oldSkill, 'The fixture must change an actual upstream timing recommendation.');
const blob = git('future-blob', ['hash-object', '-w', '--stdin'], changedSkill + '\n');
function replaceTree(name: string, tree: string, path: string, sha: string) {
  const entries = git(`${name}-read`, ['ls-tree', tree]).split('\n');
  let found = false;
  const next = entries.map(line => {
    const [meta, entry] = line.split('\t');
    if (entry !== path) return line;
    found = true;
    return meta.split(' ').slice(0, 2).join(' ') + ' ' + sha + '\t' + entry;
  }).join('\n') + '\n';
  assert(found, `Missing ${path} in source tree.`);
  return git(`${name}-write`, ['mktree'], next);
}
const itemTree = replaceTree('item', `${pin}:skills/emil-design-eng`, 'SKILL.md', blob);
const skillsTree = replaceTree('skills', `${pin}:skills`, 'emil-design-eng', itemTree);
const rootTree = replaceTree('root', `${pin}^{tree}`, 'skills', skillsTree);
const future = git('future-commit', ['commit-tree', rootTree, '-p', pin], 'Deterministic future-source fixture\n');
git('future-ref', ['update-ref', 'refs/heads/main', future]);
git('future-head', ['symbolic-ref', 'HEAD', 'refs/heads/main']);
const fixture = join(evidence, 'checkout');
mkdirSync(fixture);
for (const path of ['pins.yaml', 'decision-register.yaml', 'house-style.yaml', 'addon-questions.json', 'sample-prompts.json', 'sample-briefs.json', 'CHANGELOG.md', 'plugin']) cpSync(join(checkout, path), join(fixture, path), { recursive: true });
run('fixture-init', ['git', 'init', '-q', '-b', 'main'], fixture);
run('fixture-add', ['git', 'add', '.'], fixture);
run('fixture-baseline', ['git', 'commit', '-qm', 'Bootstrap fixture only'], fixture);
const localBefore = hashes(fixture);
const planFile = run('future-plan', ['bun', join(checkout, 'scripts/vstack-maintain.ts'), 'plan', `emil@${future}`, '--root', fixture, '--upstreams', join(evidence, 'cache'), '--remote', join(evidence, 'remote'), '--scratch', evidence]);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const changed = plan.rows.filter((r: any) => r.class !== 'unchanged');
assert(changed.length === 1 && changed[0].id === active.id && changed[0].class === 'changed', 'The planner must identify exactly the changed UI item.');
assert(changed[0].disposition === 'adapt', 'The future plan lost the adaptation.');
assert(JSON.stringify(changed[0].artifacts) === JSON.stringify(active.artifacts), 'The future plan lost artifact associations.');
assert(plan.artifacts.some((a: any) => a.artifact === active.artifacts[0] && a.rows.includes(active.id)), 'The future plan lost the artifact group.');
assert(plan.new.length === 0 && plan.rows.length === rows.length, 'The future plan lost source coverage.');
const check = JSON.parse(run('future-check', ['bun', join(checkout, 'scripts/vstack-maintain.ts'), 'check', '--root', fixture, '--plan', planFile, '--upstreams', cache]));
assert(check.targets.some((t: any) => t.artifact === active.artifacts[0] && t.dispositions.includes('adapt')), 'Public target check lost adapted classification.');
assert(JSON.stringify(hashes(fixture)) === JSON.stringify(localBefore), 'Planning or check mutated the fixture checkout.');
assert(JSON.stringify(hashes(checkout)) === JSON.stringify(original), 'The future-source proof changed the real checkout or Pin.');
writeFileSync(join(evidence, 'outcome.json'), JSON.stringify({ ok: true, pin, future, plan: planFile, sourceRows: rows.length, changed: changed.map((r: any) => ({ id: r.id, class: r.class, disposition: r.disposition, artifacts: r.artifacts })), realCheckoutUnchanged: true, fixtureCheckoutUnchanged: true, calls: calls.length }, null, 2));
console.log(readFileSync(join(evidence, 'outcome.json'), 'utf8'));
