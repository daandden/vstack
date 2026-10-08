// Register vs Upstream trees.
// - Current-Pin checks use (pin, path, tree) whenever path is set.
// - Reconciled-version checks use (held_at, held_path) on a held row, else (pin, path): the item exists,
//   and an adopt artifact matches it byte for byte, minus agents/openai.yaml, under the Upstream name.
// - The reverse check lists the items at each Pin and needs a row whose path names each one.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { artifactBlobs, isHeld } from "../vstack-repo.ts";
import type { Check, Failure } from "./types.ts";

/** The only Upstream file adopt never ships (ADR 0001). */
const NEVER_SHIPPED = "agents/openai.yaml";

const basename = (p: string) => p.replace(/\/+$/, "").slice(p.replace(/\/+$/, "").lastIndexOf("/") + 1);

export const upstreamChecks: Check = {
  classes: ["current-pin-mismatch", "reconciled-missing", "adopt-renamed", "adopt-not-identical", "unregistered-upstream-item"],
  async run(ctx) {
    const out: Failure[] = [];
    for (const row of ctx.validRows) {
      const pin = ctx.pins.get(row.upstream!)!;
      if (row.path !== undefined) {
        const entry = (await ctx.source.tree(pin, pin.pin)).get(row.path);
        if (!entry) {
          out.push({ class: "current-pin-mismatch", item: row.id, message: `path ${row.path} does not exist at ${row.upstream}@${pin.pin}` });
        } else if (entry.sha !== row.tree) {
          out.push({ class: "current-pin-mismatch", item: row.id, message: `tree ${row.tree} differs from ${entry.sha} at ${row.upstream}@${pin.pin}:${row.path}` });
        }
      }

      const [ref, path] = isHeld(row) ? [row.held_at!, row.held_path!] : [pin.pin, row.path];
      if (path === undefined) continue; // absent path on a non-held row: reported by absent-path
      const reconciled = await ctx.source.tree(pin, ref);
      const item = reconciled.get(path);
      if (!item) {
        // A non-held row's missing item is the current-Pin failure above.
        if (isHeld(row)) out.push({ class: "reconciled-missing", item: row.id, message: `held_path ${path} does not exist at ${row.upstream}@${ref}` });
        continue;
      }
      if (row.disposition !== "adopt") continue;

      const expected = new Map(
        reconciled
          .blobsUnder(path)
          .filter((b) => item.type === "blob" || b.path !== NEVER_SHIPPED)
          .map((b) => [b.path, b.sha]),
      );
      for (const artifact of row.artifacts) {
        if (!existsSync(join(ctx.root, artifact))) continue; // reported by missing-artifact
        if (basename(artifact) !== basename(path)) {
          out.push({ class: "adopt-renamed", item: row.id, message: `${artifact} is not named ${basename(path)} as at ${row.upstream}@${ref}:${path}` });
        }
        const actual = artifactBlobs(ctx.root, artifact);
        const diffs: string[] = [];
        for (const [p, sha] of expected) {
          if (!actual.has(p)) diffs.push(`missing ${p}`);
          else if (actual.get(p) !== sha) diffs.push(`changed ${p}`);
        }
        for (const p of actual.keys()) if (!expected.has(p)) diffs.push(`extra ${p}`);
        if (diffs.length > 0) {
          const shown = diffs.slice(0, 5).join(", ") + (diffs.length > 5 ? `, and ${diffs.length - 5} more` : "");
          out.push({ class: "adopt-not-identical", item: row.id, message: `${artifact} differs from ${row.upstream}@${ref}:${path} (${shown})` });
        }
      }
    }

    for (const pin of ctx.pins.values()) {
      const registered = new Set(ctx.register.rows.filter((r) => r.upstream === pin.key && r.path).map((r) => r.path!.replace(/\/+$/, "")));
      const tree = await ctx.source.tree(pin, pin.pin);
      for (const e of tree.entries) {
        const pattern = pin.items.find((p) => p.type === e.type && p.regex.test(e.path));
        if (pattern && !registered.has(e.path)) {
          out.push({ class: "unregistered-upstream-item", item: `${pin.key}:${e.path}`, message: `${pattern.kind} at ${pin.key}@${pin.pin} has no row` });
        }
      }
    }
    return out;
  },
};
