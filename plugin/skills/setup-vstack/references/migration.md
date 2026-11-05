# Migration

Read this file when step 2 of the project section finds Matt work in this repo. Migration moves this repo's Matt Pocock config, instruction block, rule files, domain files, and private store onto vstack. It changes only this repo and its shared private store under the git common dir. Global skills and global rules stay where they are.

`migrate.ts` stands for `bun "$(realpath skill://setup-vstack/scripts/migrate.ts)"`. Run it from inside the repo. It uses the shipped [House style rows](house-style.yaml) for path and reference changes. Keep that file as replacement data.

Save each later plan JSON unchanged in the run entry from step 2 of SKILL.md, as `<run entry>/plan-<n>.json`. Never read or write a plan in another run's entry. Keep proposed manual diffs separate from that JSON.

## 1. Ask

Call `ask` following `skill://flow-page`'s "Every ask in a Flow" with one question, "This repo has Matt Pocock config. Migrate it to vstack first?", and the options Migrate first (Recommended) and Set up beside it. Name the Matt files in the question. On Set up beside it, keep the read-only plan for Done and go back to step 3 of SKILL.md.

## 2. Mode

The mode question runs here, once, and step 3 of SKILL.md does not ask it again:

- When `project.ts state` reported a mode, keep it. Standard uses the plan that step 2 of SKILL.md made.
- When the plan has a `private-move` or `old-store-delete` item, the repo was Private under Matt. Keep Private, and keep that plan.
- Otherwise call the Standard-or-Private question through `ask` from step 3 of SKILL.md. Standard keeps the plan. Private runs `migrate.ts plan --mode private` and uses that plan. Private leaves the team's tracked Matt config and instruction files alone and writes substituted config under `<common_dir>/vstack/config/`, with private artifact and domain paths.

The mode answer is not approval to write.

## 3. Show the plan

Show every item id, move, diff, manual hit, destructive flag, and notice in one plan:

- Moves: tracked files move with `git mv`, and untracked files with `mv`. House style rows keep hand edits in config, domain, and rule files.
- Code host: when the plan moves or copies config and the remote is on `github.com` or `gitlab.com`, a `code-host` item writes `code-host.md` from setup-vstack's template with the repo filled in. A `code-host.md` in the old config or private store moves as a hand edit, and no seed replaces it. For any other remote, the notice says that step 5's Code host section maps it in this run.
- CI service: Migration does not seed `ci.md`. After application, setup reads state again and asks its CI section in the same run, even when Migration filled the other four config files.
- Conflicts: when old and new config or storage both exist, vstack wins. Show the old-versus-new diff of each `old-delete` and `old-store-delete` item, and offer to delete the old copy. Keep no merged copy. Old storage keeps Migration incomplete until the user approves its deletion. If the vstack store has no `config/`, resolve that first: the helper refuses to delete old storage without it.
- Private move: a `private-move` item is mandatory. It moves the old private store to `<common_dir>/vstack/` for every worktree of this repo, rewrites old paths in it, removes old-store symlinks and their exclude line, and keeps unknown directories. No compatibility link stays, so outside links to old storage break.
- Store rewrite: a `store-rewrite` item rewrites old paths in a ticket, spec, map, or config file under `<common_dir>/vstack/`.
- Manual hits: for every `manual_hits` entry, read the text around it and propose a context-specific diff. A manual hit is a line that names the old store or config with no exact replacement row. Resolve relative private paths against `common_dir`.

## 4. Approve

Publish the complete plan and manual diffs as Results with one approval question offering Apply all (Recommended), Choose items, and Cancel. Follow flow-page's "Every ask in a Flow" contract, then record the observed response separately. On Choose items, publish one round containing one question for the optional item ids and the manual diffs, then call `ask` under that contract. Set `multi: true` on that Flow-authored question. Mandatory ids remain included in the apply set and are not optional choices. On Cancel, write nothing. Go back to step 3 of SKILL.md, as for Set up beside it.

## 5. Apply

Run `migrate.ts apply --plan <absolute plan path>`, with one `--skip <id>` per declined optional item:

- Exit 2 means that the repo changed since the plan, that the plan was made in another checkout, or that a skip named a mandatory id. Nothing was written. Make a fresh plan in this checkout. Publish it for renewed approval as in steps 3 and 4, with `again` on the Flow-authored question, then call `ask` under the common contract. Apply only the approved fresh plan.
- Exit 1 means that the Migration is incomplete: an item failed, or old storage stays. Show `failures` and the remaining work, and stop the run. Setup does not go on.
- Exit 0 means complete. Apply each approved manual diff only after its parent item applied, at its `after_path`. Leave declined manual diffs as remaining hits.

Keep the report's `paths` and the repo-relative path of each applied manual diff outside the git common dir. These are the Migration paths for the Standard commit. Show `applied`, `skipped`, and the remaining manual hits.

Then return to step 2 of SKILL.md, which reads the state again. Keep the mode from step 2 of this file. This run's Migration changed files when it applied any item or manual diff.
