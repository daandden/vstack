import type { Quiz } from "#flow/model.ts";
import type { Learning } from "#flow/host-api.ts";

export type Attempt = { id: string; result: string; revision: number; question: string; answer: string };
type Saved = { attempts: Attempt[]; accepted: string[] };

export const learning = ref<Saved>({ attempts: [], accepted: [] });
export const durableLocal = ref(true);
export const syncError = ref(false);
let flowId = "";
let syncing = false;
let started = false;

const key = () => `flow-page:learning:${flowId}`;

export function grade(q: Quiz["questions"][number], answer: string): boolean {
  const rule = q.answer;
  if ("choice" in rule) return answer === rule.choice;
  if ("number" in rule) return answer.trim() !== "" && Number.isFinite(Number(answer)) && Math.abs(Number(answer) - rule.number) <= rule.tolerance;
  const normalize = (s: string) => (rule.case_sensitive ? s.trim() : s.trim().toLowerCase());
  return rule.text.some((s) => normalize(s) === normalize(answer));
}

function save() {
  try {
    localStorage.setItem(key(), JSON.stringify(learning.value));
    durableLocal.value = true;
  } catch {
    durableLocal.value = false;
  }
}

function merge(incoming: Attempt[], accepted: string[]) {
  const all = new Map(learning.value.attempts.map((a) => [a.id, a]));
  for (const a of incoming) all.set(a.id, { id: a.id, result: a.result, revision: a.revision, question: a.question, answer: a.answer });
  learning.value = { attempts: [...all.values()], accepted: [...new Set([...learning.value.accepted, ...accepted])] };
}

export async function syncLearning() {
  if (syncing || !document.querySelector(".quiz")) return;
  syncing = true;
  try {
    const pending = learning.value.attempts.filter((a) => !learning.value.accepted.includes(a.id)).slice(0, 100);
    const url = new URL("learning", location.href);
    const r = await fetch(url, pending.length
      ? { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, attempts: pending }) }
      : { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(`learning sync ${r.status}`);
    const progress = (await r.json()) as Learning;
    merge(progress.attempts, progress.attempts.map((a) => a.id));
    syncError.value = false;
    save();
  } catch {
    syncError.value = true;
  } finally {
    syncing = false;
  }
}

export function attempt(a: Omit<Attempt, "id">) {
  learning.value = { ...learning.value, attempts: [...learning.value.attempts, { id: crypto.randomUUID(), ...a }] };
  save();
  void syncLearning();
}

export function startLearning(id: string) {
  if (started) return;
  started = true;
  flowId = id;
  try {
    const saved = JSON.parse(localStorage.getItem(key()) ?? "null");
    if (Array.isArray(saved?.attempts) && Array.isArray(saved?.accepted)) learning.value = saved;
  } catch {}
  addEventListener("online", syncLearning);
  addEventListener("focus", syncLearning);
  addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== key() || !e.newValue) return;
    try {
      const incoming = JSON.parse(e.newValue) as Saved;
      merge(incoming.attempts, incoming.accepted);
      void syncLearning();
    } catch {}
  });
  setInterval(syncLearning, 15000);
}
