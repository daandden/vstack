<script setup lang="ts">
import { tab } from "~/composables/navigation";
</script>

<template>
  <section id="overview" class="panel grid gap-3 py-entry border-bs border-flow-line [&>details]:border-bs [&>details]:border-flow-line [&>details>summary]:min-h-9 [&>details>summary]:py-2" data-tab="overview" :hidden="tab !== 'overview'" aria-labelledby="overview-title">
    <h2 id="overview-title">Overview</h2>
    <OpenDecisions />
    <details id="overview:progress" class="open:grid open:gap-2" data-reading-fold>
      <summary id="overview:progress-row" data-stop>Progress</summary>
      <ProgressPanel />
    </details>
    <details id="overview:visit" class="open:grid open:gap-2" data-reading-fold>
      <summary id="overview:visit-row" data-stop>Changed since your last visit</summary>
      <ChangedSinceVisit />
    </details>
    <details id="overview:stages" class="open:grid open:gap-2" data-reading-fold>
      <summary id="overview:stages-row" data-stop>All Stages</summary>
      <StageOverview />
    </details>
    <details id="overview:topics" class="open:grid open:gap-2" data-reading-fold>
      <summary id="overview:topics-row" data-stop>Topics</summary>
      <TopicLinks />
    </details>
    <p class="quiet">Keys: <kbd>j</kbd> <kbd>k</kbd> next and previous section, <kbd>h</kbd> <kbd>l</kbd> previous and next view, <kbd>n</kbd> next open question, <kbd>m</kbd> Stages, <kbd>g</kbd> Jump.</p>
  </section>
</template>
