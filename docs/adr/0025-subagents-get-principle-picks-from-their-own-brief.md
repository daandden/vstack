# Subagents get principle picks from their own brief

During a Matt run, the jev judge also runs in a subagent session of `vstack-explorer`, `vstack-worker`, or `vstack-verifier`. It reads the subagent's brief and asks principle questions only. A constant in the extension lists these three agents. `vstack-diagram-drawer` and `vstack-comment-critic` get no picks. Neither do omp's own agents, such as `task` and `scout`, or `/tan` clones. The subagent runs the judge only when the top-level session that started it, found through the `parentId` chain, is in a Matt run. It judges only its first prompt, the brief. jev reads the brief without omp's `Complete assignment thoroughly:` line. The brief goes through the cleaner's stages, but the cleaner squeezes it to 10,000 characters, not 2,000, so the task data after a long role template reaches jev. No `smol` restatement runs. The request asks 20 principle questions: every principle except never-block-on-the-human. Its state holds the catalog's `brief_preamble`, which says that `request` is a task brief that an agent wrote for a subagent. The deadline is the main session's 4 seconds with one retry, and a failure skips the picks silently. The hidden message names the picks and says to ignore any that do not fit. It does not say which rule wins. We chose this because ADR 0022 makes implement-spec's main agent only orchestrate, so the workers that write the code never saw the principles that their run needed.

## Considered Options

- Pass the parent's principle picks to each subagent. Every subagent gets the same list whether it fits its slice or not, and the saved picks include earlier Matt runs on the branch.
- Have the parent write `skill://principle-*` pointers into each brief. This depends on the agent following a pointer, which ADR 0002 rejected for principles.
- List fixed principles in each agent file. ADR 0002 rejected an always-on list.
- Restate the brief with `smol` first, as ADR 0021 does for a mid-session start. The user chose the brief itself, with no second model call.
- Send the brief through today's 2,000-character cleaner. For a long brief, it keeps only the role template, which is the same for every run of a step. ADR 0018 dropped skill text from judge input for the same reason.
- Ask all 35 Addon questions. The 14 non-principle Addons, such as ship, open-pr, benchmark-checklist, and decision-trail, carry knowledge for the parent's run, not advice on how a subagent works.
- Judge the comment-critic, with all principles or with an allowlist. Its only caller, prune-comments, rejects application-code edits, and several principles push toward them.
- Mark judged agents with a frontmatter key. omp drops unknown frontmatter keys, so the extension then needs to parse agent files itself.
- Keep the main session's sentence that the running Matt skill wins. A subagent runs no Matt skill, and the user chose no precedence sentence in subagents.

## Consequences

- This amends ADR 0002 and ADR 0018, which skipped subagent sessions. ADR 0002's rule that a skill names the principles for each brief no longer holds. A skill step that cites a principle for that step keeps its citation, such as the forensics parser brief.
- A new vstack agent gets no picks until its name joins the constant in the extension.
- Each subagent is its own session, so its first prompt has no earlier picks to leave out. The main session's once-per-session rule does not carry over to its subagents.
- A brief corpus sits beside `sample-prompts.json`, with its own baselines. Its samples are real briefs copied from saved omp sessions of past Matt runs, with private paths removed. Some spawn lines have no sample until a run uses them. `scripts/addon-judge-check.ts` takes the corpus path, and for brief samples it uses the brief cleaner, `brief_preamble`, and the 20 subagent questions.
- The check flags an unexpected, non-allowed pick over 0.85, not 0.80, in both corpora, because `verifier-ship-pr` scored `principle-encode-the-domain` at 0.81 on a brief that does not fit it. Scores from 0.65 through 0.85 are borderline. With fresh baselines from 3 runs per sample on jev-1.13.0, 17/17 briefs passed with 0 flags and 27 borderline, and 131/131 prompts passed with 0 flags and 93 borderline. This amends ADR 0024.
- check-register fails a sample in `sample-briefs.json` with an empty `prompt`, or with an `expected` or `allowed` label that is not one of the 20 subagent questions.
- The questions that name "the user" stay the same text for both paths. `brief_preamble` tells jev to read "the user" as the brief's author.
- A fan-out of N parts sends N jev requests at once. Each part waits at most 4 seconds before its first turn.
