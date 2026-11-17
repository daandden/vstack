import { flowOf, type Content, type Flow, type Observations } from "~/utils/flow";
import { goTo, readingAnchor, restoreReadingAnchor, tab } from "~/composables/navigation";
import { refreshComments } from "~/composables/comments";
import { reloadReader } from "~/composables/reload";

export function useReaderState() {
  return {
    flow: useState<Flow | undefined>("flow"),
    observations: useState<Observations | undefined>("flow-observations"),
    failure: useState<string | undefined>("flow-failure"),
    connection: useState<"connecting" | "live" | "reconnecting">("flow-connection", () => "connecting"),
    updateFailure: useState<string | undefined>("flow-update-failure"),
  };
}

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
  const { flow, observations, failure, connection, updateFailure } = useReaderState();
  let seenObservations: string | undefined;
  let seenHost = document.querySelector<HTMLMetaElement>('meta[name="flow-host-generation"]')?.content;
  const loadedReader = document.querySelector<HTMLMetaElement>('meta[name="flow-reader-generation"]')?.content;
  let seenReader = loadedReader;
  const poll = async () => {
    try {
      const versions = await fetchJson<{ revision: number; observationVersion: string; hostGeneration: string; readerGeneration: string }>("versions");
      if (seenReader && versions.readerGeneration !== seenReader) {
        try {
          reloadReader();
          return;
        } catch {
          updateFailure.value = "The reader update is waiting until Reader comments finish saving and browser-local recovery state can be saved. Your drafts remain on this page.";
        }
      } else updateFailure.value = undefined;
      seenReader ??= versions.readerGeneration;
      const replaced = seenHost !== undefined && versions.hostGeneration !== seenHost;
      if (!flow.value || replaced || versions.revision > flow.value.revision) {
        const next = await fetchJson<Content>("content");
        if (!flow.value || next.revision >= flow.value.revision) {
          const previous = flow.value;
          const updated = flowOf(next);
          const question = previous && updated.next.findLast((id) => !previous.question.has(id) && updated.question.get(id)?.stage === tab.value);
          await keepPlace(() => { flow.value = updated; });
          if (question) await goTo(question, true, true);
        }
      }
      seenHost = versions.hostGeneration;
      if (replaced || versions.observationVersion !== seenObservations) {
        const next = await fetchJson<Observations>("observations");
        await keepPlace(() => { observations.value = next; });
        seenObservations = versions.observationVersion;
      }
      await refreshComments();
      failure.value = undefined;
      if (connection.value !== "live") await keepPlace(() => { connection.value = "live"; });
    } catch (e) {
      if (!flow.value) failure.value = (e as Error).message;
      if (connection.value !== "reconnecting") await keepPlace(() => { connection.value = "reconnecting"; });
    } finally {
      setTimeout(poll, connection.value === "live" ? 500 : 2000);
    }
  };
  void poll();
}
