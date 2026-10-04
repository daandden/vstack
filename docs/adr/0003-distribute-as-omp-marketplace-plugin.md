# Distribute vstack as an omp marketplace plugin

> The install channel (the `daandden` marketplace) is superseded by [ADR 0005](0005-install-by-plugin-link-from-a-clone.md): vstack is installed by `omp plugin link` from a local clone. The rest of this ADR, shipping vstack as one omp plugin instead of using the `skills` CLI, still stands.

The Base upstream is installed with the `skills` CLI, but vstack ships as an omp marketplace plugin instead. The repo is the `daandden` marketplace (`.omp-plugin/marketplace.json`), and `./plugin` holds one plugin, `vstack`. We chose this because vstack needs to ship custom agents (Fan-out has to run on the parent's model), rules, and an `/vstack:update` command alongside its skills. `skills` CLI 1.7.0 installs only `SKILL.md` directories, and omp discovers custom agents only from `.omp` directories or plugins.

## Considered Options

- **`skills` CLI into `~/.agents/skills`** (Matt's channel): rejected. It cannot ship agents, rules, or commands. Local-source installs leave stale Matt lock entries that a later `update` silently restores, and its update step adds symlinks for every detected agent.
- **Local clone plus `skills.customDirectories`**: rejected. Every machine needs its own config, and agents and rules would need separate symlinks into `~/.omp`.

## Consequences

- Skills must be flat (`plugin/skills/<name>/SKILL.md`) because omp scans one level deep.
- Plugin skills (priority 90) outrank leftover `~/.agents/skills` copies (priority 70) with the same name, so Migration can remove Matt's copies without racing them.
