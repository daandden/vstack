# Cloudflare platform skills are adapted Utility skills

Vstack ships 16 skills from the Cloudflare upstream as visible Utility skills. They load by description in any session or by name, without an Addon catalog key. During triage of [issue #614](https://github.com/daandden/vstack/issues/614), the maintainer replaced the adopt plan with adapt because [ADR 0008](0008-house-style-touches-adopt-items-only-through-required-rows.md) makes `ask-tool` mandatory even for adopt items. The adaptations rewrite the flagged sentences and replace one broken sibling link. Each modified file carries a change notice under Apache-2.0 section 4(b).

As in other Utility skills, each `SKILL.md` that puts questions to the user has a routing sentence for all questions, including confirmations and approval waits. Every feedback reference follows the same rule. Use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract when enrolled, or plain `ask` outside a Flow.

## Considered options

- Ship byte-identical adopt copies. The trial failed `ask-tool` on feedback instructions in all 16 skills and on questions in `turnstile-spin`.
- Allowlist the affected skills under `ask-tool`. Rejected because their feedback and approval questions must use omp's `ask` like other session questions.
- Exempt the Cloudflare upstream from `ask-tool`. Rejected because an Upstream-wide exemption would also bypass the rule for future items.
- Adapt the flagged sentences and add a routing sentence where the skill puts questions to the user. Chosen to apply the required question mechanism without changing the Cloudflare procedures.

## Consequences

- `cloudflare/SKILL.md` refers to the optional `nextjs-on-cloudflare` skill by name instead of linking to its file. The original relative link failed validation because vstack does not ship that skill. The official Next.js docs link stays.
- This amends ADR 0008 only by adding two House style allowlist entries for false positives. `single-spawn` skips `agents-sdk` because `agent` is an Agents SDK argument to `useAgent`. `spawn-vocab` skips `cloudflare` because Miniflare dispatches requests and events, not subagents. `ask-tool` gains no exemption.
- This narrows the rejected separate Cloudflare skill option in [ADR 20261113-web-fullstack-curates-nuxt-on-cloudflare](20261113-web-fullstack-curates-nuxt-on-cloudflare.md). A Nuxt-on-Cloudflare request can now match `web-fullstack` and the Cloudflare platform skills, including `cloudflare` and `wrangler`. The platform skills do not take over the curated Nuxt setup or deploy procedure.
- The deploy-confirmation conflict stays accepted. `wrangler` and `cf-cli` retain their Upstream guidance for deploys, rollbacks, secrets, and resources. `web-fullstack` retains its explicit deploy request and per-step confirmation requirements for the Nuxt procedure. Changing either policy is outside #614.
