<script setup lang="ts">
import type { CommentAnchor } from "#flow/comments.ts";
import type { ResultView } from "~/utils/flow";
import { readerComments, saveComment } from "~/composables/comments";

const props = defineProps<{ r: ResultView }>();
const open = shallowRef(false);
const target = shallowRef("");
const draft = shallowRef("");
const pending = shallowRef(false);
const error = shallowRef("");
const saved = computed(() => readerComments.value.filter((c) => c.result === props.r.id && c.revision === props.r.revision));
const targets = computed(() => [
  { label: "Whole Result block", value: "" },
  ...props.r.entries.map((e) => ({ label: `${e.id}: ${String(e.title ?? e.claim ?? e.file ?? (e.cells as string[] | undefined)?.[0] ?? e.id)}`, value: e.id })),
]);
async function save() {
  if (pending.value || !draft.value.trim()) return;
  pending.value = true;
  error.value = "";
  try {
    const anchor: CommentAnchor = target.value ? { kind: "entry", entry: target.value } : { kind: "block" };
    await saveComment(props.r.id, props.r.revision, anchor, draft.value);
    draft.value = "";
    open.value = false;
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section :aria-label="`Reader comments on ${r.title}`" class="grid min-w-0 gap-2 rounded border border-dashed border-default bg-muted p-3 text-small [overflow-wrap:anywhere]">
    <h3>Reader comments</h3>
    <p class="text-muted">Reader notes, not agent-authored content, answers, or consent.</p>
    <ul v-if="saved.length" class="grid list-none gap-3 ps-0" aria-live="polite">
      <li v-for="c in saved" :key="c.id" class="grid gap-1">
        <p class="text-muted">Stage {{ c.stage }} · Result {{ c.result }}: {{ r.title }} · Revision {{ c.revision }} · {{ c.anchor.kind === 'entry' ? `Entry ${c.anchor.entry}` : 'Whole Result block' }}</p>
        <p class="whitespace-pre-wrap">{{ c.text }}</p>
        <time :datetime="c.time" class="text-muted">{{ formatTime(c.time) }}</time>
      </li>
    </ul>
    <p v-else class="text-muted">No Reader comments on this revision.</p>
    <UButton v-if="!open" class="w-fit active:bg-accented" variant="soft" color="neutral" label="Add Reader comment" @click="open = true" />
    <form v-else class="grid min-w-0 gap-3" @submit.prevent="save">
      <UFormField label="Comment target" :name="`${r.anchor}-target`">
        <USelect v-model="target" :items="targets" class="w-full" :disabled="pending" />
      </UFormField>
      <UFormField label="Comment" :name="`${r.anchor}-comment`" required>
        <UTextarea v-model="draft" required :maxlength="4096" :rows="3" class="w-full" :ui="{ base: 'field-sizing-content min-h-[3lh] max-h-[12lh]' }" :disabled="pending" />
      </UFormField>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Save comment" :loading="pending" :disabled="!draft.trim()" class="active:bg-accented" />
        <UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="pending" class="active:bg-accented" @click="open = false" />
      </div>
    </form>
  </section>
</template>
