---
name: principle-prove-it-works
description: "Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'"
disable-model-invocation: true
---


# Prove It Works

Verify the output by checking the real thing. Compilation, file mtimes, cached screenshots, and a subagent's report are not proof of runtime behavior.

Check process liveness directly. Read the actual value rather than a derived value. When verification fails, check the observation method before blaming the system.

## Script the check

Write a deterministic script when it can repeat the same comparison. Run it and keep its output so a reviewer can repeat the proof. Keep evidence visible to the human. Commit proof artifacts for large or complex work that needs a lasting audit trail; use skill://decision-trail for that trail.
