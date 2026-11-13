export type ObjectValue = Record<string, unknown>;
/** One changed leaf: the unchanged `prefix` and `suffix` around the `removed` and `added` runs of whole tokens. */
export type Change = { path: string; before?: string; after?: string; prefix: string; suffix: string; removed?: string; added?: string };
export const object = (v: unknown): v is ObjectValue => v !== null && typeof v === "object" && !Array.isArray(v);
const title = (s: string) => s.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
/** Words, numbers with their decimal and digit-group separators, runs of space, and single other characters. */
const tokens = (text: string) => text.match(/\p{L}[\p{L}\p{M}'’]*|\p{N}+(?:[.,]\p{N}+)*|\s+|[^]/gu) ?? [];

/** The changed leaves between two content snapshots, in reading order, with list items matched by stable keys. */
export function difference(before: ObjectValue, after: ObjectValue): Change[] {
  const changes: Change[] = [];
  const equal = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => Object.hasOwn(b, k) && equal(v, b[k]));
    return false;
  };
  function leaf(a: unknown, b: unknown, path: string[]) {
    const before = a === undefined ? undefined : String(a), after = b === undefined ? undefined : String(b);
    let prefix = "", suffix = "", removed = before, added = after;
    if (typeof a === "string" && typeof b === "string") {
      const old = tokens(a), next = tokens(b);
      let start = 0, end = 0;
      while (start < old.length && start < next.length && old[start] === next[start]) start++;
      while (end < old.length - start && end < next.length - start && old[old.length - end - 1] === next[next.length - end - 1]) end++;
      prefix = old.slice(0, start).join(""); suffix = end ? old.slice(-end).join("") : "";
      removed = old.slice(start, old.length - end).join(""); added = next.slice(start, next.length - end).join("");
    }
    changes.push({ path: path.join(" / "), before, after, prefix, suffix, removed, added });
  }
  function visit(a: unknown, b: unknown, path: string[]) {
    if (equal(a, b)) return;
    if ((object(a) || a === undefined) && (object(b) || b === undefined)) {
      const old = a ?? {}, next = b ?? {};
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) visit(old[key], next[key], [...path, title(key)]);
    } else if ((Array.isArray(a) || a === undefined) && (Array.isArray(b) || b === undefined)) {
      sequence(a ?? [], b ?? [], path);
    } else if (object(a) || object(b) || Array.isArray(a) || Array.isArray(b)) {
      visit(a, undefined, [...path, "Removed"]); visit(undefined, b, [...path, "Added"]);
    } else leaf(a, b, path);
  }
  function sequence(a: unknown[], b: unknown[], path: string[]) {
    const keys = ["ref", "id", "heading", "series", "name", "title", "claim", "file"];
    const key = keys.find(k => [...a, ...b].every(v => object(v) && typeof v[k] === "string") && new Set(a.map(v => (v as ObjectValue)[k])).size === a.length && new Set(b.map(v => (v as ObjectValue)[k])).size === b.length);
    if (key) {
      const old = new Map(a.map(v => [String((v as ObjectValue)[key]), v]));
      const next = new Map(b.map(v => [String((v as ObjectValue)[key]), v]));
      for (const id of new Set([...old.keys(), ...next.keys()])) {
        const value = (next.get(id) ?? old.get(id)) as ObjectValue;
        const name = value.heading ?? value.name ?? value.label ?? value.title ?? value.claim ?? id;
        visit(old.get(id), next.get(id), [...path, String(name)]);
      }
      const oldOrder = [...old.keys()].filter(id => next.has(id)), newOrder = [...next.keys()].filter(id => old.has(id));
      if (!equal(oldOrder, newOrder)) leaf(oldOrder.join(", "), newOrder.join(", "), [...path, "Order"]);
      return;
    }
    visitChangedRunsBetweenUnchangedItems(a, b, path);
  }
  function visitChangedRunsBetweenUnchangedItems(before: unknown[], after: unknown[], path: string[]) {
    let i = 0, j = 0;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && equal(before[i], after[j])) { i++; j++; continue; }
      let nextUnchangedBefore = before.length, nextUnchangedAfter = after.length;
      for (let x = i; x < before.length; x++) {
        const y = after.findIndex((v, n) => n >= j && equal(before[x], v));
        if (y !== -1) { nextUnchangedBefore = x; nextUnchangedAfter = y; break; }
      }
      const size = Math.max(nextUnchangedBefore - i, nextUnchangedAfter - j);
      for (let n = 0; n < size; n++) visit(i + n < nextUnchangedBefore ? before[i + n] : undefined, j + n < nextUnchangedAfter ? after[j + n] : undefined, [...path, String(j + n + 1)]);
      i = nextUnchangedBefore; j = nextUnchangedAfter;
    }
  }
  visit(before, after, []);
  return changes;
}
