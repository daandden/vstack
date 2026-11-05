<script setup lang="ts">
import { flow } from "~/composables/reader";
import type { QuestionView } from "~/utils/flow";

const f = computed(() => flow.value!);
const label = (id: string) => f.value.stage.get(id)?.label ?? id;
function shown(q: QuestionView): { cls: string; html: string } {
  const a = q.answer;
  if (a.picks) return { cls: "pick", html: inline(a.picks.join(", ")) };
  if (a.legacy?.other !== undefined) return { cls: "pick", html: inline(a.legacy.other) };
  if (a.reading?.outcome === "resolved") return { cls: "read", html: `${inline(a.reading.decision)} <span class="quiet">(read from your words)</span>` };
  if (q.retired) return { cls: "open", html: "Retired" };
  if (a.state === "unresolved") return { cls: "open", html: a.why === "headless" ? "Headless, not your answer" : "Not answered" };
  return { cls: "open", html: "Open" };
}
</script>

<template>
  <ol v-if="f.stages.length" id="overview-stages" class="stages" data-stop aria-label="Stages">
    <li v-for="st in f.stages" :id="`overview-${st.id}`" :key="st.id" class="stage" :data-state="st.state">
      <h3><a :href="`#${st.id}`">{{ st.label }}</a> <span class="quiet"><span class="state">{{ STATE_LABELS[st.state] }}</span> · {{ st.open_questions }} open · {{ st.skill }}</span></h3>
      <p v-if="st.parent" class="quiet">Parent <a :href="`#${st.parent}`">{{ label(st.parent) }}</a></p>
      <p v-if="st.children.length" class="quiet">Continued in <template v-for="(id, i) in st.children" :key="id">{{ i ? ", " : "" }}<a :href="`#${id}`">{{ label(id) }}</a></template></p>
      <ul v-if="st.asked.length" class="bullets">
        <li v-for="q in st.asked" :key="q.id"><a :href="`#${q.id}`">Q{{ q.q }}</a> <span v-html="inline(q.title)" /> <span :class="shown(q).cls" v-html="shown(q).html" /></li>
      </ul>
    </li>
  </ol>
  <p v-else class="quiet">No Stage yet.</p>
</template>
