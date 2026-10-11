# Matt skills are the core, and Addons supplement them

A Matt skill is a vstack skill with at least one Base upstream row in the Decision register. The Matt flow is every Matt skill that only the user can start, such as grill-with-docs, grill-me, teach, and implement. Every other skill is an Addon or a Utility skill. An Addon holds the knowledge that Matt skills, such as grill-with-docs and implement, need for one kind of work, such as a vstack Update. It has no flow of its own, and the user does not start it by name. All changes run through the Matt flow, on one path: grill-with-docs or grill-me, then to-spec and to-tickets for a change that needs more than one session, then implement. The jev judge in the vstack extension picks Addons, the same way that it picks principles (ADR 0002), but only when the prompt invokes a Matt skill or a Matt skill already runs in the session. to-spec and to-tickets write the pointer to each picked Addon (`skill://<addon>`) into the spec and into each ticket, so that a new implement session loads it. ask-vstack is deleted, because the grill skills are the ways in.

A Utility skill is a skill that the user can use whatever the work is. Some set how any output is made: unslop, simple-english, technical-writing, diagram-design, good-css, and skill-creator. Others answer a question about existing work and change no tracked file: explain, how, why, and forensics. A request that ends in an answer does not go through the Matt flow. The user asks the agent directly, or uses one of these skills. A Utility skill starts anywhere, from its description, from a rule, or by name, as it does today. The jev judge does not pick Utility skills.

vstack-update and vstack-edit follow this model. They give the grill the cases to ask about, and the grill runs their read-only commands as fact-finding. For example, the grill runs the Update plan and merge before it asks about Update cases. They also tell implement which commands and gates to run. implement owns the branch, the commit, and the End state chain.

## Considered Options

- Each Addon names its Matt anchor, and the user can still type it. The user rejected this option: vstack has one way in, through the Matt skills.
- Edit Matt skills to name the Addon at each hand-off. The user rejected this option for the jev judge, which keeps Matt text close to Upstream.
- Judge Addons on every main prompt, as ADR 0002 does for principles. The user rejected this option, because then a plain prompt starts an Addon with no Matt flow around it.
- Every skill that is not a Matt skill is an Addon. The user rejected this option, because rules for text, figures, styles, and skills apply to any output, also outside a Matt flow.
- Keep vstack-update and vstack-edit as their own flows that run after the grill. The user rejected this option, because one flow for every change is simpler, and the grill asks better questions when it has the Update knowledge.
- Only Matt flow skills host Addons. The user rejected this option: every Matt skill that the user types hosts Addons, so research, code-review, and diagnosing-bugs keep theirs.
- The grill hosts requests that end in an answer and closes with no change. The user rejected this option: a user who wants an answer asks the agent directly or uses explain, how, why, or forensics.
- A fourth kind of skill for requests that end in an answer. The user chose to widen Utility skill instead.
- explain, how, why, and forensics stay Addons that the user can also start by name. The user rejected this option, because the user never starts an Addon by name.

## Consequences

- A plain prompt with no Matt skill gets no Addon. Small jobs start with grill-me or grill-with-docs.
- explain and forensics start from their descriptions. how and why start only by name, or when explain runs them.
- vstack adds nothing that blocks a typed `/skill:<addon>`. omp has no setting to remove a skill's slash command.
- The Addon pointer must be written into specs and tickets. A pointer that is missing means that implement works without the Addon.
- Open decisions on the redesign map (label `wayfinder:map`) decide how this ADR applies to principles, the always-on rules, the scripts, and each remaining Addon.
