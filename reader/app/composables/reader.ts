// Loads the Flow from the host's reader interface and keeps it current. The host announces each committed revision
// and each observation change on `events`; the reader then fetches `content` or `observations` and keeps the
// reader's place: the paragraph being read stays where it was on screen, and focus stays on its element.
import { flowOf, type Content, type Flow, type Observations } from "~/utils/flow";
import { readingAnchor } from "~/composables/navigation";

export const flow = shallowRef<Flow>();
export const observations = shallowRef<Observations>();
/** Why the Flow could not be read at all, when it could not. */
export const failure = ref<string>();
/** `live` while the host's event stream is open, `reconnecting` while the browser retries it. */
export const connection = ref<"connecting" | "live" | "reconnecting">("connecting");

const here = (path: string) => new URL(path, location.href);

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(here(path), { cache: "no-store", credentials: "same-origin" });
  if (!r.ok) throw new Error(`the Local Flow host answered ${r.status} for ${path}`);
  return (await r.json()) as T;
}

async function keepPlace(change: () => void) {
  const anchor = readingAnchor();
  const focused = document.activeElement;
  change();
  await nextTick();
  if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  if (anchor?.el.isConnected) {
    const moved = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(moved) >= 0.5) scrollBy({ top: moved, behavior: "instant" });
  }
}

let wantedRevision = 0;
let pulling = false;
let refreshPending = false;
let retry: ReturnType<typeof setTimeout> | undefined;
async function pullContent(refresh = false) {
  refreshPending ||= refresh;
  if (pulling) return;
  pulling = true;
  clearTimeout(retry);
  try {
    while (refreshPending || !flow.value || wantedRevision > flow.value.revision) {
      refreshPending = false;
      const next = await fetchJson<Content>("content");
      if (flow.value && next.revision < flow.value.revision) break;
      await keepPlace(() => { flow.value = flowOf(next); });
      wantedRevision = Math.max(wantedRevision, next.revision);
    }
  } catch (e) {
    refreshPending = true;
    if (!flow.value) failure.value = (e as Error).message;
    retry = setTimeout(pullContent, 2000);
  } finally {
    pulling = false;
  }
}

let wantedObservations: string | undefined;
let seenObservations: string | undefined;
let observing = false;
async function pullObservations() {
  if (observing) return;
  observing = true;
  try {
    do {
      const asked = wantedObservations;
      const next = await fetchJson<Observations>("observations");
      await keepPlace(() => { observations.value = next; });
      seenObservations = asked;
    } while (wantedObservations !== seenObservations);
  } catch {
    setTimeout(pullObservations, 2000);
  } finally {
    observing = false;
  }
}

export function startReader() {
  void pullContent();
  void pullObservations();
  const connect = () => {
    const events = new EventSource(here("events"));
    events.addEventListener("open", () => {
      const reconnected = connection.value === "reconnecting";
      void keepPlace(() => { connection.value = "live"; });
      if (reconnected) void pullContent(true);
    });
    events.addEventListener("error", () => {
      void keepPlace(() => { connection.value = "reconnecting"; });
      // A competing listener can return a non-event response. EventSource then closes permanently rather than
      // retrying as it does after a dropped connection, so a fresh stream must be opened when the host returns.
      if (events.readyState === EventSource.CLOSED) setTimeout(connect, 2000);
    });
    events.addEventListener("revision", (e) => {
      wantedRevision = Math.max(wantedRevision, JSON.parse((e as MessageEvent).data).revision);
      void pullContent();
    });
    events.addEventListener("observations", (e) => {
      wantedObservations = JSON.parse((e as MessageEvent).data).version;
      void pullObservations();
    });
  };
  connect();
}
