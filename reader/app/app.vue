<script setup lang="ts">
import { startReader, useReaderState } from "~/composables/reader";
import { captureReadingPlace, restoreReadingPlace, goTo, onClick, onFocusIn, onFocusOut, onHashChange, onKey, onScroll, openFirstOpenQuestionTab, tab } from "~/composables/navigation";
import { startLearning } from "~/composables/learning";
import { finishReaderRestore, onReaderReload, readReloadState } from "~/composables/reload";
const { flow, connection, failure, updateFailure } = useReaderState();
const initial = useRequestEvent()?.context.flowPage?.content;
if (initial) flow.value = flowOf(initial);
if (import.meta.client) history.scrollRestoration = "manual";

onReaderReload("place", captureReadingPlace);

useHead(() => ({ title: flow.value ? `Flow: ${flow.value.flow.title}` : "Flow" }));

const fragment = () => decodeURIComponent(location.hash.slice(1));
onMounted(() => {
  watch(flow, async (f) => {
    if (!f || arrived) return;
    arrived = true;
    startLearning(f.flow.id);
    await nextTick();
    if (!(await restoreReadingPlace(readReloadState("place"))) && !(await goTo(fragment(), false))) await openFirstOpenQuestionTab();
    try { finishReaderRestore(); } catch {}
  }, { immediate: true });
  startReader();
  addEventListener("keydown", onKey);
  addEventListener("click", onClick);
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("hashchange", onHashChange);
  addEventListener("focusin", onFocusIn);
  addEventListener("focusout", onFocusOut);
});

let arrived = false;

const stageless = computed(() => flow.value?.reading.historical.filter((b) => !b.stage) ?? []);
</script>

<template>
  <div class="reader grid [grid-template-columns:minmax(var(--spacing-gutter),1fr)_min(100%_-_var(--spacing-gutter)*2,var(--container-content))_minmax(var(--spacing-gutter),1fr)] gap-y-2 pbe-6 [&>*]:[grid-column:2]">
    <p v-if="!flow && failure" class="notice" role="alert">
      This Flow could not be read: {{ failure }}. The reader needs the running Local Flow host; run any flow-page command, such as
      <code>bound</code>, to start it, then reload.
    </p>
    <p v-else-if="!flow" class="notice" role="status">Loading the Flow from the Local Flow host…</p>
    <template v-else>
      <TabBar />
      <FlowMasthead />
      <p v-if="connection === 'reconnecting'" class="notice" role="status">
        The Local Flow host stopped answering. This page keeps what it showed and reconnects when the host is back.
      </p>
      <p v-if="updateFailure" class="notice" role="status">{{ updateFailure }}</p>
      <ContextNotes />
      <main id="reading" class="grid" aria-label="Flow content">
        <section id="overview" class="panel grid gap-2 py-entry border-bs border-flow-line" data-tab="overview" :hidden="tab !== 'overview'" aria-labelledby="overview-title">
          <h2 id="overview-title">Overview</h2>
          <ProgressPanel />
          <ChangedSinceVisit />
          <StageOverview />
        </section>
        <StagePanel v-for="st in flow.stages" :key="st.id" :stage="st" />
        <section v-if="flow.topics.length" id="topics" class="panel grid gap-2 py-entry border-bs border-flow-line" data-tab="topics" :hidden="tab !== 'topics'" aria-labelledby="topics-title">
          <h2 id="topics-title">Topic notes</h2>
          <ul class="bullets">
            <li v-for="t in flow.topics" :key="t.id"><a :href="`#${t.id}`" v-html="inline(t.title)" /> <span class="quiet" v-html="inline(t.summary)" /></li>
          </ul>
          <section v-if="stageless.length" class="grid gap-1 [padding-block:0.75rem] border-bs border-flow-border" aria-labelledby="topics-historical">
            <h3 id="topics-historical" class="eyebrow">Historical content in retained order</h3>
            <p class="quiet">Exact publication order across content types was not recorded. This retained order is not a proved chronology.</p>
            <ReadingEntry v-for="b in stageless" :key="b.id" :block="b" />
          </section>
        </section>
      </main>
      <MapPanel />
    </template>
  </div>
</template>
