<script setup lang="ts">
import type { CorrectionNotice } from "#flow/model.ts";

defineProps<{ notice: CorrectionNotice }>();
</script>

<template>
  <aside v-if="notice.correction" aria-label="Correction notice" class="grid min-w-0 gap-1 border-s-4 border-flow-peach bg-flow-peach/10 p-3 text-flow-text [overflow-wrap:anywhere]">
    <p class="font-semibold text-flow-peach">Corrected</p>
    <p>{{ notice.correction.reason }}</p>
    <p><a :href="`#${notice.correction.replacement.anchor}`" class="active:bg-flow-accented">Corrected by <span v-html="inline(notice.correction.replacement.title)" />, revision {{ notice.correction.replacement.revision }}</a><template v-if="notice.correction.head.id !== notice.correction.replacement.id"> · <a :href="`#${notice.correction.head.anchor}`" class="active:bg-flow-accented">Current correction</a></template></p>
  </aside>
  <aside v-for="relation in notice.corrects" :key="relation.id" aria-label="Corrects earlier content" class="grid min-w-0 gap-1 border-s-2 border-flow-peach ps-3 text-small [overflow-wrap:anywhere]">
    <p>Corrects <a :href="`#${relation.target.anchor}`" class="active:bg-flow-accented" v-html="inline(relation.target.title)" />, revision {{ relation.target.revision }}<template v-if="relation.target.edit !== undefined">, edit {{ relation.target.edit }}</template>.</p>
    <p>{{ relation.reason }}</p>
  </aside>
</template>
