const captures = new Map<string, () => unknown>();
let restored: Record<string, unknown> | undefined;
const key = () => `flow-reader:reload:${location.pathname}`;

export function readReloadState(name: string): unknown {
  if (!import.meta.client) return;
  if (!restored) {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(key()) ?? "null");
      restored = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch { restored = {}; }
  }
  return restored[name];
}

type Kinds = { string: string; number: number; "number or null": number | null; record: Record<string, unknown>; "number pair": [number, number]; list: unknown[] };
const checks: { [K in keyof Kinds]: (v: unknown) => boolean } = {
  string: v => typeof v === "string",
  number: v => typeof v === "number",
  "number or null": v => v === null || typeof v === "number",
  record: v => !!v && typeof v === "object" && !Array.isArray(v),
  "number pair": v => Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number",
  list: v => Array.isArray(v),
};
type Saved<S extends Record<string, keyof Kinds>> = { [K in keyof S]: Kinds[S[K]] };

/** Saved browser state with every `required` field of its kind, or `undefined`; `optional` fields of another kind are dropped. */
export function savedState<S extends Record<string, keyof Kinds>, O extends Record<string, keyof Kinds> = Record<never, keyof Kinds>>(value: unknown, required: S, optional?: O): (Saved<S> & Partial<Saved<O>>) | undefined {
  if (!checks.record(value)) return;
  const record = value as Record<string, unknown>;
  if (Object.entries(required).some(([name, kind]) => !checks[kind](record[name]))) return;
  const kept = Object.fromEntries(Object.entries(optional ?? {}).filter(([name, kind]) => checks[kind](record[name])).map(([name]) => [name, record[name]]));
  return { ...kept, ...Object.fromEntries(Object.keys(required).map(name => [name, record[name]])) } as Saved<S> & Partial<Saved<O>>;
}

export function onReaderReload(name: string, capture: () => unknown) {
  onMounted(() => { captures.set(name, capture); });
  onBeforeUnmount(() => { captures.delete(name); });
}

export function reloadReader() {
  const saved = Object.fromEntries([...captures].map(([name, capture]) => [name, capture()]));
  sessionStorage.setItem(key(), JSON.stringify(saved));
  location.reload();
}

export function finishReaderRestore() {
  sessionStorage.removeItem(key());
}
