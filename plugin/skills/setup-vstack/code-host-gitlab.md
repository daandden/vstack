# Code host: GitLab

This repo's remote and its merge requests live on GitLab. GitLab calls a PR a merge request (MR) and numbers it by its `iid`. Skills run every Code host operation below through the [`glab`](https://gitlab.com/gitlab-org/cli) CLI, inside a clone of the repo. In `glab api` paths, `:id` is the current project. Pushes and local history stay with git.

- Host: GitLab (`<gitlab.com or the self-hosted host>`)
- Repo: `<group>/<project>`
- Tool: the `glab` CLI
- Check: `glab auth status`
- Review reference in commit titles: `!<iid>`

## Operations

Each skill looks up an operation by its id. A row that says `unsupported` means that the tool cannot do it.

- `default-branch`: `glab api projects/:id`, field `default_branch`.
- `list-prs`: `glab api "projects/:id/merge_requests?state=opened"`. Add `&source_branch=<branch>&target_branch=<base>` to find the MR for one branch.
- `create-pr`: `glab mr create --source-branch <branch> --target-branch <base> --title <title> --description-file <absolute-body-path> --yes`. Leave out `--draft`.
- `edit-pr`: `glab mr update <iid> --title <title> --description-file <absolute-body-path> --yes`
- `retarget-pr`: `glab mr update <iid> --target-branch <branch> --yes`
- `read-pr`: `glab mr view <iid> -F json`, and `glab api projects/:id/merge_requests/<iid>/approvals` for approvals. The head SHA is `sha` and the base SHA is `diff_refs.base_sha`. The MR can merge when `detailed_merge_status` is `mergeable`. A reviewer requests changes when `detailed_merge_status` is `requested_changes`. The MR merged when `state` is `merged`, and its merge commit is `merge_commit_sha` or `squash_commit_sha`.
- `mark-ready`: `glab mr update <iid> --ready --yes`
- `required-checks`: `glab api projects/:id/merge_requests/<iid>/pipelines` for the newest pipeline, then `glab api projects/:id/pipelines/<pipeline-id>/jobs`. Every job with `allow_failure` false is required.
- `watch-checks`: `glab ci status --branch <branch> --wait`
- `review-threads`: `glab api --paginate projects/:id/merge_requests/<iid>/discussions`. Read each discussion's `id` and each note's `id`, `body`, `author`, `resolvable`, `resolved`, and `position.new_path`.
- `reply-thread`: `glab api --method POST projects/:id/merge_requests/<iid>/discussions/<discussion-id>/notes --input <payload.json>`, where the payload is `{"body": "..."}`.
- `resolve-thread`: `glab api --method PUT projects/:id/merge_requests/<iid>/discussions/<discussion-id> -f resolved=true`
- `comment-pr`: `glab api --method POST projects/:id/merge_requests/<iid>/notes --input <payload.json>`, where the payload is `{"body": "..."}`.
- `update-branch`: unsupported. GitLab can only rebase the MR on the host.
- `merge-methods`: `glab api projects/:id`, fields `merge_method` (`merge`, `rebase_merge`, or `ff`) and `squash_option` (`never`, `default_off`, `default_on`, or `always`). The Landing methods are the project's `merge_method` value, allowed unless `squash_option` is `always`, and `squash`, allowed unless `squash_option` is `never`.
- `merge-pr`: for `squash`, `glab mr merge <iid> --sha <head-sha> --squash --auto-merge=false --yes`. For the project's `merge_method`, `glab api --method PUT projects/:id/merge_requests/<iid>/merge -f sha=<head-sha> -F squash=false`. Always send `squash=false` for the project's `merge_method`. `glab mr merge` sends no squash field without `--squash`, and a `default_on` project starts each MR with squash on.
- `auto-merge`: arm with `glab mr merge <iid> --sha <head-sha> --squash --auto-merge --yes` for `squash`, or with the `merge-pr` API call plus `-F auto_merge=true` for the project's `merge_method`. Disarm with `glab api --method POST projects/:id/merge_requests/<iid>/cancel_merge_when_pipeline_succeeds`.
