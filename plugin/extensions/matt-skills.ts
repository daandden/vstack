// The Matt skill rule. The vstack extension and check-register both import it.

/** The decision-register row fields that the rule reads. */
export interface MattSkillRow {
  upstream?: string;
  disposition?: string;
  artifacts: string[];
}

/**
 * Names of the skills that have a non-reject row from an Upstream whose role is Base, less the Addons:
 * a skill with a key in the `questions` map of addon-questions.json is an Addon whatever its rows (ADR 0019).
 */
export function mattSkillNames(
  rows: readonly MattSkillRow[],
  roleOf: (upstream: string) => string | undefined,
  addons: Iterable<string>,
): Set<string> {
  const exclude = new Set(addons);
  const names = new Set<string>();
  for (const row of rows) {
    if (row.disposition === "reject" || !row.upstream || roleOf(row.upstream) !== "Base") continue;
    for (const artifact of row.artifacts) {
      const match = /^plugin\/skills\/([^/]+)$/.exec(artifact);
      if (match && !exclude.has(match[1]!)) names.add(match[1]!);
    }
  }
  return names;
}
