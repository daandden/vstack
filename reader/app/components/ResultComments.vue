<script lang="ts">
import { type } from "@oh-my-pi/omptype";

const COMMENT_LIMIT = 4096;
const countFormat = new Intl.NumberFormat("en-US");
const commentSchema = type({
  text: type("string").atMostLength(COMMENT_LIMIT).narrow(text => text.trim().length > 0)
    .configure({ message: `Keep the comment to ${countFormat.format(COMMENT_LIMIT)} characters.` }),
});
</script>

<script setup lang="ts">
import { revalidateLogic, useForm } from "@tanstack/vue-form";
import type { CommentAnchor, ReaderComment } from "#flow/comments.ts";
import type { ResultView } from "~/utils/flow";
import { readerComments, saveComment, editComment, removeComment } from "~/composables/comments";
import { onReaderReload, readReloadState, savedState } from "~/composables/reload";
import Button from "./ui/Button.vue";
import Field from "./ui/Field.vue";
import Select from "./ui/Select.vue";
import Textarea from "./ui/Textarea.vue";

const props = defineProps<{ r: ResultView; content: HTMLElement | null }>();
const open = shallowRef(false);
const target = shallowRef("");
const commentForm = useForm({
  defaultValues: { text: "" },
  validationLogic: revalidateLogic(),
  validators: { onDynamic: commentSchema },
  onSubmit: async ({ value }) => {
    const parsed = commentSchema(value);
    if (parsed instanceof type.errors) {
      saveError.value = parsed.summary;
      return;
    }
    await save(parsed.text);
  },
});
const pending = shallowRef(false);
const saveError = shallowRef("");
const removeError = shallowRef("");
const editing = shallowRef("");
const removing = shallowRef("");
const passage = shallowRef("");
const revision = shallowRef(props.r.revision);
const edit = shallowRef(props.r.edit ?? null);
const form = useTemplateRef<HTMLFormElement>("form");
const add = useTemplateRef<{ $el: HTMLButtonElement }>("add");
const reloadKey = `comment:${props.r.anchor}`;
onReaderReload(reloadKey, () => {
  if (pending.value) throw new Error("Reader comment write in progress");
  return open.value ? { target: target.value, draft: commentForm.state.values.text, editing: editing.value, passage: passage.value, revision: revision.value, edit: edit.value } : null;
});
onMounted(() => {
  const saved = savedState(readReloadState(reloadKey), { target: "string", draft: "string", editing: "string", passage: "string", revision: "number", edit: "number or null" });
  if (!saved) return;
  target.value = saved.target;
  commentForm.reset({ text: saved.draft });
  editing.value = saved.editing;
  passage.value = saved.passage;
  revision.value = saved.revision;
  edit.value = saved.edit;
  open.value = true;
});
async function begin(comment?: ReaderComment, quote = "") {
  editing.value = comment?.id ?? "";
  revision.value = props.r.revision;
  edit.value = props.r.edit ?? null;
  commentForm.reset({ text: comment?.text ?? "" });
  passage.value = quote;
  saveError.value = "";
  removeError.value = "";
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
  removeError.value = "";
  try {
    await removeComment(id);
    removing.value = "";
    await nextTick();
    add.value?.$el.focus();
  } catch (cause) {
    removeError.value = (cause as Error).message;
  } finally {
    pending.value = false;
  }
}
const saved = computed(() => readerComments.value.filter((c) => c.result === props.r.id && c.revision === props.r.revision && c.edit !== undefined && c.edit === (props.r.edit ?? null)));
const selectedTarget = computed({
  get: () => target.value || "block",
  set: (value: string) => { target.value = value === "block" ? "" : value; },
});
const targets = computed(() => [
  { label: "Whole Result block", value: "block" },
  ...props.r.entries.map((e) => ({ label: `${e.id}: ${String(e.title ?? e.claim ?? e.file ?? (e.cells as string[] | undefined)?.[0] ?? e.id)}`, value: e.id })),
  ...(target.value && !props.r.entries.some(e => e.id === target.value) ? [{ label: `${target.value}: original draft target`, value: target.value }] : []),
]);
async function save(text: string) {
  if (pending.value) return;
  pending.value = true;
  saveError.value = "";
  try {
    const anchor: CommentAnchor = passage.value ? { kind: "text", quote: passage.value } : target.value ? { kind: "entry", entry: target.value } : { kind: "block" };
    if (editing.value) await editComment(editing.value, text);
    else await saveComment(props.r.id, revision.value, edit.value, anchor, text);
    await close();
  } catch (cause) {
    saveError.value = `Could not save the comment: ${(cause as Error).message} Your draft is kept.`;
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
          <Button variant="ghost" :disabled="pending" class="u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="begin(c)">Edit comment</Button>
          <Button v-if="removing !== c.id" variant="ghost" :disabled="pending" class="u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="removing = c.id">Remove comment</Button>
          <template v-else>
            <span>Remove this Reader comment?</span>
            <Button :disabled="pending" :aria-busy="pending || undefined" class="u-max-w-full u-whitespace-normal u-text-start u-text-flow-red pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="remove(c.id)">Confirm removal</Button>
            <Button variant="ghost" :disabled="pending" class="u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="removing = ''">Keep comment</Button>
          </template>
        </div>
      </li>
    </ul>
    <p v-else class="text-muted">No Reader comments on this revision.</p>
    <p v-if="removeError" role="alert" class="u-text-flow-red">{{ removeError }}</p>
    <template v-if="!open">
      <Button ref="add" variant="soft" class="u-w-fit u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="begin()">Add Reader comment</Button>
      <ResultTextSelection :key="`${r.revision}-${r.edit ?? ''}`" :content="content" @select="begin(undefined, $event)" />
    </template>
    <form v-else ref="form" class="u-grid u-min-w-0 u-gap-3" novalidate @submit.prevent.stop="commentForm.handleSubmit()">
      <p class="text-muted">Draft for Revision {{ revision }}<template v-if="edit != null"> · Edit {{ edit }}</template>. Saving is a separate action.</p>
      <blockquote v-if="passage" class="whitespace-pre-wrap border-s-2 border-default ps-3">{{ passage }}</blockquote>
      <Field v-else-if="!editing" :id="`${r.anchor}-target`" label="Comment target">
        <template #default="{ control }">
          <Select v-bind="control" v-model="selectedTarget" :items="targets" class="u-w-full pointer-coarse:min-h-[44px]" :disabled="pending" />
        </template>
      </Field>
      <component :is="commentForm.Field" v-slot="{ field }" name="text">
        <Field :id="`${r.anchor}-comment`" label="Comment" required :errors="field.state.value.trim() ? field.state.meta.errors : []">
          <template #default="{ control }">
            <Textarea v-bind="control" :model-value="field.state.value" :rows="3" :disabled="pending" class="u-field-sizing-content u-min-h-[3lh] u-max-h-[12lh]" @update:model-value="field.handleChange($event ?? '')" @blur="field.handleBlur()" />
          </template>
          <template #error-detail>
            <p v-if="field.state.value.length > COMMENT_LIMIT" class="u-tabular-nums">{{ countFormat.format(field.state.value.length) }} / {{ countFormat.format(COMMENT_LIMIT) }}</p>
          </template>
        </Field>
        <p v-if="editing" class="u-text-flow-subtext">Editing preserves the original anchor and revision.</p>
        <p v-if="saveError" role="alert" class="u-text-flow-red">{{ saveError }}</p>
        <div class="u-flex u-flex-wrap u-gap-2">
          <Button type="submit" :disabled="pending || !field.state.value.trim()" :aria-busy="pending || undefined" class="u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]">Save comment</Button>
          <Button variant="ghost" :disabled="pending" class="u-max-w-full u-whitespace-normal u-text-start pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" @click="close">Cancel</Button>
        </div>
      </component>
    </form>
  </section>
</template>
