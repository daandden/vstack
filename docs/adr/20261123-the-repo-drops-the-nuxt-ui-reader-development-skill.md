# The repo drops the nuxt-ui reader development skill

The maintainer chose this while triaging daandden/vstack#533 on 2026-11-19. It amends the Consequences bullet of [ADR 0072](0072-the-flow-reader-uses-nuxt-ui-tailwind-and-vueuse-in-the-catppuccin-look.md) that lists the repo dev skills, which `docs/maintainer.md` calls the reader development skills.

[ADR 20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design](20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design.md) replaced Nuxt UI and Tailwind in the Flow reader with shadcn-vue components on UnoCSS. Nuxt UI guidance no longer matches the reader's stack, and omp offered the `nuxt-ui` skill in every session in this checkout. vstack removes `.omp/skills/nuxt-ui/` and its `skills-lock.json` entry. The other five reader development skills stay: `vue-best-practices`, `vue-debug-guides`, `vue-testing-best-practices`, `create-adaptable-composable`, and `vueuse-functions`.

## Considered Options

- **Keep the skill installed**: rejected. Its Nuxt UI component and theming advice would steer reader work away from the shadcn-vue and UnoCSS choices.

## Consequences

- The "Reader development skills" section of `docs/maintainer.md` lists five skills. Its install and frozen-restore commands no longer name `nuxt-ui`, because a frozen restore installs only locked skills and `mv` fails on a missing directory.
- The skill shipped nowhere, so the change has no Change note or CHANGELOG entry.
