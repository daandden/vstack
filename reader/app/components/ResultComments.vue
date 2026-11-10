<script setup lang="ts">
import type { CommentAnchor, ReaderComment } from "#flow/comments.ts";
import type { ResultView } from "~/utils/flow";
import { readerComments, saveComment, editComment, removeComment } from "~/composables/comments";

const props = defineProps<{ r: ResultView; content: HTMLElement | null }>();
const open = shallowRef(false);
const target = shallowRef("");
const draft = shallowRef("");
const pending = shallowRef(false);
const error = shallowRef("");
const editing = shallowRef("");
const removing = shallowRef("");
const passage = shallowRef("");
const revision = shallowRef(props.r.revision);
const edit = shallowRef(props.r.edit ?? null);
const form = useTemplateRef<HTMLFormElement>("form");
const add = useTemplateRef<{ $el: HTMLButtonElement }>("add");
async function begin(comment?: ReaderComment, quote = "") {
  editing.value = comment?.id ?? "";
  revision.value = props.r.revision;
  edit.value = props.r.edit ?? null;
  draft.value = comment?.text ?? "";
  passage.value = quote;
  error.value = "";
  open.value = true;
  await nextTick();
  form.value?.querySelector("textarea")?.focus();
}
async function close() {
  open.value = false;
  await nextTick();
  add.value?.$el.focus();
}
async function remove(id: string) {
  pending.value = true;
  error.value = "";
  try {
    await removeComment(id);
    removing.value = "";
    await nextTick();
    add.value?.$el.focus();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    pending.value = false;
  }
}
const saved = computed(() => readerComments.value.filter((c) => c.result === props.r.id && c.revision === props.r.revision && c.edit !== undefined && c.edit === (props.r.edit ?? null)));
const targets = computed(() => [
  { label: "Whole Result block", value: "" },
  ...props.r.entries.map((e) => ({ label: `${e.id}: ${String(e.title ?? e.claim ?? e.file ?? (e.cells as string[] | undefined)?.[0] ?? e.id)}`, value: e.id })),
]);
async function save() {
  if (pending.value || !draft.value.trim()) return;
  pending.value = true;
  error.value = "";
  try {
    const anchor: CommentAnchor = passage.value ? { kind: "text", quote: passage.value } : target.value ? { kind: "entry", entry: target.value } : { kind: "block" };
    if (editing.value) await editComment(editing.value, draft.value);
    else await saveComment(props.r.id, revision.value, edit.value, anchor, draft.value);
    draft.value = "";
    await close();
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
        <p class="text-muted">Stage {{ c.stage }} · Result {{ c.result }}: {{ r.title }} · Revision {{ c.revision }}<template v-if="c.edit != null"> · Edit {{ c.edit }}</template> · {{ c.anchor.kind === 'entry' ? `Entry ${c.anchor.entry}` : c.anchor.kind === 'text' ? 'Selected text' : 'Whole Result block' }}</p>
        <blockquote v-if="c.anchor.kind === 'text'" class="whitespace-pre-wrap border-s-2 border-default ps-3">{{ c.anchor.quote }}</blockquote>
        <p class="whitespace-pre-wrap">{{ c.text }}</p>
        <time :datetime="c.time" class="text-muted">{{ formatTime(c.time) }}</time>
        <div class="flex flex-wrap gap-2">
          <UButton label="Edit comment" color="neutral" variant="ghost" :disabled="pending" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="begin(c)" />
          <UButton v-if="removing !== c.id" label="Remove comment" color="neutral" variant="ghost" :disabled="pending" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="removing = c.id" />
          <template v-else>
            <span>Remove this Reader comment?</span>
            <UButton label="Confirm removal" color="error" :loading="pending" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="remove(c.id)" />
            <UButton label="Keep comment" color="neutral" variant="ghost" :disabled="pending" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="removing = ''" />
          </template>
        </div>
      </li>
    </ul>
    <p v-else class="text-muted">No Reader comments on this revision.</p>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <template v-if="!open">
      <UButton ref="add" class="w-fit max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" :ui="{ label: 'whitespace-normal text-start' }" variant="soft" color="neutral" label="Add Reader comment" @click="begin()" />
      <ResultTextSelection :key="`${r.revision}-${r.edit ?? ''}`" :content="content" @select="begin(undefined, $event)" />
    </template>
    <form v-else ref="form" class="grid min-w-0 gap-3" @submit.prevent="save">
      <blockquote v-if="passage" class="whitespace-pre-wrap border-s-2 border-default ps-3">{{ passage }}</blockquote>
      <UFormField v-else-if="!editing" label="Comment target" :name="`${r.anchor}-target`">
        <USelect v-model="target" :items="targets" class="w-full pointer-coarse:min-h-[44px]" :disabled="pending" />
      </UFormField>
      <UFormField label="Comment" :name="`${r.anchor}-comment`" required>
        <UTextarea v-model="draft" required :maxlength="4096" :rows="3" class="w-full" :ui="{ base: 'field-sizing-content min-h-[3lh] max-h-[12lh]' }" :disabled="pending" />
      </UFormField>
      <p v-if="editing" class="text-muted">Editing preserves the original anchor and revision.</p>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Save comment" :loading="pending" :disabled="!draft.trim()" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" />
        <UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="pending" class="max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="close" />
      </div>
    </form>
  </section>
</template>
