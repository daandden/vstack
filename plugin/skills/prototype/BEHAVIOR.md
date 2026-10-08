# Behavior Prototype

Write the smallest script that exercises one question about what code actually does or how fast it runs, and print the answer. Run it, look at the output, and hand over what you saw.

If the question is "does this state model feel right", use [LOGIC.md](LOGIC.md). If it is "what should this look like", use [UI.md](UI.md).

## When this is the right shape

- "What does this API return for an empty list?"
- "Which of these two approaches is faster on real data?"
- "Does the cache get hit on the second call?"
- "In what order do these events fire?"

## Process

### 1. State the question

Write the question and the result that answers it in one or two lines at the top of the script, for example: "Is approach B faster than A on 10k rows? Answer: the median time of each over 20 runs." If you cannot name the result that answers it, the question is not ready.

### 2. Write the smallest script

- Use the project's language and runtime, and call the real code when the question is about the real code.
- Exercise the question and nothing else. No framework, no tests, no abstractions.
- For two or more approaches, put each in one labeled function and run them all from one entry point, so the script is its own switcher.
- For timing, warm up first, run each case several times, and print the median and the spread, not one run.
- Print every value the question depends on, labeled, so the output reads on its own.

### 3. Run it and keep the output

Run the script with one command and keep the full output or timing (rule 7 in [SKILL.md](SKILL.md)). If the output does not answer the question, change the script and run it again. Do not guess the answer from the code.

### 4. Capture the answer and the prototype

Once the script has answered its question, capture the answer, then capture the prototype the way the [SKILL](SKILL.md) describes. The script and its saved output are the primary source. Only the decision moves into the real code.

## Anti-patterns

- One timing run, or a timing with no warm-up. Noise reads as an answer.
- A script that tests a copy of the code rather than the code itself, when the question is about the code itself.
- An answer from reading the code with no run behind it.
