<script setup lang="ts">
import type { ResultView } from "~/utils/flow";

defineProps<{ rows: NonNullable<ResultView["review"]> }>();
</script>

<template>
  <div class="relative overflow-x-auto">
    <table aria-label="Review summary" class="border-collapse tabular-nums [&_th]:text-small [&_th]:font-semibold [&_th]:text-flow-subtext [&_th]:px-2 [&_th]:py-1 [&_th]:border-be [&_th]:border-flow-line [&_th]:text-start [&_th]:align-top [&_td]:px-2 [&_td]:py-1 [&_td]:border-be [&_td]:border-flow-line [&_td]:text-start [&_td]:align-top">
      <thead>
        <tr><th scope="col">Axis</th><th scope="col">Status</th><th scope="col">Finding</th><th scope="col">User-visible impact</th><th scope="col">Location</th><th scope="col">Outcome</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <th scope="row">{{ AXIS_LABELS[row.axis] }}</th>
          <td>{{ REVIEW_LABELS[row.status] }}<p v-if="row.reason" v-html="inline(row.reason)" /></td>
          <td><a v-if="row.target" :href="`#${row.target}`" v-html="inline(row.finding ?? '')" /><template v-else>No finding recorded</template></td>
          <td><span v-if="row.impact" v-html="inline(row.impact)" /><template v-else>Not applicable</template></td>
          <td><span v-if="row.location" v-html="inline(row.location)" /><template v-else>Not applicable</template></td>
          <td>{{ row.blocking === undefined ? "Not applicable" : row.blocking ? "Blocking" : "Suggested" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
