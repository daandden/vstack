---
name: web-fullstack
description: Choose frontend libraries, set up Vue or Nuxt projects, or build fullstack Nuxt sites on Cloudflare Workers.
---

# Choose and set up a web stack

Give one applicable choice with a short reason, not a library survey. Start with the supplied task. This Utility supplies selection and setup knowledge to the current work owner, not an independent executor.

## Flow and questions

For standalone result-producing use, follow skill://flow-page's "Stage entry/exit line". In an enrolled direct run, publish the recommendation or actual setup outcome as Results in that run's Stage and finish it under that contract. Reading this skill as reference-only knowledge under another running owner opens no separate Stage. That owner keeps publication.

Route all clarifications, including a missing task or conflicting package-manager conventions, through skill://flow-page's "Every ask in a Flow" when enrolled. Publish through the CLI before ordinary `ask`, then record the observed response separately. Outside a Flow, give the question's context in chat and use plain `ask`. A worker returns open questions to its coordinator instead of inventing answers. Unanswered or headless recommendations grant no consent or permission to continue.

## Inspect the target application

Read the application's `package.json`, `packageManager`, lockfile, framework configuration, and applicable project conventions. In a workspace, inspect the target app and the workspace's package-manager policy, not an unrelated root app. Check installed versions before using APIs.

Prefer built-in Vue, Nuxt, browser, or installed UI capabilities when they cover the task. Keep an existing suitable library instead of adding another for the same job. Preserve existing framework, runtime, package manager, linting, formatting, and icon artwork unless migration is requested.

Keep the target app's declared package manager and lockfile, or the user's explicit manager choice. Resolve conflicting declarations through the shared question contract before installation. Use Bun only when no manager or convention is declared or requested. Report an unavailable manager instead of installing it globally or substituting another. The installer does not change the application's runtime.

For new applications, default to Nuxt. Keep Vue with Vite for frontend-only requests, embedded widgets, and component libraries. Fullstack is curated for Nuxt only because its pages and server routes share one Worker. Recommend Nuxt for a fullstack Vite request. If the user keeps Vite, label that path uncurated rather than adding a second curated server stack.

Cloudflare Workers with Static Assets is the only curated host. Label Vercel, Netlify, and self-hosted Node hosting uncurated. Preserve an existing app's framework and host unless migration is requested. Choose rendering from the task's requirements rather than inferring it from the framework.

Read [curated choices](references/choices.md) for the requested task. These are vstack defaults, not an Anthony Fu endorsement. Mark work outside that list as **uncurated**. Research an uncurated choice only when needed, and label the recommendation accordingly.

## Recommend or set up

Recommendation-only requests are read-only. State the choice, why it fits this app, and any compatibility prerequisite. Do not install, configure, scaffold, or migrate from a request for advice.

For explicitly requested setup, read [project setup](references/setup.md). Install only task-required packages. Before wiring integrations, consult current compatible APIs and framework documentation. Read [UnoCSS and copied controls](references/unocss-controls.md) when setting up shadcn-vue or UnoCSS icons. Read [forms and schemas](references/forms.md) when integrating TanStack Form with omptype.

For server routes or persistent data, read [server and data setup](references/server-data.md). For Cloudflare hosting or an explicit deploy request, read [the Cloudflare boundary and confirmed deploy procedure](references/cloudflare-deploy.md), including static-only sites. These references apply to advice without granting setup permission. Setup stays local and makes no Cloudflare account request. It ends with local runtime proof and a written deploy checklist, never an implicit deploy. An explicit deploy request confirms the target account before account discovery, then confirms each remote step through the shared question contract.

When the task needs sign-in, read [Better Auth setup](references/auth.md). It supplies the curated Nuxt module, NuxtHub schema, session, and Worker-origin recipe. Apps without sign-in get no auth library.

For styles and controls, use skill://good-css and its conditional interaction guidance. For data-bearing UI proof, use skill://break-ui within the current Verify work. Existing implementation, review, and Verify owners keep their responsibilities.

Finish advice with the recommendation, without a canned waiting response. Finish setup with the actual files and commands, observed results, and any unmet prerequisite. Installed packages or generated files alone do not establish a working integration.
