<script setup lang="ts">
import { foldedQuestionOutcome, type QuestionView } from "~/utils/flow";

const { question, label } = defineProps<{ question: QuestionView; label: string }>();
const answer = computed(() => question.answer);
const response = computed(() => answer.value.response);
const reading = computed(() => answer.value.reading);
</script>

<template>
  <details class="disclosure wrap-anywhere">
    <summary class="min-h-control content-center">Earlier attempt</summary>
    <a :href="`#${question.id}`">{{ label }}, asked earlier</a>
    <CorrectionNotice :notice="answer" />
    <p>{{ foldedQuestionOutcome(question) }}</p>
    <dl class="grid gap-1 [&_dt]:font-semibold [&_dt]:text-flow-teal">
      <template v-if="response?.status === 'answered' && response.text !== undefined">
        <dt>Your words<span v-if="response.note_on"> on {{ response.note_on }}</span></dt>
        <dd class="whitespace-pre-wrap">{{ response.text }}</dd>
      </template>
      <template v-else-if="answer.legacy?.other !== undefined">
        <dt>Recorded answer</dt>
        <dd class="whitespace-pre-wrap">{{ answer.legacy.other }}</dd>
      </template>
      <template v-if="answer.legacy?.note">
        <dt>Recorded note</dt>
        <dd class="whitespace-pre-wrap">{{ answer.legacy.note }}</dd>
      </template>
      <template v-if="reading">
        <dt>Agent reading</dt>
        <dd v-if="reading.outcome === 'resolved'" class="grid gap-1">
          <p v-html="inline(reading.decision)" />
          <p v-html="inline(reading.basis)" />
        </dd>
        <dd v-else v-html="inline(reading.unresolved)" />
      </template>
    </dl>
  </details>
</template>
