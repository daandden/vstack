import { flowOf, type Content, type Flow, type Observations } from "~/utils/flow";
import { readingAnchor, restoreReadingAnchor } from "~/composables/navigation";

export const flow = shallowRef<Flow>();
export const observations = shallowRef<Observations>();
/** Why the Flow could not be read at all, when it could not. */
export const failure = ref<string>();
/** `live` after a successful poll, `reconnecting` while the host is unavailable. */
export const connection = ref<"connecting" | "live" | "reconnecting">("connecting");

const here = (path: string) => new URL(path, location.href);

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(here(path), { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`the Local Flow host answered ${r.status} for ${path}`);
  return (await r.json()) as T;
}

async function keepPlace(change: () => void) {
  const anchor = readingAnchor();
  const focused = document.activeElement;
  change();
  await nextTick();
  if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  restoreReadingAnchor(anchor);
}

export function startReader() {
  let seenObservations: string | undefined;
  const poll = async () => {
    try {
      const versions = await fetchJson<{ revision: number; observationVersion: string }>("versions");
      if (!flow.value || versions.revision > flow.value.revision) {
        const next = await fetchJson<Content>("content");
        if (!flow.value || next.revision >= flow.value.revision) {
          await keepPlace(() => { flow.value = flowOf(next); });
        }
      }
      if (versions.observationVersion !== seenObservations) {
        const next = await fetchJson<Observations>("observations");
        await keepPlace(() => { observations.value = next; });
        seenObservations = versions.observationVersion;
      }
      failure.value = undefined;
      if (connection.value !== "live") await keepPlace(() => { connection.value = "live"; });
    } catch (e) {
      if (!flow.value) failure.value = (e as Error).message;
      if (connection.value !== "reconnecting") await keepPlace(() => { connection.value = "reconnecting"; });
    } finally {
      // Schedule only after the complete poll, including content reads, has released its connection.
      setTimeout(poll, connection.value === "live" ? 500 : 2000);
    }
  };
  void poll();
}
