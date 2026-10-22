# CI service: GitLab CI

This repo's builds and checks run on GitLab CI. Run the CI operations below through the [`glab`](https://gitlab.com/gitlab-org/cli) CLI, inside a clone of the repo. In `glab api` paths, `:id` is the current project. Required MR checks and their status stay in `code-host.md`.

- CI service: GitLab CI
- Host: GitLab (`<gitlab.com or the self-hosted host>`)
- Repo: `<group>/<project>`
- Tool: the `glab` CLI
- Check: `glab auth status`

## Operations

Each skill looks up an operation by its id. A row that says `unsupported` means that the tool cannot do it.

- `ci-logs`: `glab ci trace <job-id>`
- `rerun-ci`: unsupported. GitLab has no command that reruns a whole existing pipeline. `glab ci retry` reruns one job, the pipeline retry API reruns only failed or canceled jobs, and a new pipeline builds the current head of its branch or merge request.
- `set-secret`: `glab variable set <NAME> --masked`, with the value on standard input.
- `set-variable`: `glab variable set <NAME>`, with the value on standard input.
