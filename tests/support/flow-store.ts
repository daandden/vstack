// Where a Flow's stored data and captured files live under a test home, for tests of storage side effects
// (retention, cleanup, planted files). The reader itself is only ever read through the Local Flow host.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function storedFolder(home: string, flow: string): string {
  for (const state of new Bun.Glob(".vstack/tmp/*/flow/*/data/state.json").scanSync({ cwd: home, dot: true, absolute: true })) {
    if (JSON.parse(readFileSync(state, "utf8")).flow?.id === flow) return dirname(dirname(state));
  }
  throw new Error(`no stored Flow ${flow} under ${home}`);
}

export const statePathOf = (home: string, flow: string) => join(storedFolder(home, flow), "data", "state.json");
