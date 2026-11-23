<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import { blockLabel, type Flow, type ReadingBlock } from "~/utils/flow";
import { onReaderReload, readReloadState, savedState } from "~/composables/reload";

type Visit = { revision: number; blocks: Record<string, string> };
const previous = shallowRef<Visit>();
const storageUnavailable = shallowRef(false);
let key: string | undefined;

function tokens(f: Flow): Record<string, string> {
  const blocks: Record<string, string> = {};
  const results = new Map(f.stages.flatMap(st => st.results.map(r => [r.id, r.changed] as const)));
  const assumptions = new Map(f.stages.flatMap(st => st.assumed.map(a => [a.id, a.reopened_by] as const)));
  for (const b of [...f.reading.historical, ...f.reading.publications]) {
    if (b.kind === "result") blocks[b.id] = String(results.get(b.id));
    else if (b.kind === "question") {
      const q = f.question.get(b.id);
      blocks[b.id] = JSON.stringify([q?.answer, q?.retired, q?.asked_again_by, q?.decided_in]);
    } else if (b.kind === "assumed") blocks[b.id] = assumptions.get(b.id) ?? "";
    else blocks[b.id] = "";
  }
  return blocks;
}

function readVisit(value: string | null, revision: number): Visit | undefined {
  if (!value) return;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return; }
  const saved = savedState(parsed, { revision: "number", blocks: "record" });
  if (!saved || !Number.isSafeInteger(saved.revision) || saved.revision < 0 || saved.revision > revision) return;
  const blocks: Record<string, string> = {};
  for (const [id, token] of Object.entries(saved.blocks)) {
    if (typeof token !== "string") return;
    blocks[id] = token;
  }
  return { revision: saved.revision, blocks };
}

const current = computed(() => flow.value ? tokens(flow.value) : {});
const changes = computed(() => {
  const f = flow.value;
  const seen = previous.value;
  if (!f || !seen) return [];
  const changed = (b: ReadingBlock) => Object.hasOwn(seen.blocks, b.id) && seen.blocks[b.id] !== current.value[b.id];
  return [
    ...f.reading.historical.filter(changed).map(b => ({ ...b, status: "Revised", historical: true })),
    ...f.reading.publications.filter(b => b.publication > seen.revision || changed(b)).map(b => ({ ...b, status: b.publication > seen.revision ? "New" : "Revised", historical: false })),
  ];
});
const label = (b: ReadingBlock) => b.kind === "question" ? `${blockLabel(flow.value!, b)}. ${flow.value!.question.get(b.id)?.title ?? b.id}` : blockLabel(flow.value!, b);
function destination(b: ReadingBlock, status: string): string {
  if (b.kind !== "result" || status !== "Revised") return b.id;
  const result = flow.value?.stages.flatMap(st => st.results).find(r => r.id === b.id);
  const seen = Number(previous.value?.blocks[b.id]);
  const snapshot = result?.history.find(h => h.changed === seen) ?? result?.history.at(-1);
  return snapshot ? `${b.id}-changes-${snapshot.changed}` : b.id;
}
onReaderReload("visit", () => previous.value ?? null);

onMounted(() => {
  watch(flow, f => {
    if (!f) return;
    const nextKey = `flow-visit:${location.pathname}:${f.flow.id}`;
    try {
      if (nextKey !== key) {
        key = nextKey;
        const restored = readReloadState("visit");
        previous.value = readVisit(restored === undefined ? localStorage.getItem(key) : JSON.stringify(restored), f.revision);
      }
      localStorage.setItem(key, JSON.stringify({ revision: f.revision, blocks: current.value } satisfies Visit));
      storageUnavailable.value = false;
    } catch {
      storageUnavailable.value = true;
    }
  }, { immediate: true, flush: "post" });
});
</script>

<template>
  <nav class="grid gap-1.5 text-small" aria-labelledby="visit-changes-title">
    <h3 id="visit-changes-title">Changed since last visit</h3>
    <p v-if="storageUnavailable" class="quiet">Browser-local viewing state is unavailable. This visit cannot be remembered.</p>
    <p v-else-if="!previous" class="quiet">First visit in this browser. This revision is remembered locally for your next visit.</p>
    <template v-else>
      <p class="quiet">Since revision {{ previous.revision }}. Viewing state stays in this browser and never answers a question.</p>
      <ul v-if="changes.length" class="grid gap-1.5 list-disc ps-5 marker:text-flow-dimmed">
        <li v-for="b in changes" :key="b.id">
          <a :href="`#${destination(b, b.status)}`" class="[overflow-wrap:anywhere]">{{ label(b) }} <span class="text-flow-subtext">{{ b.status }} · {{ b.stage ? flow?.stage.get(b.stage)?.label : 'Topic notes' }}<template v-if="b.historical"> · Historical, retained order</template></span></a>
        </li>
      </ul>
      <p v-else class="quiet">No new or revised blocks since your last visit.</p>
    </template>
  </nav>
</template>
