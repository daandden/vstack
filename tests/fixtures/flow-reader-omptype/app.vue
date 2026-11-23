<script setup lang="ts">
import { type } from "@oh-my-pi/omptype";
import { useForm } from "@tanstack/vue-form";

const schema = type({
  record: {
    label: type("string").narrow(value => value.trim().length > 0)
      .configure({ message: "Enter a record label." }).pipe(value => value.trim()),
    count: type("string").narrow(value => value.trim() !== "" && Number.isFinite(Number(value)))
      .configure({ message: "Enter a sample count." }).pipe(Number),
  },
});
const submitted = shallowRef("No submission");
const ready = shallowRef(false);
const form = useForm({
  defaultValues: { record: { label: "", count: "" } },
  validators: { onSubmit: schema },
  onSubmit: ({ value }) => {
    const parsed = schema(value);
    if (!(parsed instanceof type.errors)) submitted.value = JSON.stringify(parsed);
  },
});
onMounted(() => { ready.value = true; });
</script>

<template>
  <main>
    <h1>Nested schema CSP proof</h1>
    <form novalidate @submit.prevent="form.handleSubmit()">
      <component :is="form.Field" v-slot="{ field }" name="record.label">
        <label>Record label <input :value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)"></label>
        <p v-for="issue in field.state.meta.errors" :key="issue?.message" role="alert">{{ issue?.path?.join('.') }}: {{ issue?.message }}</p>
      </component>
      <component :is="form.Field" v-slot="{ field }" name="record.count">
        <label>Sample count <input :value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)"></label>
        <p v-for="issue in field.state.meta.errors" :key="issue?.message" role="alert">{{ issue?.path?.join('.') }}: {{ issue?.message }}</p>
      </component>
      <button type="submit" :disabled="!ready">Validate nested input</button>
    </form>
    <output>{{ submitted }}</output>
  </main>
</template>
