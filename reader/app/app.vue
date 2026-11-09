<script setup lang="ts">
import { connection, failure, flow, startReader } from "~/composables/reader";
import { goTo, onClick, onKey, onScroll, openFirstOpenQuestionTab, tab } from "~/composables/navigation";
import { startTheme } from "~/composables/theme";
import { startLearning } from "~/composables/learning";

useHead(() => ({ title: flow.value ? `Flow: ${flow.value.flow.title}` : "Flow" }));

const fragment = () => decodeURIComponent(location.hash.slice(1));
onMounted(() => {
  startTheme();
  startReader();
  addEventListener("keydown", onKey);
  addEventListener("click", onClick);
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("hashchange", () => void goTo(fragment(), true));
});

let arrived = false;
watch(flow, async (f) => {
  if (!f || arrived) return;
  arrived = true;
  startLearning(f.flow.id);
  await nextTick();
  if (!(await goTo(fragment(), false))) await openFirstOpenQuestionTab();
});

const stageless = computed(() => flow.value?.reading.historical.filter((b) => !b.stage) ?? []);
</script>

<template>
  <div class="reader">
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
      <ContextNotes />
      <main id="reading" aria-label="Flow content">
        <section id="overview" class="panel reference" data-tab="overview" :hidden="tab !== 'overview'" aria-labelledby="overview-title">
          <h2 id="overview-title">Overview</h2>
          <ProgressPanel />
          <StageOverview />
          <p class="quiet">Keys: <kbd>j</kbd> <kbd>k</kbd> next and previous section, <kbd>h</kbd> <kbd>l</kbd> previous and next tab, <kbd>n</kbd> next open question, <kbd>m</kbd> Map.</p>
        </section>
        <StagePanel v-for="st in flow.stages" :key="st.id" :stage="st" />
        <section v-if="flow.topics.length" id="topics" class="panel reference" data-tab="topics" :hidden="tab !== 'topics'" aria-labelledby="topics-title">
          <h2 id="topics-title">Topic notes</h2>
          <ul class="bullets">
            <li v-for="t in flow.topics" :key="t.id"><a :href="`#${t.id}`" v-html="inline(t.title)" /> <span class="quiet" v-html="inline(t.summary)" /></li>
          </ul>
          <section v-if="stageless.length" class="boundary" aria-labelledby="topics-historical">
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
