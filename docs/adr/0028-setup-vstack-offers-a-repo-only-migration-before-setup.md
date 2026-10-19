# setup-vstack offers a repo-only Migration before setup

migrate-to-vstack joins setup-vstack again, and Migration covers only the current repo. At the start of its project section, setup-vstack runs the read-only project plan. When the plan has items or manual hits, it asks whether to migrate the Matt artifacts first. A yes asks the Standard-or-Private question once, applies the approved plan, and then goes on with setup in the same run. A no, or Cancel at the plan gate, sets up beside the Matt files. In Standard mode, one setup commit holds every path that Migration and setup changed. #113 split Migration out because every setup asked for scan roots, scanned `$HOME`, and blocked commits on old Matt storage. Repo-only Migration has none of these costs, so the user wants one entry point that catches a Matt repo on every setup run.

## Considered Options

- Keep migrate-to-vstack as its own skill, or as a hidden helper that setup-vstack reads. Either way two skills describe one job, and the user has to know about the second one.
- Keep the Machine Migration, or a small part of it such as deleting the old private rule and moving diagram profiles. The user wants vstack to change only the repo it runs in.
- Stop after Migration and have the user start a new session, as #76 set. The user wants Migration and setup to finish in one run.
- Leave Migration uncommitted for review, or ask once more before the commit. Migration's Apply gate and setup's Write gate count as the review.
- Add a guard to the Private-mode rule for repos that still have `.git/matt-pocock/`. ADR 0006 rejected that guard, and setup-vstack is already required before the other vstack skills.

## Consequences

- This amends ADR 0006, which records the split into migrate-to-vstack and uncommitted project changes, and ADR 0020, which has migrate-to-vstack seed `code-host.md`. setup-vstack now seeds it during Migration.
- The project plan no longer calls the machine planner. Its private move covers only this repo's git common dir, and it gains the store rewrite for that store's tickets, specs, and maps.
- Matt's global skills, global rules, the old private rule, and diagram profiles in `~/.diagram-design/profiles` stay where they are. A user removes them by hand.
- A Private repo with `.git/matt-pocock/` that has not run setup-vstack still falls back to Standard mode, as ADR 0006 describes. Its first setup-vstack run migrates it.
- After a Private Migration, the tracked Matt files that stay for teammates are not plan items, so later setup runs do not ask again. A declined manual hit asks again on every run until it is resolved.
- Migration can leave every config file in place. It moves the three Matt config files and seeds `code-host.md`. setup-vstack's shortcut from Mode to Done when no config file is missing then applies only when this run's Migration changed nothing. When Migration changed files, the run still reaches Write and makes the one Standard-mode commit. A regression test covers a Matt repo whose Migration fills all four config files.
