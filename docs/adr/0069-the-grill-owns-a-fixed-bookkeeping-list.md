# The grill owns a fixed Bookkeeping list

> This refines [ADR 0037](0037-the-grill-settles-reversible-decisions-in-the-open.md). Its three-part test stays for every other decision.

Besides decisions that pass ADR 0037's test, the agent settles three kinds of decision without asking, each listed as an Assumed pick with its reason: behavior-preserving refactors and cleanup, including removing code it proved unused and choosing not to merge look-alike code; recording a decision the user already made as an ADR, with its placement and supersession links; and carrying settled terms into the glossary and reusing existing definitions. domain-modeling no longer offers an ADR through `ask`. It still applies its three criteria to decide whether a decision deserves one. In 813 questions from 85 vstack sessions, all 13 refactor questions and all 21 answered ADR questions took the recommendation, and 18 of 19 answered glossary questions did. Recording never settles a new fallback, guarantee, or policy, and a new product concept or a preferred public name still goes to the user.

## Considered Options

- A consequence test: settle any reversible decision that changes nothing the user sees or relies on, without a cited fact. It cuts more questions, but it rests on the agent's judgment, and a wrong feasibility belief could pass unasked.
- Internal names and file locations. The user changed them 6 of 11 times, including an agent name, a plugin name, an app path, and a guide location.
- Investigation order and scratch inputs. Only 3 questions, one answered in the user's own words.
