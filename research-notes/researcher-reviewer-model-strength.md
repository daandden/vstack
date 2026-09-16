# Researcher and reviewer model strength

Research date: 2026-09-16. Decision input for ticket #7, not an installed configuration or a tracker decision.

## Answer in brief

**Do not treat “subagent,” “read-only,” or “research” as synonyms for a weak model.** The surveyed harnesses separate inexpensive retrieval from difficult synthesis, and treat substantive review as reasoning work. Amp has a fast Search specialist, a main-agent-class Librarian, and a reasoning-oriented Oracle. Pstack uses its coding-worker model for evidence collection but its judgment model for synthesis, plus high-effort, diverse review panels. OMP explicitly ships `reviewer` on `@slow` and gives its advisor a strong fallback independent of the primary. Cursor's generic reviewer example, however, inherits the parent rather than requiring a stronger model. [A1–A4, P1–P6, O2–O6, C1]

**Recommendation [INFERENCE]:** `vstack-swift → low`, `vstack-researcher → standard`, `vstack-reviewer → deep`, `vstack-planner → deep`. Researcher→low is defensible only when its contract is bounded retrieval with stronger synthesis elsewhere. Reviewer→low is not a good general default for adversarial correctness/spec review. These are role-capability recommendations, not benchmark-proven equivalences between vendor model names and vstack tiers.

## Scope and evidence

Primary sources only: Amp's live documentation and rendered mode selector; Cursor's official docs and the `cursor/plugins` pstack source; the specified local OMP checkout. The durable [pstack link/model graph note on `research/pstack-link-model-graph`](https://github.com/daandden/vstack/blob/research/pstack-link-model-graph/research-notes/pstack-link-model-graph.md) was an index, not authority for the findings below. All six relevant upstream skill bodies were read directly. GitHub reported pstack `main` as `c1c0a32802223f4be824112dd83d33ad29a8b26c`; pstack citations pin that revision. The OMP checkout reported HEAD `acf943d3c8dc1ed135b42aa33fef4d9d2ff61c9a`; OMP citations identify the actual local files read, without claiming the working tree is byte-identical to HEAD.

“Stronger” here means suited to the task's reasoning and reliability requirements. It does not mean that a higher price, slower response, larger context window, or higher effort suffix proves superior performance. Model-family diversity is a separate axis from strength. None of the surveyed sources provides a controlled experiment proving that a reviewer must always outrank its worker, or a universal numerical conversion into `tiny/low/standard/deep/frontier`.

## 1. Amp: retrieval, research, and second opinions are different roles

### Current routing observed

The following is the **rendered Modes & Models page**, checked with both its **Amp Credits** and **With ChatGPT Sub** toggles. It is a dated routing snapshot, not an entitlement guarantee. [A1]

| Mode | Main agent: Amp Credits | Oracle: Amp Credits | Change shown with ChatGPT subscription |
|---|---|---|---|
| `low` | GLM-5.3-Flash, high effort | GPT-6 Astra, x-high | Main becomes GPT-5.6 Terra, low effort; Oracle stays Astra |
| `medium` | GPT-5.6 Sol, medium effort | GPT-6 Astra, x-high | No model/effort change shown |
| `high` | GPT-6 Astra, medium effort | Fable 5.1, x-high | Oracle becomes GPT-6 Astra, x-high |
| `ultra` | Fable 5.1, high effort | GPT-6 Astra, x-high | No model/effort change shown |

| Specialist | Observed model | Documented job | Relative interpretation |
|---|---|---|---|
| Search | GPT-5.6 Terra | Fast, accurate codebase retrieval | Speed-oriented specialist, not the Oracle's reasoning assignment. Under subscription routing it uses the same model name as the low main agent; the page does not specify Search effort. [A1, A2] |
| Librarian | GPT-5.6 Sol | Large-scale retrieval/research on external code; detailed explanations across repositories | Same model name as the medium main agent, not the smallest supporting model. Specialist effort is not specified. “Researcher must be weaker than worker” does not follow. [A1, A2, A4] |
| Oracle | GPT-6 Astra or Fable 5.1 according to mode/connection | Difficult reasoning, planning, complex-code debugging/review | A capable second opinion; high/ultra pair frontier models across families with Amp Credits. Subscription high can instead use the same Astra model at higher effort. [A1, A3, A4] |

**Documentation discrepancy:** `/docs/tools` and `/docs/the-dial` still describe the ordinary medium Oracle as GPT-5.6 Sol and its eligible-subscription upgrade as Astra. The live `/modes` page instead rendered Astra for medium with **Amp Credits selected**, as well as with the subscription toggle selected. The table reports that observed page, while preserving the discrepancy rather than silently choosing one source. The July Dial announcement is historical: its original routes included GLM-5.2 and Fable 5, not today's live selection. [A1, A3–A5]

Amp says routing can change with model availability, provider connections, workspace restrictions, and explicit pins. The Dial groups a model, reasoning effort, prompt, tools, and Oracle; it is not just a model-size selector. `low` is for small, well-defined work; medium is the default; high is for expensive subtle misses; ultra is for hard, open-ended work. Starting too low can cost more through repeated attempts. [A2, A3]

Dial customization also matters: **Oracle is a separate pin from Subagents**. The Subagents pin covers Task workers, codebase search, thread reading, and Librarian. Auto allows different specialists to use different models; pinning Subagents forces one model across that group. Oracle review should therefore not be collapsed into the retrieval-worker bucket. The separate code review check and supporting system models are outside those pins. [A3]

**Implication [INFERENCE]:** Amp supports cheap retrieval plus capable research/synthesis plus expensive selective review, not uniformly cheap researcher/reviewer roles. A Librarian-like researcher reasonably starts at the general-worker tier; an Oracle-like reviewer warrants stronger reasoning than routine implementation. When the worker is already a frontier model, the useful distinction can be different family or effort, not a nonexistent higher capability tier.

## 2. Cursor/pstack: actual role table and Task wiring

Pstack is an explicit practitioner workflow in Cursor's official plugin repository, not proof of what every Cursor user chooses. `setup-pstack` writes an always-applied role rule overriding defaults. Its default coding roles (`feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `swarm workers`) use `grok-4.6-fast-xhigh`; `judgment and prose` and `hardest tasks` use `claude-fable-5-1-thinking-max`. This is the relevant worker baseline for the comparisons below, not an assumed parent model. The parent remains independently selected. [P1]

| Workflow role | Default model(s) | Actual delegation and comparison |
|---|---|---|
| `how explorer` | `grok-4.6-fast-xhigh` | Complex questions spawn 2–4 parallel `generalPurpose` explorers, `readonly: true`. Same default model as pstack's coding worker, not a separately weaker model. [P1, P2] |
| `how explainer` | `claude-fable-5-1-thinking-max` | One `generalPurpose`, `readonly: true`, synthesizes complex findings. Simple questions skip explorers and still use this explainer to investigate and explain in one pass. Synthesis is assigned the judgment model, not the collection model. [P2] |
| `why investigators` | `grok-4.6-fast-xhigh` | Parallel `generalPurpose` investigators for available evidence categories; source control always present. `readonly: false` deliberately retains MCP access, while instructions prohibit writing. Same model as coding workers. [P1, P3] |
| `why synthesizer` | `claude-fable-5-1-thinking-max` | One `generalPurpose`, `readonly: false`, receives evidence, gaps, code anchor, and epistemic framework; spot-verifies citations, potentially through MCP. [P3] |
| `reflect` judgment and divergent reviewers | `claude-fable-5-1-thinking-max` | Two of three parallel `generalPurpose` transcript reviewers. Their task is durable lessons/judgment, not merely locating text. [P4] |
| `reflect` tooling reviewer | `gpt-5.6-sol-max` | Third parallel reviewer provides another model/lens. All three use agent mode for MCP lookups. [P4] |
| `reflect` synthesizer | `claude-fable-5-1-thinking-max` | Separate `generalPurpose` synthesis into Accepted / Rejected / Backlog; agent mode supports citation verification. [P4] |
| `interrogate reviewers` | `claude-fable-5-1-thinking-max`, `gpt-5.6-sol-max`, `grok-4.6-fast-xhigh`, `claude-opus-5-thinking-xhigh` | One parallel `generalPurpose`, `readonly: true`, per configured list entry; every model gets the same intent, diff, prompt, rubric, and code-quality lens. Parent performs synthesis and lead judgment. [P5] |
| `arena` runners | Same four-model list as interrogate | All N candidates launch together with `run_in_background: true`, separate output locations, same task, and a rationale. Same model N times is allowed for generation-bound rather than judgment-sensitive work. [P6] |
| `arena cross-judge pool` | Same four-model list as runners | Select **one** readonly judge, preferably from a different family than the **parent**, after all candidates finish. It judges labeled paths against the rubric while the parent independently reads. This is not a stronger-than-every-candidate rule, and not necessarily a different family from every candidate. [P6] |

The configured budget changes effort on real slugs: unlimited retains defaults; large targets xhigh, medium high, small medium, using available same-family variants. It does not automatically replace all models with a weak family. `inherit-parent` and `auto` are pstack aliases that omit Task `model`; list entries still count toward fan-out. Thus “small pstack budget” is not evidence for `reviewer → low` in vstack's capability ladder. [P1]

Pstack is explicit that interrogate's adversarial signal comes from **model diversity, not assigned personas**. Its panel contains the same Grok model as routine workers alongside its judgment models. Arena prefers a different family from the parent. These choices support diversity and capable judgment, but do not establish a total strength order across those model families. [P5, P6]

**Implication [INFERENCE]:** A single vstack researcher that both gathers and synthesizes would collapse two materially different pstack stages. Low is reasonable for a collector with a strong synthesis owner; it is not a faithful translation of the complete how/why role. A low-only reviewer would discard pstack's principal review choice: high-effort judgment with independent model perspectives.

## 3. OMP: defaults, chains, and important inheritance exceptions

`model-roles.ts` defines role identities and UI metadata: `smol` is “Fast,” `slow` is “Thinking,” `task` is “Subtask,” `plan` is “Architect,” with separate `tiny` and `advisor` roles. **That file does not itself define routing strength.** The resolver and bundled agent frontmatter supply the behavioral evidence. [O1–O4]

| OMP role/agent | Default behavior actually implemented | Consequence |
|---|---|---|
| Bundled `task` | Frontmatter uses `@task` with auto thinking. Configured `task` role wins; without it, task selection falls back to the parent's active model, then fallback/default selection. | Generic workers are not automatically smol. [O2, O3, O5] |
| `smol`; bundled `scout` and `sonic` | Both agents use `@smol`; scout and sonic specify medium thinking. Sonic is described as low-reasoning, strictly mechanical updates or data collection. | Fast retrieval/mechanical delegation is an explicit lane. [O3, O7] |
| `slow`; bundled `reviewer` | Reviewer frontmatter explicitly uses `@slow`. | OMP's direct code-review default is the reasoning lane, not smol. [O6] |
| `advisor` | Explicit advisor setting wins. Otherwise use an explicitly configured `slow`; otherwise the built-in slow priority chain. The resolver deliberately bypasses inheritance through an **unconfigured** slow role. | OMP intends a distinct strong second-opinion model out of the box, though it does not enforce a different concrete model/family from the worker. [O2] |
| `tiny` | Lightweight online titles, memory, auto-thinking classification, unexpected-stop detection. When unset, resolves through smol, including smol's configured/inherited/built-in behavior. | Tiny is background utility work, not a general research/review recommendation. [O2, O4] |

### Priority chains are fallback policy, not a guarantee of the executing model

The full ordered families/pattern groups in the inspected `priority.json` are below; repeated punctuation and provider aliases are compressed for readability. The source contains the exact ordered strings. [O8]

- **smol:** provider-qualified Gemini 3.8 Flash, then Gemini 3.8/3.7/3.6/3.5 Flash aliases; GPT-5.3 Codex Spark aliases; GLM-5.3-Flash; Gemini 3.1 Flash Lite aliases; Cerebras GPT-OSS-120B aliases; Cerebras Z.ai GLM-4.7/4.6/generic GLM; Claude Haiku 4.5 aliases; GPT-5.6 Luna; GPT-5.4 Mini and generic `mini`.
- **slow:** OpenAI Codex GPT-5.6 Sol and its unqualified alias; Claude Fable 5.1 aliases; Fable 5 aliases; Kimi K3 aliases; GLM-5.3 aliases; Claude Opus 5 aliases; GPT-5.5 aliases; Claude Opus 4.8 aliases.

Crucially, role expansion for an **unset smol or slow role** tries a configured `default` before its built-in priority list. Therefore `@slow` on the bundled reviewer does not guarantee a stronger concrete model than the worker, and `@smol` does not guarantee a cheaper one. Advisor's configured-only slow fallback specifically avoids that default inheritance; tiny does not. This distinction is in executable resolver code, not inferred from role names. [O2]

Task model precedence is `task.agentModelOverrides[agentName]`, then agent frontmatter, then parent's active/fallback model. Eval can supply an invocation-local override ahead of those; the task wire itself has no model override field. Thus binding agents to vstack roles must account for existing per-agent overrides rather than assuming frontmatter always wins. [O5]

The advisor is optional, reviews primary transcript updates in its own context, can investigate with its own tools, and injects advice. It is not an action-approval gate. Subagents are unadvised by default and opt in per agent. The docs' Sonnet and explicit `@smol:high` examples demonstrate configurability, not a normative weaker-reviewer default. OMP's README describes its separate-context/model reviewer as catching what the doer rushed past; the resolver is more precise about the intended strong default. [O2, O5, O9, O10]

**Implication [INFERENCE]:** Preserve OMP's separation of cheap collection, general work, and reasoning review. Do not copy the incidental model names or assume a fallback alias enforces a capability floor. The strongest direct evidence against reviewer→low is OMP's shipped `reviewer: @slow` plus the advisor's deliberate strong fallback.

## 4. What primary practitioner guidance actually supports

| Question | Evidence | Limit |
|---|---|---|
| Should review get a more capable reasoning model? | Amp calls Oracle a powerful second opinion better suited to complex reasoning/analysis, slower and more expensive, and gives first-person examples reviewing changes. OMP's resolver describes advisor as a distinct strong second-opinion reviewer; bundled reviewer uses slow. [A4, O2, O6] | This supports stronger **reasoning suitability**, not proof that every reviewer must be globally stronger than every worker. |
| Does different-model review help address blind spots? | Amp's GPT-5 Oracle announcement credits reasoning, “different training lineage,” and absence of Sonnet idiosyncrasies, while noting GPT-5 was less proactive as a main agent. Pstack interrogate explicitly seeks model diversity; arena cross-judges with another family when possible. [A6, P5, P6] | A complementary model can be a better reviewer without being a better doer. No controlled blind-spot correlation or miss-rate reduction is quantified here. |
| Is same-model review an accepted choice? | Cursor's official `code-reviewer` example uses `model: inherit`; docs say inherit provides the same reasoning power as the parent. Amp's subscription high mode uses Astra for both main and Oracle, with different effort. [C1, A1] | Fresh context and a skeptical verification task can be useful. Same-model review is not proven useless, nor does a fresh context prove independent error modes. |
| Does a stronger baseline alone solve review? | Cursor reports early models were not capable enough for helpful reviews. Bugbot improved through model/pipeline/context experiments, parallel passes, validation, and eventually a fully agentic architecture, which produced the largest gains. [C2] | The reported gains are for the complete review system, not an isolated reviewer-vs-worker strength experiment. No disclosed model assignment establishes a universal tier rule. |
| What about cheaper research? | Cursor Explore explicitly uses a faster model for many parallel searches; Amp separates Search from Librarian; pstack separates collection from synthesis; OMP ships smol scout. [C1, A1, P2, P3, O7] | Retrieval economics do not establish the right model for resolving conflicting evidence or producing architecture recommendations. |

**Conclusion [INFERENCE]:** “A stronger reviewer catches more” is a plausible design hypothesis supported by capability-oriented routing, not a measured universal law in these sources. “The same model shares the worker's blind spots” is a risk motivating diversity, not proof that same-model review fails. For load-bearing review, choose adequate reasoning capability first, then a complementary model family where available, and require evidence-backed findings and real verification rather than relying on the model label.

## 5. Recommendation for ticket #7

The following interprets the five vstack tiers as capability bands: `tiny` for lightweight background utility, `low` for bounded inexpensive work, `standard` for general multi-step work, `deep` for deliberate judgment, and `frontier` for the hardest/risk-sensitive cases. **This is a proposed policy [INFERENCE], not a vendor-defined mapping or a configuration change.** A provider model's price, speed, effort, and capability need separate checks when implementing bindings.

Assume the normal worker is `standard`. If the worker is already deep/frontier, the review policy should not blindly downshift below the task's required capability merely because a fixed default says deep.

| Agent | Recommended default | Relative to standard worker | Scope and reason | Escalation / cheaper exception |
|---|---|---|---|---|
| `vstack-swift` | **low** | Weaker/faster by intended tier | Precisely specified mechanical edits or bounded collection; aligns with OMP sonic and Amp low's well-defined task scope. Tiny is too narrow as a general coding-worker default. [O3, A3] | Use tiny only for utility-like extraction/formatting with a cheaply checked result. Escalate when decisions or unknown dependencies appear. |
| `vstack-researcher` | **standard** | Same tier | A general researcher must find sources, compare conflicting evidence, spot-check citations, and produce a defensible synthesis. Amp Librarian uses medium-main-agent Sol; pstack synthesis uses the judgment model. [A1, A4, P2, P3] | **Low only for bounded retrieval**, with an explicit stronger synthesis owner. Deep for difficult causal/history inference, architectural synthesis, or consequential conflicting evidence. |
| `vstack-reviewer` | **deep** | Stronger reasoning budget | Independent correctness/spec/security judgment, including discovering what the worker missed. Matches OMP reviewer/strong advisor intent and pstack's high-effort review. Prefer a different family from the implementer where practical. [O2, O6, P5, P6, A6] | Standard for narrow, low-risk review; low only for a mechanical checklist, not the sole substantive verdict. Frontier for especially costly misses or review of frontier-level open-ended work. |
| `vstack-planner` | **deep** | Stronger reasoning budget | Planning must reconcile constraints and unknowns before cheap execution. Amp Oracle and pstack's judgment/architect choices support spending reasoning here. [A3, A4, P1] | Standard for routine, already-understood plans; frontier for open-ended migrations/architecture where a wrong premise is expensive. |

### Explicit test of the proposed defaults

- **Researcher→low: conditionally accept, reject as an unrestricted default.** It fits Search/Explore/scout-like collection. It does not fit a Librarian-like researcher or how/why synthesis unless the contract explicitly hands judgment to a stronger owner. With one agent covering both collection and synthesis, standard is the conservative default; deep is appropriate for high-uncertainty synthesis. [A1, C1, O7, P2, P3; recommendation is INFERENCE]
- **Reviewer→low: reject for general substantive review.** Neither pstack's panel nor OMP's reviewer/advisor choice points there. Cursor's inherited reviewer is a real counterexample to “must always be stronger,” but not evidence for downshifting below the worker. Prefer deep and complementary family; accept cheaper review only for a narrower contract. [P5, O2, O6, C1; recommendation is INFERENCE]
- **Planner→deep: retain.** It is consistent with dedicated reasoning/planning roles and front-loading difficult decisions. Frontier remains selective, not the default for every plan. [A3, A4, P1; recommendation is INFERENCE]

Before treating these as empirically optimal, compare them on representative vstack work with known acceptance criteria and real defects: retrieval coverage/citation accuracy for researchers, material bug recall and false positives for reviewers, plan omissions/rework for planners, plus end-to-end cost and latency. Compare same-model/same-tier, different-family/same-tier, and stronger-tier review separately so family diversity is not confused with strength. This is a proposed evaluation, **not an experiment run by this research**.

## Source register

### Amp (live first-party pages)

- **A1:** [Modes & Models](https://ampcode.com/modes). Read statically and checked in Chromium with both routing toggles on 2026-09-16.
- **A2:** [Models and Subagents](https://ampcode.com/docs/models-and-subagents), especially Modes, Specialist Subagents, and System Models.
- **A3:** [The Dial documentation](https://ampcode.com/docs/the-dial), especially Choose a Mode, Models Behind the Dial, Use a ChatGPT Subscription, and Tune the Modes.
- **A4:** [Tools: Oracle and Librarian](https://ampcode.com/docs/tools#oracle).
- **A5:** [The Dial announcement](https://ampcode.com/news/the-dial), 2026-07-09; historical routing only.
- **A6:** [GPT-5 Oracle announcement](https://ampcode.com/news/gpt-5-oracle), 2025-10-01; first-party explanation of complementary strengths and training lineage, not current model routing.

### Cursor/pstack (first-party source, pinned revision)

- **P1:** [setup-pstack/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/setup-pstack/SKILL.md), steps 2–5, role table and budget/alias semantics.
- **P2:** [how/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/how/SKILL.md), steps 1–3.
- **P3:** [why/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/why/SKILL.md), steps 3–4.
- **P4:** [reflect/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/reflect/SKILL.md), steps 2–3.
- **P5:** [interrogate/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/interrogate/SKILL.md), introduction and steps 3–5.
- **P6:** [arena/SKILL.md](https://github.com/cursor/plugins/blob/c1c0a32802223f4be824112dd83d33ad29a8b26c/pstack/skills/arena/SKILL.md), phases A–D.

### OMP (specified local primary-source checkout)

Paths below resolve to the checkout actually inspected; line ranges identify relevant sections. Reported HEAD: `acf943d3c8dc1ed135b42aa33fef4d9d2ff61c9a`, upstream remote `https://github.com/can1357/oh-my-pi.git`.

- **O1:** [model-roles.ts](../../oh-my-pi/packages/coding-agent/src/config/model-roles.ts), lines 22–54.
- **O2:** [model-resolver.ts](../../oh-my-pi/packages/coding-agent/src/config/model-resolver.ts), lines 1135–1268 (role fallbacks), 1309–1340 (task inheritance), 1708–1723 (advisor resolution).
- **O3:** [task/agents.ts](../../oh-my-pi/packages/coding-agent/src/task/agents.ts), lines 43–71 (bundled task/sonic).
- **O4:** [docs/models.md](../../oh-my-pi/docs/models.md), lines 438–459 (roles and tiny).
- **O5:** [docs/task-agent-discovery.md](../../oh-my-pi/docs/task-agent-discovery.md), lines 27–87, 178–209 (frontmatter, role binding, selection).
- **O6:** [reviewer.md](../../oh-my-pi/packages/coding-agent/src/prompts/agents/reviewer.md), lines 1–6 (`model: "@slow"`).
- **O7:** [scout.md](../../oh-my-pi/packages/coding-agent/src/prompts/agents/scout.md), lines 1–7 (`@smol`, medium thinking).
- **O8:** [priority.json](../../oh-my-pi/packages/coding-agent/src/priority.json), lines 1–65 (exact chains).
- **O9:** [docs/advisor-watchdog.md](../../oh-my-pi/docs/advisor-watchdog.md), Enabling the advisor, What the advisor sees, WATCHDOG.yml, and Subagent advisors.
- **O10:** [README.md](../../oh-my-pi/README.md), Advisor section (around line 175), Models and providers (around line 332).

### Cursor documentation and engineering experience

- **C1:** [Subagents](https://cursor.com/docs/subagents), Built-in subagents, Model configuration, reviewer example, Verification agent, and Performance and cost. Retrieved directly and cross-checked through Context7's official Cursor documentation index.
- **C2:** [Building a better Bugbot](https://cursor.com/blog/building-bugbot), Jon Kaplan, 2026-01-15, especially Humble beginnings, Hill-climbing, and Agentic architecture.

## Verification and limits

Completed source investigation, not model benchmarking: read all named Amp pages and linked Dial/Oracle rationale; read setup plus all five requested pstack workflows from primary upstream source; inspected OMP priority lists, role metadata, executable fallback logic, bundled agents, and documentation; read official Cursor reviewer guidance and the first-party Bugbot engineering account. The Amp mode toggle was exercised to distinguish current rendered routing from stale prose. No YAML/config, HTML report, or tracker changes were made. No coding-agent workloads or reviewer-accuracy experiments were run; practitioner choices here are documented implementations, not a representative user survey.
