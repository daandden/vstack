<script lang="ts">
import { type } from "@oh-my-pi/omptype";

const answered = type("string").narrow(answer => answer.trim().length > 0);
const choiceSchema = type({ answer: answered.configure({ message: "Choose an answer." }) });
const textSchema = type({ answer: answered.configure({ message: "Enter an answer." }) });
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const numberSchema = type({
  answer: type("string")
    .narrow(answer => decimal.test(answer.trim()) && Number.isFinite(Number(answer)))
    .configure({ message: ({ data }) => typeof data === "string" && data.trim() ? "Enter a number, such as 5 or 2.5." : "Enter an answer." })
    .pipe(Number),
});
</script>

<script setup lang="ts">
import { revalidateLogic, useForm, type StandardSchemaV1 } from "@tanstack/vue-form";
import type { Quiz } from "#flow/model.ts";
import { grade, type Attempt } from "~/composables/learning";
import Button from "./ui/Button.vue";
import Field from "./ui/Field.vue";
import Input from "./ui/Input.vue";

const { q, attempts } = defineProps<{ q: Quiz["questions"][number]; attempts: readonly Attempt[] }>();
const emit = defineEmits<{ answer: [answer: string] }>();
const id = useId();
const isNumber = computed(() => "number" in q.answer);
const schema = computed(() => q.choices ? choiceSchema : isNumber.value ? numberSchema : textSchema);
const validator = computed<StandardSchemaV1<{ answer: string }, { answer: string | number }>>(() => schema.value);
const form = useForm({
  defaultValues: { answer: "" },
  validationLogic: revalidateLogic(),
  validators: { onDynamic: validator.value },
  onSubmit: ({ value }) => {
    const parsed = schema.value(value);
    if (!(parsed instanceof type.errors)) emit("answer", String(parsed.answer));
  },
});
watch(validator, onDynamic => form.update({ ...form.options, validators: { onDynamic } }));
const correct = computed(() => {
  const last = attempts.at(-1);
  return last ? grade(q, last.answer) : undefined;
});
</script>

<template>
  <form :data-question="q.ref" class="grid gap-2 border-be border-flow-line py-3" novalidate @submit.prevent="form.handleSubmit()">
    <component :is="form.Field" v-slot="{ field }" name="answer">
      <fieldset class="m-0 min-w-0 border-0 p-0">
        <legend class="mbe-2 font-semibold" v-html="inline(q.prompt)" />
        <Field :id="id" :label="q.choices ? undefined : 'Answer'" :horizontal="!q.choices" :errors="field.state.meta.errors">
          <template #default="{ control }">
            <template v-if="q.choices">
              <label v-for="c in q.choices" :key="c.ref" class="flex min-h-11 flex-wrap items-center gap-2">
                <input
                  type="radio"
                  :name="id"
                  :value="c.ref"
                  :checked="field.state.value === c.ref"
                  :aria-invalid="control['aria-invalid']"
                  :aria-describedby="control['aria-describedby']"
                  class="accent-[var(--blue)]"
                  @change="field.handleChange(c.ref)"
                  @blur="field.handleBlur()"
                  @keydown.enter.prevent="form.handleSubmit()"
                > {{ c.label }}
              </label>
            </template>
            <Input v-else v-bind="control" :model-value="field.state.value" :inputmode="isNumber ? 'decimal' : undefined" type="text" class="quiz-answer max-w-[20rem]" @update:model-value="field.handleChange(String($event ?? ''))" @blur="field.handleBlur()" />
          </template>
        </Field>
      </fieldset>
      <Button type="submit" class="quiz-check min-h-11 justify-self-start">Check answer</Button>
      <p class="quiz-feedback data-[correct=true]:text-[color:var(--green)] data-[correct=false]:text-[color:var(--peach)]" role="status" :data-correct="correct">
        <template v-if="correct !== undefined && !field.state.meta.errors.length">{{ correct ? "Correct." : "Not yet." }} {{ q.explanation }} Attempts: {{ attempts.length }}.</template>
      </p>
    </component>
  </form>
</template>

<style scoped>
.quiz-answer {
  background: var(--surface0);
  padding: 0.5rem;
  font-size: max(16px, 1rem);
  line-height: 1.6;
}

.quiz-check {
  border-color: var(--blue);
  background: var(--surface0);
  padding-inline: 1rem;
  font-size: var(--fs-body);
  font-weight: 600;
}
</style>
