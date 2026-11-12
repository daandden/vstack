<script setup lang="ts">
import type { CorrectionNotice } from "#flow/model.ts";

defineProps<{ notice: CorrectionNotice }>();
</script>

<template>
  <aside v-if="notice.correction" aria-label="Correction notice" class="grid min-w-0 gap-1 border-s-4 border-warning bg-warning/10 p-3 text-default [overflow-wrap:anywhere]">
    <p class="font-semibold text-warning">Corrected</p>
    <p>{{ notice.correction.reason }}</p>
    <p><a :href="`#${notice.correction.replacement.anchor}`" class="active:bg-accented">Correction</a><template v-if="notice.correction.head.id !== notice.correction.replacement.id"> · <a :href="`#${notice.correction.head.anchor}`" class="active:bg-accented">Current correction</a></template></p>
  </aside>
  <aside v-for="relation in notice.corrects" :key="relation.id" aria-label="Corrects earlier content" class="grid min-w-0 gap-1 border-s-2 border-warning ps-3 text-small [overflow-wrap:anywhere]">
    <p>Corrects <a :href="`#${relation.target.anchor}`" class="active:bg-accented">{{ relation.target.title }}</a>, revision {{ relation.target.revision }}<template v-if="relation.target.edit !== undefined">, edit {{ relation.target.edit }}</template>.</p>
    <p>{{ relation.reason }}</p>
  </aside>
</template>
