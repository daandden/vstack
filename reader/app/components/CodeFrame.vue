<script setup lang="ts">
defineProps<{ html: string; kind?: string; language?: string }>();
</script>

<template>
  <figure class="code grid gap-1" :data-kind="kind" :data-language="language">
    <pre class="relative overflow-x-auto rounded-md bg-flow-muted p-2 whitespace-pre [tab-size:4]" :class="kind ? 'px-0!' : undefined"><code
      class="bg-transparent px-0 [&_.tok-kw]:text-flow-mauve [&_.tok-str]:text-flow-green [&_.tok-com]:text-flow-subtext [&_.tok-com]:italic [&_.tok-num]:text-flow-peach [&_.tok-ws]:bg-[color-mix(in_oklch,var(--color-peach)_25%,transparent)]
        [&_.line]:relative [&_.line]:block [&_.line]:min-h-[1lh] [&_.line]:pe-3 [&_.line]:ps-18
        [&_.line]:before:absolute [&_.line]:before:inset-bs-0 [&_.line]:before:start-0 [&_.line]:before:w-14 [&_.line]:before:pe-3 [&_.line]:before:text-end [&_.line]:before:text-flow-subtext [&_.line]:before:tabular-nums [&_.line]:before:content-[attr(data-old)] [&_.line]:before:select-none
        [&_.add]:bg-[color-mix(in_oklch,var(--color-green)_12%,var(--color-mantle))] [&_.del]:bg-[color-mix(in_oklch,var(--color-red)_12%,var(--color-mantle))] [&_.add_.mark]:text-flow-green [&_.del_.mark]:text-flow-red [&_.meta]:text-flow-subtext [&_.note]:text-flow-subtext [&_.hunk]:bg-flow-accented [&_.hunk]:text-flow-lavender
        [&_.line:target]:outline [&_.line:target]:outline-flow-yellow [&_.line:target]:-outline-offset-1 [&_.line:has(:target)]:outline [&_.line:has(:target)]:outline-flow-yellow [&_.line:has(:target)]:-outline-offset-1"
      :class="kind ? ['block w-max min-w-full', kind === 'diff' ? '[&_.line]:ps-32 [&_.line]:after:absolute [&_.line]:after:inset-bs-0 [&_.line]:after:start-14 [&_.line]:after:w-14 [&_.line]:after:pe-3 [&_.line]:after:text-end [&_.line]:after:text-flow-subtext [&_.line]:after:tabular-nums [&_.line]:after:content-[attr(data-new)] [&_.line]:after:select-none' : undefined] : undefined"
      v-html="html"
    /></pre>
    <figcaption v-if="$slots.caption" class="text-small text-flow-subtext"><slot name="caption" /></figcaption>
  </figure>
</template>
