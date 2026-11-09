<script setup lang="ts">
import { flow } from "~/composables/reader";
import { entryTitle } from "~/utils/flow";

const f = computed(() => flow.value!);
const backgrounds = computed(() => f.value.stages.flatMap((st) => (st.background ? [{ stage: st, bg: st.background }] : [])));
const terms = computed(() => f.value.questions.flatMap((q) => (q.terms ?? []).map((t) => ({ q, t }))));
const backlinks = computed(() => f.value.questions.flatMap((q) => (q.entries ?? []).map((ref) => ({ q, ref, title: entryTitle(f.value, ref) }))));
const ask = (id: string) => f.value.question.get(id);
</script>

<template>
  <details class="context-outline [padding-block:0.25rem] border-be border-muted open:grid open:gap-2 open:[padding-block-end:0.75rem]">
    <summary>Context and related notes</summary>
    <div class="context">
      <section v-if="backgrounds.length" aria-labelledby="context-backgrounds">
        <h2 id="context-backgrounds" class="eyebrow">Backgrounds</h2>
        <ul class="bullets">
          <li v-for="{ stage, bg } in backgrounds" :key="bg.id"><a :href="`#${bg.id}`" v-html="inline(bg.title)" /> <span class="quiet">{{ stage.label }}</span></li>
        </ul>
      </section>
      <section v-if="f.topics.length" aria-labelledby="context-topics">
        <h2 id="context-topics" class="eyebrow">Topic notes</h2>
        <ul class="bullets">
          <li v-for="t in f.topics" :key="t.id">
            <a :href="`#${t.id}`" v-html="inline(t.title)" />
            <span v-if="t.questions.length" class="quiet"> · asked in <template v-for="(id, i) in t.questions" :key="id">{{ i ? ", " : "" }}<a :href="`#${id}`">Q{{ ask(id)?.q }}</a></template></span>
          </li>
        </ul>
      </section>
      <section v-if="terms.length" aria-labelledby="context-terms">
        <h2 id="context-terms" class="eyebrow">Term notes</h2>
        <dl class="terms">
          <template v-for="{ q, t } in terms" :key="`${q.id}:${t.term}`">
            <dt><span v-html="inline(t.term)" /> <a class="quiet" :href="`#${q.id}`">on Q{{ q.q }}</a></dt>
            <dd v-html="inline(t.text)" />
          </template>
        </dl>
      </section>
      <section v-if="backlinks.length" aria-labelledby="context-backlinks">
        <h2 id="context-backlinks" class="eyebrow">Backlinks</h2>
        <ul class="bullets">
          <li v-for="b in backlinks" :key="`${b.q.id}:${b.ref}`">
            <a :href="`#${b.ref.replace('/', '-')}`"><span v-html="inline(b.title?.result ?? b.ref)" /> <span class="entry-id">{{ b.title?.entry }}</span></a>
            informs <a :href="`#${b.q.id}`">Q{{ b.q.q }}</a>
          </li>
        </ul>
      </section>
      <p class="meta"><a href="#progress">Authored progress</a><a href="#observations">Read-only observations</a></p>
    </div>
  </details>
</template>
