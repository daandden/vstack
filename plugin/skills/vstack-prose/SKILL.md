---
name: vstack-prose
description: |
  Write or rewrite any text: chat replies, ask text, docs, READMEs,
  PR text, commit text, comments, pages, tracker text, and agent prompts,
  skills, rules, subagent briefs, or results. Use plain English and remove
  AI tells. Also use for plain-English, STE, or de-slop requests.
license: MIT
compatibility: claude-code cursor codex gemini-cli opencode
metadata:
  standard: ASD-STE100 Issue 9 (2025-01-15)
---

# vstack prose

Write plain English that a reader outside your field understands on one read.
Preserve meaning and match the intended tone when you rewrite.

Chat replies and `ask` text use the Reply rules. Every other text uses the
Document rules. The catalog of AI tells applies to both types.

For docs, RFCs, READMEs, PR text, or commit text, read
[technical-writing.md](technical-writing.md) before drafting. It holds the
technical-writing rules that add to this main rule set.

## Rules for both text types

- Use can, will, and must for facts and orders. Never use should or would.
  A required "should" becomes "must". Delete an optional one.
  Use may, might, or could only when you are not sure of a fact, never to
  soften an order. Name what settles an uncertain fact in a reply.
- Use parentheses for a short definition, an example, or an aside.
- In agent-facing text, a leading word from writing-for-agents stays with
  no definition.
- Use formatting only where it carries structure: a heading for a section,
  a list for parallel items or steps, a table for values that readers compare,
  or a code block for text that readers copy. Write prose otherwise.
- Bold marks a UI element name only. No bold lead-ins or bold emphasis.
- Use American spelling.

## Reply rules

1. The first sentence gives the answer or the result. Do not restate the question.
2. Define a concept term in a few words at its first use when the reader is
   not likely to know it: "idempotent (safe to run twice)". Do not define product names.
3. Do not shorten quoted error text, security warnings, or confirmations
   before a destructive action.

## Document rules

1. Classify each passage. Procedural text tells the reader what to do.
   Use imperative mood, one instruction per sentence, and a target of
   20 words per sentence. Descriptive text explains. Use one topic per
   paragraph and a target of 25 words per sentence.
2. Never touch code, identifiers, commands, flags, file paths, quoted
   errors, product names, or facts. When the source gives no number or
   cause, keep the general statement.
3. Put the condition before the command, with a comma:
   "If the build fails, read the log."
4. Use simple tenses. No present perfect ("has completed" becomes
   "completed"). No "-ing" verb after a comma. Start a new sentence instead.
5. Keep "that". No semicolons. Break noun chains over three words with a
   preposition ("the timeout value for the connection pool").
6. Give the reader each term and each fact before the step that needs it.
   Define a concept term at its first use, under ten words, one per sentence.
   Do not define product names, standard names (Postgres, S3, HTTP), or the
   tool the document is about. Also name the host, the flag, or the prior
   step that a command depends on. "Restart the service" becomes
   "Restart the `sync` service on the host that runs the job."
7. A vertical list has a colon on its lead-in, parallel items, and one
   instruction per step.
8. Warnings: command or condition first, then the risk.
   "Do not run this against production. The command deletes rows."

## Catalog of AI tells

Scan for these patterns and rewrite them before delivery.
The retained unslop rule numbers are ids cited by existing ADRs.

### Content

- Superficial "-ing" phrases: "highlighting", "ensuring", "reflecting",
  "showcasing", "fostering". Delete them or expand with real sources.
- Vague attributions: "Experts believe", "Industry reports suggest",
  "Some critics argue". Name the source or delete.
- Generic conclusions: "The future looks bright". State specific plans or facts.
- Say what it does, not how it feels. "The database stays close at hand",
  "SQL you can read", and "types that follow your schema" name a feeling.
  Name the mechanism or a number instead: "`.toSQL()` returns the exact
  string sent to the database", "a column rename fails the build".
  If a sentence states no concrete instruction, fact, or number, cut it.
  If it could appear unchanged in another project's docs, cut it.

### Language

- AI vocabulary: additionally, crucial, delve, enduring, enhance, fostering,
  garner, interplay, intricate, landscape (abstract), pivotal, showcase,
  tapestry (abstract), testament, underscore, vibrant. Use plain words.
- Fancy ways to say "is": "serves as", "stands as", "boasts", "features".
  Say "is" or "has".
- "Not just X, but Y". State the point directly.
- Forced groups of three. Use the natural number of ideas.
- Synonym cycling. Pick one word for a concept and keep its meaning
  throughout the text. Do not cycle through protagonist, main character,
  central figure, and hero in one paragraph.
- False ranges: "from X to Y" where X and Y are not on a meaningful scale.
  List topics directly.
- Filler: "In order to" becomes "To". "Due to the fact that" becomes
  "Because". Delete "It is important to note that" and "it is worth noting".
  State the fact, not its importance. Delete simply, seamlessly, robust,
  powerful, and comprehensive when they carry no fact.
- Cut adverbs, or use a stronger verb. "Runs quickly" becomes "is fast"
  or the number. "Significantly improves" becomes the measured change.
- Prefer the plain word. "Utilize" and "leverage" become "use".
  "Facilitate" becomes "help". "Numerous" becomes "many".
  "In the event that" becomes "if".

### Style and grammar

- Em dashes. Use periods or commas, or name the relation ("because", "but",
  "for example"). Do not substitute en dashes or hyphens for sentence breaks.
- Unslop rule 14, colon overuse. Colons are fine before a list or example,
  not as mid-sentence connectors. Rewrite so that the point stands on its own.
- Title case headings. Use sentence case.
- Decorative emojis. Remove them.
- Curly quotes. Use straight quotes.
- Dense sentences. If the reader has to backtrack, split the sentence or
  drop clauses. Keep one idea per sentence.
- Passive voice. Name the actor: "queries are validated" becomes
  "the compiler validates queries". Passive is fine only when the actor
  is unknown or does not matter.
- Unslop rule 33, over-compression. Keep complete grammar, articles,
  and verbs. No contractions, verbless fragments, symbol-speak, or
  abbreviations that make readers decode instead of read.
  "Parser rejects bad date, exit 2, no write" becomes "The parser rejects
  a bad date, exits with code 2, and writes nothing."
  Spell out arrows and abbreviations.

### Communication artifacts

- Chatbot phrases: "I hope this helps!", "Let me know if", "Of course!",
  "Certainly!", "Found the smoking gun!". Remove them.
- Sycophantic tone: "Great question!", "You are absolutely right!".
  Respond directly.

### Jargon and mannered prose

- Unslop rule 26, abstract metaphor nouns: substrate, wedge, vector, locus,
  vantage, nexus, primitive (as noun), harness (as metaphor), surface (as in
  "API surface"), bedrock, scaffolding (as metaphor), modality, paradigm,
  gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame,
  north star, flywheel. Pick the concrete word. "Substrate" becomes "base".
  "Wedge in" becomes "add". "Vector" becomes "way" or "method".
  "Gold-plating" becomes "more than the job needs". "Ratchet" becomes the
  mechanism's real name or "a limit that only tightens". "Evacuate" becomes
  "move out". "Endgame" becomes "the last phase".
- Unslop rule 32, mannered prose. Replace metaphor or flourish with the
  literal phrase. Watch for aphorisms, rhetorical fragments, personified
  code, figurative verbs, and stock framing phrases. "A dial worth turning"
  becomes "a parameter worth varying". Rule 26 covers the metaphor nouns.

## References

- [references/word-swaps.md](references/word-swaps.md): overused words
  and their plain replacements.
- [references/use-cases.md](references/use-cases.md): patterns for error
  messages, runbooks, incident reports, release notes, commits, agent
  prompts, UI copy, and translation preparation. Read it before writing
  one of these text types.

## Attribution and license

The plain-English rules and the two reference files derive from
[AminBlg/SimpleEnglish v2.1.1](https://github.com/AminBlg/SimpleEnglish/tree/v2.1.1).
The AI-tell catalog and technical-writing material derive from pstack's
unslop and technical-writing skills. The following notice covers the
SimpleEnglish material.

MIT License

Copyright (c) 2026 AminBlg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

