---
name: wizard
description: Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Don't invoke this for steps the agent can perform itself.
---

# Wizard

A **wizard** is a bash script that walks a human, step by step, through a manual procedure that's tedious to do by hand and tedious to re-explain to an AI every time. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, secrets in the CI service), confirms at every stage, and shows how many stages are left. It might configure third-party services, run a one-off migration, or move the project from one state to another.

The delightful UX is already solved by [template.sh](template.sh): stage-by-stage progress, confirmation gates, cross-platform URL opening (including WSL), hidden secret entry, idempotent `.env` upserts, CI secret and variable writes through the CI service's CLI, and a closing summary. **Your job is only to scope the procedure and author its stages.** The library above the `STAGES` marker is identical in every wizard; that consistency is the point: never hand-edit it.

A wizard is ephemeral by default: built for one run, saved to a scratch or `scripts/` path, deleted when the job's done. Commit it only when the user wants a repeatable setup path that should live in the repo.

## The Flow page

Read `skill://flow-page` before the first question or result. Continue the current Flow with a wizard Stage, or start one for a standalone procedure. If an active caller owns this procedure, bind its Stage instead. Record scope and approval questions through the common round and answer contract. A page interaction never substitutes for `ask` or a terminal confirmation.

Publish the ordered procedure and each value's destination as a Document Result. Keep secret names and destinations, never their values, in the Flow, attachments, and evidence. The real bash script remains the executable deliverable. Capture its redacted source as a file attachment and publish a `prototype` Result naming an artifact with `runtime: "terminal"`, the actual `bash <absolute-script-path>` launch command, and its source revision. State that an interactive terminal and the named external services are required using `unavailable`. The page does not run the script, collect secrets, or claim the procedure has completed.

Publish verification and any human-reported outcome beside the launch instructions. Finish this run's Stage after handoff without claiming the human executed the wizard. Leave a caller-owned Stage for the caller to finish. Present the Flow URL and script path without opening a browser or creating a separate report page.

## Process

### 1. Scope the procedure

Work out every manual step the human must take and every value that gets captured along the way. Read the repo first, don't ask cold:

- For setup: `.env`, `.env.example`, `.env.*`, `README`, `docker-compose*`, framework config, and the CI config (`.github/workflows/*`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`, and so on; every secret or variable it references is a value the wizard must produce).
- For a migration or transition: the current state, the target state, and the irreversible actions between them.

Then show the user the ordered list of stages and the values each produces, and confirm it with one `ask`. The user may add, drop, or reorder stages through Other. An answer `ask` picks after a timeout is not the user's: ask once more, and if that times out too, stop without writing the wizard and say why.

**Done when:** every stage is named in order, and for each captured value you know (a) where the human gets it, (b) where it's written (`.env`, a CI service secret or variable, both, or nowhere; some stages are pure actions), and (c) whether it's secret (hidden entry) or public.

### 2. Map each stage's journey

For each stage, write the precise path a human follows: which URL to open, what to do there, where a value is shown, which variable it fills: e.g. "Dashboard → Developers → API keys → Reveal test key → copy". Where you don't actually know the current UI or the exact command, say so and ask the user with `ask` or check the docs: never invent steps that may not exist.

**Done when:** every stage traces to concrete instructions a stranger could follow.

### 3. Author the wizard

Copy `template.sh` to the target path. At the top of the stages section, set `TOTAL_STAGES` to the number of stages you wrote, and set `CI_SERVICE`, `SECRET_CMD`, and `VAR_CMD` from the repo's `ci.md` (`<vstack root>/docs/vstack/ci.md` in Standard mode, `<vstack root>/config/ci.md` in Private mode). Each command is the CLI command of its `set-secret` or `set-variable` row without `<NAME>`. The library appends the name and passes the value on standard input. Leave a command as `()` when its row is an MCP tool, is unsupported, or `ci.md` is missing. Tell the human to add that value by hand in the named CI service, such as Jenkins credentials, and put its URL and instructions in the stage. The wizard lists the value as a hand step in that service's web page. Replace the example stage with one `stage` per step, in dependency order. Use the library helpers: `stage`, `say`, `step`, `open_url`, `ask`, `ask_secret`, `write_env`, `set_secret`, `set_var`, `pause`, and `confirm`.

Hold the bar the template sets: open the URL before asking for its value, use `ask_secret` for anything secret, `write_env` every persisted value, `set_secret` only the values CI actually needs, and `confirm` before any irreversible action. Each `stage` clears the screen so only the current step is visible: keep a stage to one focused task so nothing the human needs scrolls away. Don't touch the library above the marker.

### 4. Verify and hand off

- `bash -n <script>`; run `shellcheck` if available.
- `chmod +x <script>`.
- Don't run it end-to-end yourself: it opens browsers and blocks on human input. Trace it statically instead: every value from step 1 is captured and lands where step 1 said, and every `set_secret` name exactly matches a secret reference in the CI config.
- Publish the launch instructions on the Flow page as above and tell the user how to run the script. If it's a repeatable setup path, commit it only when the user requested that durable deliverable, and link it from the README.
