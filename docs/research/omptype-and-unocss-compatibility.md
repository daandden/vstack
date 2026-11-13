# omptype validation and shadcn-vue with UnoCSS

Research for issue [#454](https://github.com/daandden/vstack/issues/454), checked on 2026-11-11. The maintainer selected shadcn-vue, UnoCSS, UnoCSS icons, TanStack Form and Table, optional Pinia and Vue Query, motion-v, Unovis Vue, TresJS, and Bun. Whether omptype replaces the proposed Valibot default remains open.

## Can omptype replace Valibot?

For runtime schemas and TanStack Form's validation protocol, it is a credible candidate. It is not a Valibot source-compatible replacement.

The [omptype README](https://github.com/can1357/oh-my-pi/blob/679691a78141de0dd6ba1b7a5d5c1b1d7d967a63/packages/omptype/README.md) documents ArkType-style schemas, inferred input and output types, refinements, transforms, nested error paths, and JSON Schema import and export. There is no runtime dependency on ArkType or Zod. Compatibility facades are omptype APIs, not proof that every upstream ecosystem integration works.

The [public type contract](https://github.com/can1357/oh-my-pi/blob/679691a78141de0dd6ba1b7a5d5c1b1d7d967a63/packages/omptype/src/type.ts#L97-L178) and [implementation](https://github.com/can1357/oh-my-pi/blob/679691a78141de0dd6ba1b7a5d5c1b1d7d967a63/packages/omptype/src/type.ts#L1059-L1083) expose Standard Schema V1 through `~standard`, returning a value or issues with messages and paths. [TanStack Form's Vue validation guide](https://tanstack.com/form/latest/docs/framework/vue/guides/validation) accepts Standard Schema validators directly. Its [current adapter](https://github.com/TanStack/form/blob/main/packages/form-core/src/standardSchemaValidator.ts) consumes that interface and distributes form issues by path.

This establishes a source-level integration path without a custom adapter. It does not establish a tested Vue application. Field error rendering and type inference still need real integration proof.

TanStack Form does not replace submitted input with a schema's transformed output. If omptype defaults or transforms matter, validate or parse explicitly at the submission boundary and use that returned value. This limitation also applies to other Standard Schema libraries in TanStack Form.

## Browser constraints matter

The ordinary omptype `type(...)` path interprets its first two validations and [attempts compilation on the third call](https://github.com/can1357/oh-my-pi/blob/679691a78141de0dd6ba1b7a5d5c1b1d7d967a63/packages/omptype/src/type.ts#L1146-L1165). The compiler uses `new Function`, but its [exported wrappers](https://github.com/can1357/oh-my-pi/blob/679691a78141de0dd6ba1b7a5d5c1b1d7d967a63/packages/omptype/src/compile.ts#L1101-L1157) catch `EvalError`, remember that code generation is blocked, and fall back to interpreted validation. Both ordinary validation and the boolean validation path have this fallback. Source inspection therefore does not support treating strict CSP as an automatic blocker.

Correction to the first research revision: it inspected the lazy caller and code generator but missed the exported compiler wrappers. Its conclusion that ordinary schemas lacked a CSP fallback was wrong. `ScopeOptions` declares `jitless`, but no use of that option was found. The actual fallback is the compiler's `EvalError` handling, not a proven `jitless` configuration recipe. The changelog's narrower `fromJsonSchema` entry is not the complete source contract.

The [published npm metadata](https://registry.npmjs.org/@oh-my-pi%2Fomptype/latest) reports version 18.18.8, compiled ESM and declaration exports, a Bun source condition, Node >=20 and Bun >=1.4.4. Published entry points differ from the source package manifest. A Bun package-manager choice alone does not prove browser or edge-runtime compatibility. No frontend bundle-size comparison was measured.

Do not weaken a target's CSP to make a validator work. If omptype becomes the default, verify current-version browser bundling, form errors, transformed submission values, repeated validation, and the target's actual policy. The source fallback is promising, but no browser integration has been executed here. Report incompatibility rather than silently changing validators or claiming successful setup.

## shadcn-vue with UnoCSS needs adaptation

The [official shadcn-vue manual setup](https://www.shadcn-vue.com/docs/installation/manual) uses Tailwind CSS, theme variables, Tailwind directives, and animation styles. The [Vite setup](https://www.shadcn-vue.com/docs/installation/vite) installs the Tailwind Vite plugin. Replacing its name with UnoCSS is not an established recipe in those sources.

[UnoCSS presetWind4](https://unocss.dev/presets/wind4) supplies Tailwind-style utility compatibility, reset configuration, and theme-variable generation. It does not by itself prove that every generated shadcn-vue directive, variant, or animation behaves identically.

Honor the selected combination by adapting copied components, theme tokens, utility variants, animations, icon integration, and extraction to UnoCSS. Do not leave Tailwind running silently as a second styling system. Verify representative controls visually and interactively, including theme states and popup behavior. This is a supported target for the requested skill to document and prove, not a compatibility result established by this research.

The [shadcn-vue TanStack Form guide](https://www.shadcn-vue.com/docs/forms/tanstack-form) already demonstrates headless form management with its copied controls. Its Zod example is illustrative and does not require choosing Zod as this project's schema default.

## Added task families

[TresJS installation](https://docs.tresjs.org/getting-started/installation) requires Three.js and a Vue renderer integration. Its Nuxt module handles client-only canvas rendering and compiler configuration. Treat 3D as task-specific rather than adding it to every scaffold. TanStack Table and Form are headless behavior libraries. The chosen shadcn-vue controls and UnoCSS provide their UI.

## Limits

The omptype source revision was observed as `679691a78141de0dd6ba1b7a5d5c1b1d7d967a63`. Context7 did not resolve omptype and returned an unrelated Python project, so that result was not used. Primary source and npm metadata supplied the package facts. No package was installed, no remote package code was executed, and no application, CSP scenario, typecheck, or benchmark was run. Integration and browser compatibility remain unverified.
