<script setup lang="ts">
import { durableLocal, grade, learning, attempt, syncError, syncLearning } from "~/composables/learning";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView }>();
const quiz = computed(() => props.r.quiz!);
const mine = computed(() => learning.value.attempts.filter((a) => a.result === props.r.id && a.revision === props.r.revision));
const tries = (ref: string) => mine.value.filter((a) => a.question === ref);
const complete = computed(() => quiz.value.questions.every((q) => tries(q.ref).some((a) => grade(q, a.answer))));
const pending = computed(() => mine.value.filter((a) => !learning.value.accepted.includes(a.id)).length);
const drafts = reactive<Record<string, string | number>>({});
const empty = reactive<Record<string, boolean>>({});
function check(q: (typeof quiz.value.questions)[number]) {
  const answer = String(drafts[q.ref] ?? "");
  empty[q.ref] = !answer.trim();
  if (empty[q.ref]) return;
  attempt({ result: props.r.id, revision: props.r.revision, question: q.ref, answer });
}
onMounted(() => void syncLearning());
</script>

<template>
  <div class="quiz" @keydown.stop>
    <form v-for="(q, i) in quiz.questions" :key="q.ref" :data-question="q.ref" @submit.prevent="check(q)">
      <fieldset>
        <legend v-html="inline(q.prompt)" />
        <template v-if="q.choices">
          <label v-for="c in q.choices" :key="c.ref"><input v-model="drafts[q.ref]" type="radio" :name="`${r.anchor}-quiz-${i + 1}`" :value="c.ref"> {{ c.label }}</label>
        </template>
        <label v-else>Answer <input v-model="drafts[q.ref]" :name="`${r.anchor}-quiz-${i + 1}`" :type="'number' in q.answer ? 'number' : 'text'" :step="'number' in q.answer ? 'any' : undefined" required></label>
      </fieldset>
      <button type="submit">Check answer</button>
      <p class="quiz-feedback" role="status" :data-correct="tries(q.ref).length ? String(grade(q, tries(q.ref).at(-1)!.answer)) : undefined">
        <template v-if="empty[q.ref]">Enter or choose an answer first.</template>
        <template v-else-if="tries(q.ref).length">{{ grade(q, tries(q.ref).at(-1)!.answer) ? "Correct." : "Not yet." }} {{ q.explanation }} Attempts: {{ tries(q.ref).length }}.</template>
      </p>
    </form>
    <p class="quiz-completion" role="status">{{ complete ? "Lesson complete." : "Lesson in progress." }}</p>
    <p class="quiet" role="status">
      <template v-if="!durableLocal">Browser storage is unavailable. Unsynced attempts may be lost when this page closes.</template>
      <template v-else-if="pending">{{ pending }} attempt(s) saved in this browser, waiting to sync.</template>
      <template v-else-if="syncError">The Local Flow host is unavailable. Saved progress remains in this browser.</template>
      <template v-else>Progress saved with the Flow.</template>
    </p>
    <p class="quiet">Learning progress only. These answers do not settle real asks or authorize work.</p>
  </div>
</template>
