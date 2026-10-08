import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { parseReplacements, selectRows } from "../house-style.ts";
import { HOUSE_STYLE_COPY } from "./house-style.ts";
import type { Check } from "./types.ts";

export const migrationHouseStyleChecks: Check = {
  classes: ["migration-house-style"],
  async run(ctx) {
    const copy = join(ctx.root, HOUSE_STYLE_COPY);
    // A partial build without setup-vstack has no copy yet. A shipped setup-vstack must carry it.
    if (!existsSync(join(ctx.root, "plugin/skills/setup-vstack"))) return [];
    const fail = (message: string) => [{ class: "migration-house-style", item: HOUSE_STYLE_COPY, message }];
    try {
      const doc = Bun.YAML.parse(readFileSync(copy, "utf8")) as any;
      const parsed = parseReplacements(doc, new Set(ctx.pins.keys()));
      if (parsed.problems.length) return fail(parsed.problems.map(p => `${p.id}: ${p.message}`).join("; "));
      const expected = selectRows(ctx.houseStyle.replacements, { use: "migration" });
      if (Object.keys(doc).length !== 1 || !isDeepStrictEqual(doc.replacements, expected)) {
        return fail("must contain exactly the root uses: migration replacement rows, in order and with every field unchanged");
      }
      return [];
    } catch (e) {
      return fail(`cannot read or parse the Migration copy: ${e instanceof Error ? e.message : e}`);
    }
  },
};
