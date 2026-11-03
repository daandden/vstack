<script setup lang="ts">
import { connection, failure, flow, startReader } from "~/composables/reader";
import { goTo, markFromScroll, onClick, onKey } from "~/composables/navigation";
import { startTheme } from "~/composables/theme";
import { startLearning } from "~/composables/learning";

useHead(() => ({ title: flow.value ? `Flow: ${flow.value.flow.title}` : "Flow" }));

const fragment = () => decodeURIComponent(location.hash.slice(1));
onMounted(() => {
  startTheme();
  startReader();
  addEventListener("keydown", onKey);
  addEventListener("click", onClick);
  addEventListener("scroll", markFromScroll, { passive: true });
  addEventListener("hashchange", () => goTo(fragment(), true));
});

let arrived = false;
watch(flow, async (f) => {
  if (!f || arrived) return;
  arrived = true;
  startLearning(f.flow.id);
  await nextTick();
  if (fragment()) goTo(fragment(), false);
  else markFromScroll();
});

const publications = computed(() => flow.value?.reading.publications ?? []);
const historical = computed(() => flow.value?.reading.historical ?? []);
</script>

<template>
  <div class="reader">
    <p v-if="!flow && failure" class="notice" role="alert">
      This Flow could not be read: {{ failure }}. The reader needs the running Local Flow host; run any flow-page command, such as
      <code>bound</code>, to start it, then reload.
    </p>
    <p v-else-if="!flow" class="notice" role="status">Loading the Flow from the Local Flow host…</p>
    <template v-else>
      <FlowMasthead />
      <p v-if="connection === 'reconnecting'" class="notice" role="status">
        The Local Flow host stopped answering. This page keeps what it showed and reconnects when the host is back.
      </p>
      <OutlineNav />
      <ContextNotes />
      <main id="reading" aria-label="Flow reading sequence">
        <section v-if="historical.length" id="historical-content" class="boundary" aria-labelledby="historical-title">
          <h2 id="historical-title" class="eyebrow">Historical content in retained order</h2>
          <p class="quiet">Exact publication order across content types was not recorded. This retained order is not a proved chronology.</p>
          <ReadingEntry v-for="b in historical" :key="b.id" :block="b" />
        </section>
        <section v-if="historical.length && publications.length" id="publication-order" class="boundary" aria-labelledby="publication-order-title">
          <h2 id="publication-order-title" class="eyebrow">First-publication order starts here</h2>
          <p class="quiet">Positions below record each block's first publication to the Flow. Answers and revisions update their block in place.</p>
        </section>
        <ReadingEntry v-for="b in publications" :key="b.id" :block="b" :position="b.position" />
        <p v-if="!historical.length && !publications.length" class="quiet">Nothing recorded yet.</p>
      </main>
      <section id="overview" class="reference" aria-labelledby="overview-title">
        <h2 id="overview-title">Overview</h2>
        <ProgressPanel />
        <StageOverview />
      </section>
      <section v-if="flow.topics.length" id="topics" class="reference" aria-labelledby="topics-title">
        <h2 id="topics-title">Topic notes</h2>
        <ul class="bullets">
          <li v-for="t in flow.topics" :key="t.id"><a :href="`#${t.id}`" v-html="inline(t.title)" /> <span class="quiet" v-html="inline(t.summary)" /></li>
        </ul>
      </section>
      <StageTree />
    </template>
  </div>
</template>
