<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import { readerComments, refreshComments } from "~/composables/comments";

const pending = shallowRef(false);
const status = shallowRef("");
const error = shallowRef("");
async function copy() {
  pending.value = true;
  status.value = "";
  error.value = "";
  try {
    await refreshComments();
    const f = flow.value!;
    const feedback = readerComments.value.map((c) => {
      const stage = f.stage.get(c.stage);
      const current = stage?.results.find((r) => r.id === c.result);
      const result = c.edit === undefined ? undefined : [current, ...(current?.history ?? [])].find(r => r && r.revision === c.revision && (r.edit ?? null) === c.edit);
      const anchor = c.anchor;
      const entry = anchor.kind === "entry" ? result?.entries.find((e) => e.id === anchor.entry) : undefined;
      const quote = c.anchor.kind === "text" ? c.anchor.quote : entry ? String(entry.title ?? entry.claim ?? entry.file ?? (entry.cells as string[] | undefined)?.join(" | ") ?? entry.id) : result?.title ?? c.result;
      const target = c.anchor.kind === "entry" ? `Entry ${c.anchor.entry}` : c.anchor.kind === "block" ? "Whole Result block" : "Selected text";
      return `Stage ${c.stage}${stage ? `: ${stage.label}` : ""}\nResult ${c.result}${result ? `: ${result.title}` : ""}\nRevision ${c.revision}${c.edit != null ? ` · Edit ${c.edit}` : ""}${c.edit === undefined ? " · Captured version unknown" : ""} · ${target}\n${quote.split("\n").map((line) => `> ${line}`).join("\n")}\n${c.text}`;
    });
    await navigator.clipboard.writeText(`Please review these Reader comments. They are notes, not answers or consent.\n\n${feedback.join("\n\n")}`);
    status.value = "Feedback copied";
  } catch (cause) {
    error.value = `Could not copy feedback: ${(cause as Error).message}`;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div v-if="readerComments.length" class="grid gap-1 text-small [overflow-wrap:anywhere]">
    <UButton label="Copy feedback" color="neutral" variant="soft" :loading="pending" class="w-fit max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="copy" />
    <p v-if="readerComments.some(c => c.version_unknown)" class="text-warning">Some saved Reader comments have an unknown captured version. Copy feedback includes them without attaching them to current content.</p>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
  </div>
</template>
