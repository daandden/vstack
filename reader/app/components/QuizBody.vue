<script setup lang="ts">
import { durableLocal, grade, learning, attempt, syncError, syncLearning } from "~/composables/learning";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView }>();
const quiz = computed(() => props.r.quiz!);
const mine = computed(() => learning.value.attempts.filter((a) => a.result === props.r.id && a.revision === props.r.revision));
const tries = (ref: string) => mine.value.filter((a) => a.question === ref);
const complete = computed(() => quiz.value.questions.every((q) => tries(q.ref).some((a) => grade(q, a.answer))));
const pending = computed(() => mine.value.filter((a) => !learning.value.accepted.includes(a.id)).length);
function recordAnswer(question: string, answer: string) {
  attempt({ result: props.r.id, revision: props.r.revision, question, answer });
}
onMounted(() => void syncLearning());
</script>

<template>
  <div class="quiz grid gap-2" @keydown.stop>
    <QuizQuestion v-for="q in quiz.questions" :key="q.ref" :q="q" :attempts="tries(q.ref)" @answer="recordAnswer(q.ref, $event)" />
    <p class="quiz-completion text-success" role="status">{{ complete ? "Lesson complete." : "Lesson in progress." }}</p>
    <p class="text-small text-muted" role="status">
      <template v-if="!durableLocal">Browser storage is unavailable. Unsynced attempts may be lost when this page closes.</template>
      <template v-else-if="pending">{{ pending }} attempt(s) saved in this browser, waiting to sync.</template>
      <template v-else-if="syncError">The Local Flow host is unavailable. Saved progress remains in this browser.</template>
      <template v-else>Progress saved with the Flow.</template>
    </p>
    <p class="text-small text-muted">Learning progress only. These answers do not settle real asks or authorize work.</p>
  </div>
</template>
