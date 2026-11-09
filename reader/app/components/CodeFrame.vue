<script setup lang="ts">
defineProps<{ html: string; kind?: string; language?: string }>();
</script>

<template>
  <figure class="code grid gap-1" :data-kind="kind" :data-language="language">
    <pre class="relative overflow-x-auto rounded-md bg-muted px-3 py-2 whitespace-pre [tab-size:4]" :class="kind ? 'px-0!' : undefined"><code
      class="bg-transparent px-0 [&_.tok-kw]:text-primary [&_.tok-str]:text-success [&_.tok-com]:text-muted [&_.tok-com]:italic [&_.tok-num]:text-warning [&_.tok-ws]:bg-[color-mix(in_oklch,var(--peach)_25%,transparent)]
        [&_.line]:relative [&_.line]:block [&_.line]:min-h-lh [&_.line]:pe-3 [&_.line]:ps-18
        [&_.line]:before:absolute [&_.line]:before:inset-bs-0 [&_.line]:before:start-0 [&_.line]:before:w-14 [&_.line]:before:pe-3 [&_.line]:before:text-end [&_.line]:before:text-muted [&_.line]:before:tabular-nums [&_.line]:before:content-[attr(data-old)] [&_.line]:before:select-none
        [&_.add]:bg-[color-mix(in_oklch,var(--green)_12%,var(--mantle))] [&_.del]:bg-[color-mix(in_oklch,var(--red)_12%,var(--mantle))] [&_.add_.mark]:text-success [&_.del_.mark]:text-error [&_.meta]:text-muted [&_.note]:text-muted [&_.hunk]:bg-accented [&_.hunk]:text-secondary
        [&_.line:target]:outline [&_.line:target]:outline-flow-yellow [&_.line:target]:-outline-offset-1 [&_.line:has(:target)]:outline [&_.line:has(:target)]:outline-flow-yellow [&_.line:has(:target)]:-outline-offset-1"
      :class="kind ? ['block w-max min-w-full', kind === 'diff' ? '[&_.line]:ps-32 [&_.line]:after:absolute [&_.line]:after:inset-bs-0 [&_.line]:after:start-14 [&_.line]:after:w-14 [&_.line]:after:pe-3 [&_.line]:after:text-end [&_.line]:after:text-muted [&_.line]:after:tabular-nums [&_.line]:after:content-[attr(data-new)] [&_.line]:after:select-none' : undefined] : undefined"
      v-html="html"
    /></pre>
    <figcaption v-if="$slots.caption" class="text-small text-muted"><slot name="caption" /></figcaption>
  </figure>
</template>
