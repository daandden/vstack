# pnpm versus Bun for new projects

Research for issue [#454](https://github.com/daandden/vstack/issues/454), checked on 2026-11-11. This explains the choice before the maintainer selects a default. It does not record an accepted decision.

## Package manager and runtime are separate choices

pnpm is a package manager generally used with Node.js applications. It does not replace the application's JavaScript runtime. Do not confuse that with the runtime of pnpm itself. The [current installation guide](https://pnpm.io/installation) identifies pnpm 12 as the current release line and a native executable that can run without Node.js.

Bun is a JavaScript and TypeScript runtime and toolkit, including a package manager, test runner, and bundler. Its [package manager works in existing Node.js projects](https://bun.sh/docs/pm/cli/install). A project can use `bun install` and still run its application with Node.js. Choosing Bun for dependency installation is not permission to move development scripts, tests, or production to the Bun runtime.

The comparison below uses pnpm 12.x documentation and Bun's rolling documentation. Bun's [latest-release endpoint](https://api.github.com/repos/oven-sh/bun/releases/latest) reported [Bun 1.4.4](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4) during this research. Rolling docs can describe changes beyond a pinned release. Check the project's exact version before applying configuration.

## Comparison

| Concern | pnpm | Bun package manager |
| --- | --- | --- |
| Lockfile | Uses `pnpm-lock.yaml`. Workspaces share a root lockfile by default. [Install](https://pnpm.io/cli/install), [workspaces](https://pnpm.io/workspaces#sharedworkspacelockfile). | Uses text `bun.lock` by default since Bun 1.2. Older projects can have binary `bun.lockb`. Bun can migrate other managers' lockfiles, but that capability does not authorize a migration. [Lockfile](https://bun.sh/docs/pm/lockfile). |
| Workspaces | Defines package locations in `pnpm-workspace.yaml`. Supports local `workspace:` dependencies and filtered operations. [Workspaces](https://pnpm.io/workspaces). | Defines workspaces in root `package.json`. Supports local `workspace:` dependencies and filtered installs and scripts. [Workspaces](https://bun.sh/docs/pm/workspaces). |
| Dependency layout | Defaults to an isolated, symlinked layout with a shared content-addressable store. Undeclared dependencies are not exposed as direct project dependencies. Some tools need a different linker. [Motivation](https://pnpm.io/motivation). | Supports hoisted and isolated layouts. Current defaults are isolated for new workspaces and hoisted for new single-package projects. Projects created before Bun 1.3.2 retain hoisted behavior. [Installation strategies](https://bun.sh/docs/pm/cli/install#installation-strategies). |
| Dependency install scripts | Current defaults block unreviewed dependency builds and fail the install through `strictDepBuilds: true`. `pnpm approve-builds` records allow or deny decisions. [Build settings](https://pnpm.io/settings/build), [approval command](https://pnpm.io/cli/approve-builds). | Blocks arbitrary dependency lifecycle scripts, but includes a built-in trusted list for npm packages. An explicit `trustedDependencies` array replaces that list. An empty array trusts no dependency scripts. [Lifecycle scripts](https://bun.sh/docs/pm/lifecycle). |
| Reproducible CI installs | `pnpm install --frozen-lockfile` rejects a missing or outdated lockfile. Frozen mode is automatic in detected CI when a lockfile exists. Match local and CI manager versions. [Install](https://pnpm.io/cli/install#--frozen-lockfile), [CI](https://pnpm.io/continuous-integration). | Use `bun ci` or `bun install --frozen-lockfile`. Bun does not enable frozen mode automatically in CI. Current docs say the flag alone can install without a lockfile, so CI must also require the committed `bun.lock`. [Install](https://bun.sh/docs/pm/cli/install#production-mode). |
| Node ecosystem assumptions | Fits a Node application workflow without changing the application runtime. Its stricter dependency layout can expose undeclared imports or tools that assume flat `node_modules`. [Motivation](https://pnpm.io/motivation). | Installing Node dependencies does not establish Bun runtime compatibility. Bun documents incomplete or different Node APIs, including diagnostics and profiling behavior. Keep Node available when scripts or production require it. [Install](https://bun.sh/docs/pm/cli/install), [runtime compatibility](https://bun.sh/docs/runtime/nodejs-compat). |
| Performance evidence | Documents store reuse, hard links or copy-on-write, and concurrent installation stages. [Motivation](https://pnpm.io/motivation). | Publishes installation-speed claims and examples. Those are vendor measurements, not results for this project or proof of faster application execution. [Install](https://bun.sh/docs/pm/cli/install), [workspace example](https://bun.sh/docs/pm/workspaces). |

Dependency-script approval is version-sensitive. pnpm began blocking dependency lifecycle scripts by default in [v10](https://github.com/pnpm/pnpm.io/blob/main/blog/2025-12-29-pnpm-in-2025.md). Current docs use `allowBuilds` and say v11 removed the older `onlyBuiltDependencies` family. Since v12.11, a configured `permissions` map takes precedence for build decisions. These settings are not interchangeable across all pnpm versions.

Neither manager's dependency approval policy means an install executes no project code. Project lifecycle scripts still run by default. Both document `--ignore-scripts`, but disabling required builds can leave dependencies unusable. Review needed scripts instead of blanket approval or silently bypassing the policy.

## Recommendation for the maintainer

Recommend pnpm for this antfu-inspired new-project default, with Node.js as the application runtime unless the project explicitly chooses another runtime. Anthony Fu's [Use page](https://antfu.me/use#cli) explicitly names pnpm as his preferred package manager, including monorepos. That supports the preference directly. It does not prove that pnpm always outperforms Bun or that Anthony Fu rejects Bun.

Bun remains a reasonable explicit package-manager choice when the team wants it and checks its install behavior, CI setup, and dependency scripts against the actual project. Adopting its runtime is a separate decision that requires application and deployment compatibility evidence.

For either choice, preserve these boundaries:

- Existing `packageManager`, lockfile, and repository tooling take precedence over a new-project default. An explicit request takes precedence over the proposed default. Changing an existing manager requires an explicit migration request.
- Use one manager consistently across local installs, scripts, CI, and dependency updates. Do not alternate pnpm and Bun or generate a second manager's lockfile. Conflicting declarations require resolution, not a guessed migration.
- Pin the chosen manager version and retain its lockfile. If the required manager executable is missing, report the prerequisite. Its absence does not authorize a global installation or substitution.
- [`ni`](https://github.com/antfu-collective/ni) dispatches commands to the detected package manager. It is not a third package manager and does not remove the need to choose one.

## Limitations

Context7 supplied pnpm build-policy and Bun lifecycle-script documentation, cross-checked against the official pages above. No dependencies were installed, no projects were executed, and no tests, builds, or benchmarks were run. Install speed depends on versions, dependency graph, cache state, platform, filesystem, network, and script policy. No relative speed or disk-space result for this project follows from this research.

The maintainer still needs to choose the new-project manager. This recommendation does not settle that choice or authorize a runtime migration.
