---
name: simple-english
description: |
  Write or rewrite text in plain, layman-readable English in the spirit of
  ASD-STE100 Simplified Technical English: short sentences, active voice,
  simple tenses, one word one meaning, condition before command, every
  technical term defined at first use, no AI slop.
  Use for documentation, READMEs, runbooks,
  procedures, error messages, release notes, incident reports, API guides,
  and explanations for readers outside the field. Also use when the user
  says "STE", "Simplified Technical English", "ASD-STE100", "plain English",
  "layman's terms", "explain it simply", "no jargon", "de-slop", "make this
  readable", "write for non-native readers", or asks for docs that translate
  well. The reply has its own shorter rules: answer first, structure only
  where it helps.
license: MIT
compatibility: claude-code cursor codex gemini-cli opencode
metadata:
  version: "2.1.1"
  standard: ASD-STE100 Issue 9 (2025-01-15)
disable-model-invocation: true
---

# Simple English

Write plain English that a smart reader outside your field understands on one read. The rules come from ASD-STE100, the controlled language that aerospace uses for maintenance manuals. Two registers exist: the document you write or rewrite, and the reply you type in chat. Each has its own short rule set below.

## The Document

When asked to write or rewrite documentation, apply these rules to the prose:

1. Classify each passage. Procedural text tells the reader what to do: imperative mood, one instruction per sentence, a target of 20 words per sentence. Descriptive text explains: simple tenses, one topic per paragraph, a target of 25 words per sentence. Split a sentence over its target when the reader has to read it twice.
2. Never touch code, identifiers, commands, flags, file paths, quoted errors, product names, or facts. When the source gives no number or cause, keep the general statement.
3. Condition before command, with a comma: "If the build fails, read the log."
4. Use simple tenses and active voice. No present perfect ("has completed" → "completed"). No "-ing" verb after a comma (", making it easy" → new sentence). Name the actor: "You run the migration."
5. Modals: can, will, must for facts and orders. Never should or would. A required "should" becomes "must". An optional one is deleted. Use may, might, or could only when you are not sure of a fact ("the cache might be stale"), never to soften an order.
6. Use complete grammar. No contractions, keep articles, keep "that". Write short sentences, not telegraph style.
7. No semicolons and no em-dashes. Write two sentences, or name the relation.
8. One word, one meaning, for the whole document. After you pick a word for a concept, such as "check" or "configuration", use only that word for it. Break noun chains over three words with a preposition ("the timeout value for the connection pool").
9. Give the reader each term and each fact before the step that needs it. Define a concept term at its first use, under ten words, one per sentence. Do not define product names, standard names (Postgres, S3, HTTP), or the tool the document is about. Also name the host, the flag, or the prior step that a command depends on. "Restart the service" becomes "Restart the `sync` service on the host that runs the job."
10. State the fact, not its importance. Delete words that carry no fact: simply, seamlessly, robust, powerful, comprehensive, leverage, crucial, "in order to", "it is worth noting". No "not just X, it is Y". No decorative triplets. No "in conclusion".
11. Use formatting only where it carries structure: a heading for a section that the reader looks for, a list for parallel items or steps, a table for values that the reader compares. No bold lead-ins, no bold as emphasis, no emoji. A vertical list has a colon on the lead-in, parallel items, and one instruction per step.
12. Warnings: command or condition first, then the risk. "Do not run this against production. The command deletes rows."

Use American spelling. `references/word-swaps.md` maps the overused words to plain ones. For an error message, a runbook, an incident report, release notes, a commit message, or UI copy, read `references/use-cases.md` first. It names the text type and the pattern for each.

Before (AI output):

> **Connection timeouts.** If sqlpipe hangs or fails with `dial tcp: i/o timeout`, check that the host running sqlpipe can reach the Postgres port (usually 5432) — this is often a security group or firewall rule blocking the connection. If you're connecting to a managed database (RDS, Cloud SQL, etc.), confirm the instance allows connections from sqlpipe's IP.

After (procedural, headed, numbered):

> ## Connection timeouts
>
> sqlpipe stops with `dial tcp: i/o timeout` when it cannot connect to the Postgres port (5432 by default).
>
> 1. Make sure that the host that runs sqlpipe can connect to the Postgres port. A firewall or security group usually blocks it.
> 2. If the database is managed (RDS, Cloud SQL), make sure that the instance accepts connections from the IP of sqlpipe.

## The Reply

Every chat reply follows these rules. The Document rules do not apply to a chat reply.

1. The first sentence gives the answer or the result. Do not restate the question.
2. Write prose by default. Use a list, a table, a heading, or a code block when it carries structure: steps, parallel options, values that the reader compares, or text that the reader copies. No bold.
3. No em-dashes. Name the relation ("because", "but", "for example") or write two sentences.
4. Define a concept term in a few words the first time you use it, when the reader is not likely to know it: "idempotent (safe to run twice)". Do not define product names.
5. No contractions. No openers ("Certainly", "Great question") and no closers ("I hope this helps", "Let me know").
6. Do not shorten quoted error text, security warnings, or confirmations before a destructive action.
7. Never should or would. Use may, might, or could only when you are not sure of a fact, and name what settles it.

Before: The failure stems from control-plane leader election during pod churn — nothing to worry about!
After: The pods restarted and the queue lost its leader for a short time. It recovered without help. You do not have to do anything.

## Self-Check Before You Deliver

1. Reply: search for `—` and `**`. Remove each one. Read each list, table, and heading. If it carries no structure that prose cannot carry, write it as prose.
2. Document: read your three longest sentences. If one needs a second read, split it. Search for `'`, `has been`, `should`, `would`, `;`, `—`, `, making`, and `**`. Fix each hit. Read each may, might, and could: if you are sure of the fact, write can or will. Read each heading and list: does it carry structure? Read each step: does it name a host, a flag, or a prior step the reader must already have? If not, add it or point to it.

## Limits

These rules are for facts and instructions, not marketing copy or brand writing, because they delete persuasion. Say so, and offer them for the docs instead.

## References

- `references/word-swaps.md`: a map from overused words to plain ones
- `references/use-cases.md`: the text type and the pattern for error messages, runbooks, incident reports, release notes, commits, agent prompts, UI copy, and translation prep
