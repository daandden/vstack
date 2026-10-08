import type { HouseStyle, HouseStyleProblem } from "../house-style.ts";
import type { UpstreamSource } from "../upstreams.ts";
import type { Pin, Register, Row } from "../vstack-repo.ts";

/** One register failure. `class` is a stable kebab-case id; `item` is a row id, artifact path, or `<upstream>:<path>`. */
export interface Failure {
  class: string;
  item: string;
  message: string;
}

export interface CheckContext {
  root: string;
  pins: Map<string, Pin>;
  register: Register;
  /** Rows without an invalid-row or invalid-disposition failure; checks that trust row fields use these. */
  validRows: Row[];
  /** Artifact units found under `plugin/`. */
  pluginArtifacts: string[];
  /** house-style.yaml without its bad rows and rules; `houseStyleProblems` lists those. */
  houseStyle: HouseStyle;
  houseStyleProblems: HouseStyleProblem[];
  source: UpstreamSource;
  /** `--base` / `VSTACK_BASE_REF`, unset when the caller gave none. */
  baseRef?: string;
  /** Informational lines the CLI prints before the result (for example, which version base was used). */
  notes: string[];
}

export interface Check {
  /** Every failure class this check can report. */
  classes: readonly string[];
  run(ctx: CheckContext): Promise<Failure[]>;
}
