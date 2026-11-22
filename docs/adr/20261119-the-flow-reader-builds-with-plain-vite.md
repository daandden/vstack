# The Flow reader builds with plain Vite

The maintainer chose this while triaging #530 on 2026-11-19. It replaces the Vite+ tooling part of [ADR 0049](0049-flow-reader-uses-nuxt-with-vite-plus-on-bun.md). Nuxt, Nuxt UI ([ADR 0072](0072-the-flow-reader-uses-nuxt-ui-tailwind-and-vueuse-in-the-catppuccin-look.md)), the Nitro Bun preset, and Bun as the production runtime ([ADR 20261116-the-flow-page-is-a-fullstack-nuxt-app-on-local-sqlite](20261116-the-flow-page-is-a-fullstack-nuxt-app-on-local-sqlite.md)) stay as decided.

The repo drops the Vite+ dev dependency and the root `overrides` entry that replaced `vite` with Vite+'s core fork. Nuxt now loads upstream Vite in the version its `@nuxt/vite-builder` range resolves. The reader used none of Vite+'s own features. The `vp` script runner in the `check-register` workflow only started the package script that `bun run reader:build` runs, which calls Nuxt's own CLI and then `Bun.build`. Nuxt did bundle the reader with Vite+'s core fork, but only because the override put that fork where `vite` should be. Upstream Vite meets Nuxt's range and builds the reader from the same source. The dependency and the forked `vite` still cost an extra toolchain in `bun.lock` and a Vite that Nuxt and every Vite plugin loaded from Vite+'s releases instead of upstream.

ADR 0072 rejected plain Vite because the switch changed ADR 0049's tooling for no reader gain. Keeping Vite+ brings no reader gain either, so the rejection no longer argues for keeping a dependency whose own features the build does not use.

The "not built" errors of the Local Flow host and the stale-reader message in CI now tell the user to run `bun run reader:build`.
