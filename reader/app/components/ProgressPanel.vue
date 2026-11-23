<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow, observations } = useReaderState();

const f = computed(() => flow.value!);
const p = computed(() => f.value.progress);
const stageLabel = (id: string) => f.value.stage.get(id)?.label ?? id;
const count = (state: string) => p.value.tasks.filter((t) => t.state === state).length;
const verdict = computed(() => {
  const v = p.value;
  if (v.complete) return v.delivery ? "Complete: every task is settled and the requested End state is reached." : "Complete: every task is settled; this Flow delivers no commit or PR.";
  const why: string[] = [];
  if (!v.tasks.length) why.push("no tasks recorded");
  const left = v.remaining.filter((id) => v.tasks.some((t) => t.id === id)).length;
  if (left) why.push(`${left} ${left === 1 ? "task" : "tasks"} left`);
  const open = v.remaining.length - left;
  if (open) why.push(`${open} open ${open === 1 ? "blocker" : "blockers"}`);
  if (v.delivery === undefined) why.push("End state not chosen");
  else if (!v.end_state_met) why.push("requested End state not reached");
  return `Not complete: ${why.join(", ")}.`;
});
const taskLine = computed(() => {
  const work = p.value.tasks.filter((t) => t.state !== "skipped" && t.state !== "inapplicable").length;
  const blocked = p.value.tasks.filter((t) => t.blocked_by.length).length;
  const notWork = count("skipped") + count("inapplicable");
  return [`${count("done")} of ${work} done`, ...(count("active") ? [`${count("active")} active`] : []), ...(blocked ? [`${blocked} blocked`] : []), ...(notWork ? [`${notWork} skipped or not applicable`] : [])].join(", ");
});
const openBlockers = computed(() => p.value.blockers.filter((b) => !b.resolved));
const taskTitle = (id: string) => p.value.tasks.find((t) => t.id === id)?.title ?? id;
const blockerText = (id: string) => p.value.blockers.find((b) => b.id === id)?.text ?? id;
const resolvedFor = (task: string) => p.value.blockers.filter((b) => b.resolved && b.tasks.includes(task));
const KINDS: Record<string, string> = { git: "Git", ci: "CI", "code-host": "Code host" };
</script>

<template>
  <section id="progress" class="progress grid gap-2 p-2 border border-flow-line rounded-md bg-flow-muted [&_.tag]:text-flow-state" data-stop aria-labelledby="progress-title" :data-complete="p.complete ? '' : undefined">
    <h3 id="progress-title">Authored progress</h3>
    <p class="font-semibold" :class="p.complete ? 'text-flow-green' : 'text-flow-peach'">{{ verdict }}</p>
    <dl class="facts grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-x-6 gap-y-2 [&_dt]:text-flow-subtext [&_dt]:text-small [&_dt]:font-semibold [&_dd]:ms-0">
      <div><dt>Tasks</dt><dd>{{ p.tasks.length ? taskLine : "None recorded" }}</dd></div>
      <div><dt>Stages</dt><dd>{{ p.stages.finished }} of {{ p.stages.total }} finished</dd></div>
      <div>
        <dt>Requested End state</dt>
        <dd>
          <template v-if="!p.requested">Not chosen</template>
          <template v-else>{{ p.requested.value === "none" ? "None: not a delivery Flow" : END_LABELS[p.requested.value] }} <span class="quiet">{{ formatTime(p.requested.time) }}, <a :href="`#${p.requested.stage}`">{{ stageLabel(p.requested.stage) }}</a></span></template>
        </dd>
      </div>
      <div>
        <dt>Reached End state</dt>
        <dd>
          <template v-if="p.requested?.value === 'none'">Does not apply</template>
          <template v-else-if="!p.reached">Not reached</template>
          <template v-else>
            {{ END_LABELS[p.reached.value] }} <span class="quiet">{{ formatTime(p.reached.time) }}, <a :href="`#${p.reached.stage}`">{{ stageLabel(p.reached.stage) }}</a></span>
            <details v-if="p.reached.evidence.length" id="progress-reached-evidence" class="disclosure"><summary>Evidence</summary><ul class="bullets"><li v-for="(e, i) in p.reached.evidence" :key="i" v-html="inline(e)" /></ul></details>
          </template>
        </dd>
      </div>
      <div v-if="p.prs.length">
        <dt>PRs</dt>
        <dd>
          <ul class="bullets">
            <li v-for="x in p.prs" :id="x.id" :key="x.id">
              <a :href="x.url">{{ x.title ?? x.url }}</a> <span class="tag" :data-pr="x.state">{{ PR_LABELS[x.state] }}</span>
              <span class="quiet">reported {{ formatTime(x.reported.time) }}, <a :href="`#${x.reported.stage}`">{{ stageLabel(x.reported.stage) }}</a></span>
            </li>
          </ul>
        </dd>
      </div>
      <div v-if="p.checks.length">
        <dt>Checks</dt>
        <dd>
          <ul class="bullets">
            <li v-for="x in p.checks" :id="x.id" :key="x.id">
              <span v-html="inline(x.name)" /> <span class="tag" :data-check="x.outcome">{{ CHECK_LABELS[x.outcome] }}</span>
              <span class="quiet">reported {{ formatTime(x.reported.time) }}, <a :href="`#${x.reported.stage}`">{{ stageLabel(x.reported.stage) }}</a></span>
              <details v-if="x.evidence.length" :id="`${x.id}-evidence`" class="disclosure"><summary>Evidence</summary><ul class="bullets"><li v-for="(e, i) in x.evidence" :key="i" v-html="inline(e)" /></ul></details>
            </li>
          </ul>
        </dd>
      </div>
    </dl>
    <div v-if="openBlockers.length" class="labelled blockers">
      <p class="font-semibold text-flow-red">Blockers</p>
      <ul class="bullets">
        <li v-for="b in openBlockers" :id="b.id" :key="b.id">
          <span v-html="inline(b.text)" />
          <span v-if="b.tasks.length" class="quiet"> blocks <template v-for="(id, i) in b.tasks" :key="id">{{ i ? ", " : "" }}<a :href="`#${id}`">{{ taskTitle(id) }}</a></template></span>
          <span class="quiet"> {{ formatTime(b.opened) }}, <a :href="`#${b.stage}`">{{ stageLabel(b.stage) }}</a></span>
        </li>
      </ul>
    </div>
    <ol v-if="p.tasks.length" class="tasks grid gap-1 ps-0 list-none">
      <li v-for="t in p.tasks" :id="t.id" :key="t.id" class="task flex flex-wrap items-baseline gap-x-3 gap-y-1 data-[task=skipped]:text-flow-subtext data-[task=inapplicable]:text-flow-subtext" :data-task="t.state" :data-blocked="t.blocked_by.length ? '' : undefined">
        <span class="tag [min-inline-size:7em]">{{ TASK_LABELS[t.state] }}</span>
        <span v-html="inline(t.title)" />
        <span v-if="t.blocked_by.length" class="blocked text-flow-red text-small font-semibold">Blocked: <template v-for="(id, i) in t.blocked_by" :key="id">{{ i ? "; " : "" }}<a :href="`#${id}`">{{ blockerText(id) }}</a></template></span>
        <span class="quiet">{{ formatTime(t.updates.at(-1)!.time) }}, <a :href="`#${t.updates.at(-1)!.stage}`">{{ stageLabel(t.updates.at(-1)!.stage) }}</a></span>
        <p v-if="t.reason" class="reason basis-full" v-html="inline(t.reason)" />
        <details v-if="t.evidence.length" :id="`${t.id}-evidence`" class="disclosure basis-full"><summary>Evidence</summary><ul class="bullets"><li v-for="(e, i) in t.evidence" :key="i" v-html="inline(e)" /></ul></details>
        <ul v-if="resolvedFor(t.id).length" class="bullets resolved basis-full">
          <li v-for="b in resolvedFor(t.id)" :key="b.id"><span class="label">Blocker resolved</span> <span v-html="inline(b.resolved!.text)" /> <span class="quiet">Was: <span v-html="inline(b.text)" /></span></li>
        </ul>
      </li>
    </ol>
  </section>
  <section id="observations" class="observations grid gap-2 p-2 border border-dashed border-flow-line rounded-md bg-flow-muted [&_.tag]:text-flow-state" data-stop aria-labelledby="observations-title">
    <h3 id="observations-title">Read-only observations</h3>
    <p class="quiet">Observed outside the Flow. They change no authored content, completion, or authorization.</p>
    <p v-if="!observations" class="quiet">Not observed yet.</p>
    <ul v-else class="bullets">
      <li v-for="(o, kind) in observations" :id="`observation-${kind}`" :key="kind" :data-observation="o.status">
        <strong>{{ KINDS[kind] ?? kind }}</strong> <span class="tag">{{ o.status }}</span>
        <p class="quiet">
          {{ o.provenance.adapter }} · {{ o.provenance.source }}<template v-if="o.observed_at"> · observed <time :datetime="o.observed_at">{{ o.observed_at }}</time></template><template v-if="o.attempted_at"> · attempted {{ o.attempted_at }}</template>
        </p>
        <p v-if="o.reason">{{ o.reason }}</p>
        <ul v-if="o.records.length" class="bullets">
          <li v-for="(rec, i) in o.records" :key="i"><a v-if="rec.url" :href="rec.url">{{ rec.name }}</a><template v-else>{{ rec.name }}</template> <span>{{ rec.state }}</span></li>
        </ul>
      </li>
    </ul>
  </section>
</template>
