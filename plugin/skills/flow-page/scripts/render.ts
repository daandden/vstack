// The one Flow page renderer. It turns the derived view into the whole static page; every string from a
// contribution is escaped, so the page's only markup, style, and script come from this file and the template.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { optionLabel, type AnswerState, type Attachment, type DocView, type QuestionView, type ResultView, type StageView, type View } from "./model.ts";
import type { ProgressView } from "./progress.ts";

/** Raise this when the page a given state renders to changes, so a page names the renderer that made it. */
export const RENDERER = 5;
const TEMPLATE = join(import.meta.dir, "..", "templates", "flow-page.html");

const STATE_LABELS: Record<string, string> = { "in-progress": "In progress", finished: "Finished" };
const CLAIM_LABELS: Record<string, string> = { confirmed: "Confirmed", cleared: "Cleared", unproven: "Unproven" };
const TYPE_LABELS: Record<string, string> = { image: "Image", video: "Video", svg: "SVG figure", file: "File", trace: "Trace", evidence: "Captured evidence", artifact: "Runnable artifact" };
const TASK_LABELS: Record<string, string> = { pending: "To do", active: "Active", done: "Done", skipped: "Skipped", inapplicable: "Does not apply" };
const END_LABELS: Record<string, string> = { commit: "Commit", "merge-ready": "Merge-ready", shipped: "Shipped" };
const PR_LABELS: Record<string, string> = { open: "Open", merged: "Merged", closed: "Closed" };
const CHECK_LABELS: Record<string, string> = { passed: "Passed", failed: "Failed", pending: "Pending" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Citation markers of one Document: `[@ref]` becomes a numbered link to the citation. */
type Cites = Map<string, { anchor: string; n: number }>;
/** Escaped text with `code` and [text](https://url) kept, and citation markers numbered when `cites` is given. */
function text(s: string, cites?: Cites): string {
  const out = esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  if (!cites) return out;
  return out.replace(/\[@([a-z0-9][a-z0-9-]*)\]/g, (m, ref) => {
    const c = cites.get(ref);
    return c ? `<a class="cite" href="#${c.anchor}" aria-label="Citation ${c.n}">[${c.n}]</a>` : m;
  });
}
/** Paragraphs split on blank lines; a block whose lines all start with "- " is a bullet list. */
function prose(s: string, cites?: Cites): string {
  return s
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) return `<ul class="bullets">${lines.map((l) => `<li>${text(l.slice(2), cites)}</li>`).join("")}</ul>`;
      return `<p>${text(lines.join(" "), cites)}</p>`;
    })
    .join("");
}
function formatTime(iso: string): string {
  const [, y, mo, d, h, mi] = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)!;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1];
  return `${d} ${month} ${y}, ${h}:${mi}`;
}
const labelled = (label: string, items: string[], cls: string) => (items.length ? `\n<div class="${cls}"><p class="label">${label}</p><ul class="bullets">${items.join("")}</ul></div>` : "");
const sourcesHtml = (sources: string[]) => `<div class="sources"><p class="label">Sources</p><ul class="bullets">${sources.map((src) => `<li>${text(src)}</li>`).join("")}</ul></div>`;

/** What the Overview shows for an answer. Only an explicit pick shows an option; words read as a decision show that reading. */
function shownAnswer(q: QuestionView): { cls: "pick" | "read" | "open"; html: string } {
  const a = q.answer;
  if (a.picks) return { cls: "pick", html: text(a.picks.join(", ")) };
  if (a.reading?.outcome === "resolved") return { cls: "read", html: `${text(a.reading.decision)} <span class="label">(read from your words)</span>` };
  if (q.retired) return { cls: "open", html: "Retired" };
  if (a.state === "unresolved") return { cls: "open", html: a.why === "headless" ? "Headless, not your answer" : "Not answered" };
  return { cls: "open", html: "Open" };
}

const NOT_ASKED: Record<string, string> = {
  "timed-out": "The ask timed out. This is not your answer.",
  cancelled: "The ask was cancelled. This is not your answer.",
  empty: "The ask came back empty. This is not your answer.",
};
const NOT_DECIDED: Record<string, string> = { question: "Your words ask a question", concern: "Your words raise a concern", ambiguous: "Your words do not settle it" };

/** Your own words first, then, apart from them, how they were read; nothing reads a non-answer as consent. */
function answerLines(q: QuestionView): string {
  const a = q.answer;
  const line = (state: string, label: string, body: string) => `\n<p class="answer" data-state="${state}"><span class="label">${label}</span><span>${body}</span></p>`;
  const out: string[] = [];
  const r = a.response;
  if (r) {
    const on = r.note_on ? ` (on ${text(optionLabel(q, r.note_on))}, not picked)` : "";
    if (r.status === "answered" && r.text !== undefined) out.push(line(a.state, a.picks ? `Your note${on}` : `Your words${on}`, text(r.text)));
    if (r.status === "headless") out.push(line(a.state, "Headless", `No one was asked; ${text(r.picks!.map((p) => optionLabel(q, p)).join(", "))} stands in as the recommended answer. This is not your answer.`));
    else if (NOT_ASKED[r.status]) out.push(line(a.state, "Unanswered", `${NOT_ASKED[r.status]}${r.picks ? ` The automatic selection, ${text(r.picks.map((p) => optionLabel(q, p)).join(", "))}, is ignored.` : ""}`));
  }
  const rd = a.reading;
  if (rd?.outcome === "resolved") {
    out.push(line(a.state, "Read as", text(rd.decision)));
    out.push(line(a.state, "Because", text(rd.basis)));
    if (rd.maps_to) out.push(line(a.state, "Matches", `${text(optionLabel(q, rd.maps_to))}, which you did not pick`));
  } else if (rd) {
    out.push(line(a.state, NOT_DECIDED[rd.outcome], "Not a decision."));
    out.push(line(a.state, "Still to ask", text(rd.unresolved)));
  }
  if (q.retired) out.push(line("retired", "Retired", text(q.retired.reason)));
  return out.join("");
}

const PROVENANCE: Record<AnswerState, string> = { picked: "your pick", resolved: "read from your words", unresolved: "not your answer", open: "not answered" };
const stageLabel = (v: View, id: string) => v.stages.find((st) => st.id === id)!.label;

function questionHtml(q: QuestionView, v: View, entryTitle: (ref: string) => string, sourceText: (id: string) => string): string {
  const facts = (q.today ?? []).map((f) => `<li>${text(f.text)} <span class="source">${text(sourceText(f.source))}</span></li>`);
  const notes = (q.terms ?? []).map((t) => `<dt>${text(t.term)}</dt><dd>${text(t.text)}</dd>`).join("");
  const topics = (q.topics ?? []).map((id) => {
    const t = v.topics.find((x) => x.id === id)!;
    return `<li><a href="#${id}">${text(t.title)}</a>: ${text(t.summary)}</li>`;
  });
  const entries = (q.entries ?? []).map((ref) => `<li><a href="#${ref.replace("/", "-")}">${entryTitle(ref)}</a></li>`);
  const askedIn = (id: string) => (v.questions.get(id)!.stage === q.stage ? "" : ` in ${esc(stageLabel(v, v.questions.get(id)!.stage))}`);
  const earlier = q.again ? [`<li><a href="#${q.again}">Q${v.questions.get(q.again)!.q}${askedIn(q.again)}, asked earlier</a></li>`] : [];
  const later = q.asked_again_by.map((id) => `<li><a href="#${id}">Q${v.questions.get(id)!.q}${askedIn(id)}, asked again</a></li>`);
  const reopened = q.reopens ? [`<li><a href="#${q.reopens}">Reopens an Assumed pick: ${text(v.stages.flatMap((st) => st.assumed).find((x) => x.id === q.reopens)!.decision)}</a></li>`] : [];
  const decided = q.decided_in ? [`<li><a href="#${q.decided_in}">Decision in the summary</a></li>`] : [];
  const picks = new Set(q.answer.picks ?? []);
  const options = q.options
    .map((o) => {
      const picked = picks.has(o.label);
      const attrs = `${o.recommended ? " data-recommended" : ""}${picked ? " data-picked" : ""}`;
      const star = o.recommended ? `<span class="star" aria-hidden="true">*</span><span class="sr-only"> (recommended)</span>` : "";
      const mark = picked ? `<span class="sr-only"> (your answer)</span>` : "";
      const trade = [...o.gains.map((g) => `<li class="gain">${text(g)}</li>`), ...o.costs.map((c) => `<li class="cost">${text(c)}</li>`)].join("");
      const why = o.recommended ? `<p class="why">Recommended: ${text(o.recommended)}</p>` : "";
      return `<li class="option"${attrs}><h4>${text(o.label)}${star}${mark}</h4><p>${text(o.does)}</p><ul class="trade">${trade}</ul>${why}</li>`;
    })
    .join("\n");
  return `<article class="question" id="${q.id}" data-state="${q.answer.state}"${q.open ? " data-open" : ""}${q.retired ? " data-retired" : ""} data-stop>
<h3><span class="qnum">Q${q.q}</span>${text(q.title)}</h3>
<div class="description">${prose(q.description)}</div>${labelled("From the results", entries, "result-links")}${labelled("Related asks", [...earlier, ...later, ...reopened, ...decided], "result-links")}${labelled("Today", facts, "today")}${notes ? `\n<div class="terms"><p class="label">Term notes</p><dl>${notes}</dl></div>` : ""}${labelled("Topic notes", topics, "topics")}${q.example ? `\n<div class="example"><p class="label">Example</p><p>${text(q.example)}</p></div>` : ""}
<ol class="options">
${options}
</ol>${answerLines(q)}
</article>`;
}

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** One typed attachment where a Result shows it. `id` is unique per place, because one attachment can appear twice. */
function attachmentHtml(a: Attachment, id: string): string {
  let body: string;
  let state: string;
  if (a.availability === "unavailable") {
    state = "Unavailable";
    body = `<p class="unavailable"><span class="label">Not captured</span><span>${text(a.reason!)}</span></p>`;
  } else if (a.availability === "external") {
    state = "Runs outside this page";
    body = `<div class="launch"><p class="label">How to run it</p><div class="description">${prose(a.launch!)}</div>${a.url ? `<p><a href="${esc(a.url)}" rel="noreferrer">${esc(a.url)}</a></p>` : ""}</div>`;
  } else {
    state = "Captured";
    const src = `assets/${esc(a.file!)}`;
    if (a.type === "image" || a.type === "svg") body = `<img src="${src}" alt="${esc(a.caption)}" loading="lazy">`;
    else if (a.type === "video") body = `<video src="${src}" controls preload="metadata" aria-label="${esc(a.caption)}"></video>`;
    // A file:// page ignores `download`, and a browser shows text files itself, so the link opens a new tab and the
    // reader keeps the Flow page.
    else body = `<p class="download"><a href="${src}" download="${esc(a.name!)}" target="_blank" rel="noopener">${esc(a.name!)}</a> <span class="source">${size(a.size!)}</span></p>`;
  }
  const revision = a.revision ? `<span>Revision <code>${esc(a.availability === "captured" ? a.revision.slice(0, 12) : a.revision)}</code></span>` : "";
  const from = a.from ? `<span>From <code>${esc(a.from.path)}</code></span>` : "";
  return `<figure class="attachment" id="${id}" data-type="${a.type}" data-availability="${a.availability}">
${body}
<figcaption><p>${text(a.caption)}</p><p class="attachment-meta"><span class="kind">${TYPE_LABELS[a.type]}</span><span>${state}</span>${revision}${from}<time datetime="${esc(a.time)}">${formatTime(a.time)}</time></p><p class="source">Origin: ${text(a.origin)}</p></figcaption>
</figure>`;
}

function documentHtml(r: ResultView, d: DocView, historical: boolean): string {
  const cites: Cites = new Map(d.citations.map((c) => [c.ref, { anchor: c.anchor, n: c.n }]));
  const att = new Map(r.shown.map((a) => [a.id, a]));
  const stop = historical ? "" : " data-stop";
  const sections = d.sections.map((sec) => {
    const blocks = sec.blocks.map((b, i) => {
      if ("prose" in b) return `<div class="description">${prose(b.prose, cites)}</div>`;
      if ("list" in b) {
        const tag = b.ordered ? "ol" : "ul";
        return `<${tag} class="bullets">${b.list.map((t) => `<li>${text(t, cites)}</li>`).join("")}</${tag}>`;
      }
      if ("code" in b) {
        const lang = b.language ? ` data-language="${esc(b.language)}"` : "";
        const label = [b.language, b.source].filter(Boolean).map((x) => esc(x!)).join(" · ");
        return `<figure class="code"><pre${lang}><code>${esc(b.code)}</code></pre>${label ? `<figcaption class="source">${label}</figcaption>` : ""}</figure>`;
      }
      return attachmentHtml(att.get(b.figure)!, `${sec.anchor}-f${i + 1}`);
    });
    return `<section class="doc-section" id="${sec.anchor}" aria-labelledby="${sec.anchor}-title"${stop}>
<h3 id="${sec.anchor}-title">${text(sec.heading)}</h3>
${blocks.join("\n")}
</section>`;
  });
  const heading = (id: string) => d.sections.find((sec) => sec.anchor === id)!.heading;
  const parts = [...sections];
  if (d.limitations.length) parts.push(`<section class="limitations" id="${d.limitationsAnchor}"${stop}><p class="label">Limitations</p><ul class="bullets">${d.limitations.map((l) => `<li>${text(l)}</li>`).join("")}</ul></section>`);
  if (d.citations.length)
    parts.push(`<section class="citations" id="${d.citationsAnchor}" aria-label="Citations"${stop}><p class="label">Citations</p><ol class="bullets">${d.citations
      .map((c) => `<li id="${c.anchor}">${text(c.text)}${c.cited_in.map((s) => ` <a class="backlink" href="#${s}">Cited in ${text(heading(s))}</a>`).join("")}</li>`)
      .join("")}</ol></section>`);
  if (d.sources.length) parts.push(`<section class="sources" id="${d.sourcesAnchor}"><p class="label">Sources</p><ul class="bullets">${d.sourceTexts.map((x) => `<li>${text(x)}</li>`).join("")}</ul></section>`);
  return `<div class="document">\n${parts.join("\n")}\n</div>`;
}

function provenance(r: ResultView): string {
  const c = r.canonical;
  const link = !c ? "" : "file" in c ? ` from <code>${esc(c.file)}</code> at sha256 <code>${c.sha256.slice(0, 12)}</code>` : "commit" in c ? ` from commit <code>${esc(c.commit.slice(0, 12))}</code>` : ` from ${text(c.tracker)} at <code>${esc(c.revision)}</code>`;
  const when = r.captured ? `, <time datetime="${esc(r.captured)}">${formatTime(r.captured)}</time>` : "";
  return `<p class="provenance">Revision ${r.revision}${when}${link}</p>`;
}

function resultHtml(r: ResultView, v: View, historical = false): string {
  const asks = (qs: string[]) => qs.map((id) => `<a href="#${id}">Q${v.questions.get(id)!.q}</a>: ${text(v.questions.get(id)!.title)}`);
  const askLine = (qs: string[]) => (qs.length ? `\n<p class="ask"><span class="label">Asked in</span><span>${asks(qs).join("; ")}</span></p>` : "");
  const fields = (pairs: [string, string][]) => `<dl class="fields">${pairs.map(([k, val]) => `<dt>${k}</dt><dd>${text(val)}</dd>`).join("")}</dl>`;
  let body: string;
  if (r.doc) {
    body = documentHtml(r, r.doc, historical);
  } else if (r.shape === "table") {
    const linked = r.entries.some((e) => e.questions.length);
    const head = `<tr>${r.columns!.map((c) => `<th scope="col">${text(c)}</th>`).join("")}${linked ? `<th scope="col">Asked in</th>` : ""}</tr>`;
    const rows = r.entries.map((e) => `<tr id="${e.anchor}">${(e.cells as string[]).map((c) => `<td>${text(c)}</td>`).join("")}${linked ? `<td>${asks(e.questions).join("; ")}</td>` : ""}</tr>`);
    body = `<div class="table"><table>\n<thead>${head}</thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table></div>`;
  } else if (r.shape === "ledger") {
    body = `<ol class="entries">\n${r.entries
      .map((e) => `<li class="claim" id="${e.anchor}" data-status="${e.status}">
<h3><span class="entry-id">${e.id}</span>${text(e.claim as string)}</h3>
<p class="tag">${CLAIM_LABELS[e.status as string]}</p>
${fields([["Evidence", e.evidence as string], ["Missing proof", e.missing_proof as string], ["Consequence", e.consequence as string]])}${askLine(e.questions)}
</li>`)
      .join("\n")}\n</ol>`;
  } else {
    body = `<ol class="entries">\n${r.entries
      .map((e) => `<li class="card" id="${e.anchor}"${e.blocking ? " data-blocking" : ""}>
<h3><span class="entry-id">${e.id}</span>${text(e.title as string)}</h3>
<p class="tag">${text(e.label as string)} (${e.blocking ? "blocking" : "non-blocking"})</p>
${fields([["Impact", e.impact as string], ["Action", e.action as string]])}
<details class="evidence"><summary>Evidence</summary><p>${text(e.evidence as string)}</p></details>${askLine(e.questions)}
</li>`)
      .join("\n")}\n</ol>`;
  }
  const figures = new Set(r.doc?.figures ?? []);
  const listed = r.shown.filter((a) => !figures.has(a.id));
  const attachments = listed.length ? `\n<div class="attachments"><p class="label">Attachments</p>${listed.map((a) => attachmentHtml(a, `${r.anchor}-${a.id}`)).join("\n")}</div>` : "";
  const history = r.history.length
    ? `\n<details class="revisions"><summary>Earlier revisions (${r.history.length})</summary>\n${[...r.history].reverse().map((h) => resultHtml(h, v, true)).join("\n")}\n</details>`
    : "";
  const tag = historical ? "article" : "section";
  return `<${tag} class="result" id="${r.anchor}" data-shape="${r.shape}" aria-labelledby="${r.anchor}-title"${historical ? "" : " data-stop"}>
<header><h2 id="${r.anchor}-title">${text(r.title)}</h2>${r.summary ? `<p class="result-summary">${text(r.summary)}</p>` : ""}${provenance(r)}</header>
${body}${attachments}${history}
</${tag}>`;
}

function stageHtml(st: StageView, v: View, entryTitle: (ref: string) => string, sourceText: (id: string) => string) {
  const nav: string[] = [];
  const body: string[] = [];
  const link = (id: string, label: string) => `<a href="#${id}" data-for="${id}">${esc(label)}</a>`;
  const bg = st.background;
  const lineage = [
    ...(st.parent ? [`<li><span class="label">Continues</span> <a href="#${st.parent}">${esc(stageLabel(v, st.parent))}</a></li>`] : []),
    ...st.children.map((id) => `<li><span class="label">Continued in</span> <a href="#${id}">${esc(stageLabel(v, id))}</a></li>`),
  ];
  if (lineage.length) body.push(`<ul class="lineage">${lineage.join("")}</ul>`);
  if (bg) {
    body.push(`<section class="background" id="${bg.id}" aria-labelledby="${bg.id}-title" data-stop>
<header><p class="label">Background</p><h2 id="${bg.id}-title">${text(bg.title)}</h2></header>
<p class="summary-line">${text(bg.summary)}</p>
${bg.sections.map((sec) => `<section><h3>${text(sec.heading)}</h3><div class="description">${prose(sec.body)}</div></section>`).join("\n")}
${sourcesHtml(bg.sourceTexts)}
</section>`);
    nav.push(link(bg.id, "Background"));
  }
  st.results.forEach((r, i) => {
    body.push(resultHtml(r, v));
    nav.push(link(r.id, i === 0 ? "Result" : `Result ${i + 1}`));
  });
  if (st.assumed.length) {
    const id = `${st.id}-assumed`;
    body.push(`<section class="result" id="${id}" data-shape="cards" aria-labelledby="${id}-title" data-stop>
<header><h2 id="${id}-title">Assumed</h2></header>
<ol class="entries">
${st.assumed
  .map((a) => `<li class="card" id="${a.id}">
<h3>${text(a.decision)}</h3>
<dl class="fields"><dt>Pick</dt><dd>${text(a.pick)}</dd><dt>Why</dt><dd>${text(a.why)}</dd></dl>${a.reopened_by ? `\n<p class="ask"><span class="label">Reopened in</span><span><a href="#${a.reopened_by}">Q${v.questions.get(a.reopened_by)!.q}</a>: ${text(v.questions.get(a.reopened_by)!.title)}</span></p>` : ""}
</li>`)
  .join("\n")}
</ol>
</section>`);
    nav.push(link(id, "Assumed"));
  }
  for (const item of st.items) {
    if (item.type === "round") {
      const r = item.round;
      body.push(`<section class="round" aria-labelledby="${r.id}">
<header><h2 id="${r.id}">Round ${r.n}<time datetime="${esc(r.time)}">${formatTime(r.time)}</time></h2></header>
${item.questions.map((q) => questionHtml(q, v, entryTitle, sourceText)).join("\n")}
</section>`);
      if (item.questions.length) {
        if (nav.length) nav.push(`<span class="sep" aria-hidden="true"></span>`);
        for (const q of item.questions) nav.push(`<a href="#${q.id}" data-for="${q.id}"><span class="dot" data-state="${q.retired ? "retired" : q.answer.state}"></span>Q${q.q}</a>`);
      }
    } else {
      const c = item.close;
      const assumed = st.assumed.filter((a) => c.assumed.includes(a.id));
      const bullets = [
        ...[...c.decisions].sort((a, b) => v.questions.get(a.question)!.q - v.questions.get(b.question)!.q).map((d) => `<li><a href="#${d.question}">Q${v.questions.get(d.question)!.q}</a> <span class="label">(${PROVENANCE[d.answer]})</span>: ${text(d.text)}</li>`),
        ...assumed.map((a) => `<li><a href="#${a.id}">Assumed</a>: ${text(a.decision)}: ${text(a.pick)} <span class="label">(${text(a.why)})</span></li>`),
        ...(c.extra ?? []).map((e) => `<li>${text(e)}</li>`),
      ];
      body.push(`<section class="summary" id="${c.id}" aria-labelledby="${c.id}-title"${item.latest ? " data-stop" : ""}>
<h2 id="${c.id}-title">Summary<time datetime="${esc(c.time)}">${formatTime(c.time)}</time></h2>
<ul class="decisions">
${bullets.join("\n")}
</ul>
</section>`);
      if (item.latest) nav.push(`<span class="sep" aria-hidden="true"></span>${link(c.id, "Summary")}`);
    }
  }
  return { nav, body };
}

/** The progress strip that opens the Overview. Each fact keeps its own line: a finished Stage, the task count, a PR,
 * a check, and the End state never stand in for one another, and nothing shown here was observed by the page. */
function progressHtml(p: ProgressView, v: View): string {
  const stageLabel = (id: string) => esc(v.stages.find((st) => st.id === id)!.label);
  const when = (s: { time: string; stage: string }) => `<span class="source">${formatTime(s.time)}, <a href="#${s.stage}">${stageLabel(s.stage)}</a></span>`;
  const evidence = (items: string[]) => (items.length ? `<details class="evidence"><summary>Evidence</summary><ul class="bullets">${items.map((e) => `<li>${text(e)}</li>`).join("")}</ul></details>` : "");
  const taskTitle = (id: string) => esc(p.tasks.find((t) => t.id === id)!.title);
  const count = (state: string) => p.tasks.filter((t) => t.state === state).length;
  const work = p.tasks.filter((t) => t.state !== "skipped" && t.state !== "inapplicable").length;
  const notWork = count("skipped") + count("inapplicable");
  const blocked = p.tasks.filter((t) => t.blocked_by.length).length;

  let verdict: string;
  if (p.complete) verdict = p.delivery ? `Complete: every task is settled and the requested End state is reached.` : `Complete: every task is settled; this Flow delivers no commit or PR.`;
  else {
    const why: string[] = [];
    if (!p.tasks.length) why.push("no tasks recorded");
    const left = p.remaining.filter((id) => p.tasks.some((t) => t.id === id)).length;
    if (left) why.push(`${left} ${left === 1 ? "task" : "tasks"} left`);
    const open = p.remaining.length - left;
    if (open) why.push(`${open} open ${open === 1 ? "blocker" : "blockers"}`);
    if (p.delivery === undefined) why.push("End state not chosen");
    else if (!p.end_state_met) why.push(`requested End state not reached`);
    verdict = `Not complete: ${why.join(", ")}.`;
  }

  const taskLine = [`${count("done")} of ${work} done`, ...(count("active") ? [`${count("active")} active`] : []), ...(blocked ? [`${blocked} blocked`] : []), ...(notWork ? [`${notWork} skipped or not applicable`] : [])].join(", ");
  const requested = p.requested ? (p.requested.value === "none" ? `None: not a delivery Flow ${when(p.requested)}` : `${END_LABELS[p.requested.value]} ${when(p.requested)}`) : "Not chosen";
  const reached = p.requested?.value === "none" ? "Does not apply" : p.reached ? `${END_LABELS[p.reached.value]} ${when(p.reached)}${evidence(p.reached.evidence)}` : "Not reached";
  const facts: [string, string][] = [
    ["Tasks", p.tasks.length ? taskLine : "None recorded"],
    ["Stages", `${p.stages.finished} of ${p.stages.total} finished`],
    ["Requested End state", requested],
    ["Reached End state", reached],
  ];
  if (p.prs.length) facts.push(["PRs", `<ul class="bullets">${p.prs.map((x) => `<li id="${x.id}"><a href="${esc(x.url)}">${esc(x.title ?? x.url)}</a> <span class="tag" data-pr="${x.state}">${PR_LABELS[x.state]}</span> <span class="source">reported</span> ${when(x.reported)}</li>`).join("")}</ul>`]);
  if (p.checks.length) facts.push(["Checks", `<ul class="bullets">${p.checks.map((x) => `<li id="${x.id}">${text(x.name)} <span class="tag" data-check="${x.outcome}">${CHECK_LABELS[x.outcome]}</span> <span class="source">reported</span> ${when(x.reported)}${evidence(x.evidence)}</li>`).join("")}</ul>`]);

  const openBlockers = p.blockers.filter((b) => !b.resolved);
  const blockers = openBlockers.length
    ? `\n<div class="blockers"><p class="label">Blockers</p><ul class="bullets">${openBlockers.map((b) => `<li id="${b.id}">${text(b.text)}${b.tasks.length ? ` <span class="source">blocks ${b.tasks.map((id) => `<a href="#${id}">${taskTitle(id)}</a>`).join(", ")}</span>` : ""} ${when({ time: b.opened, stage: b.stage })}</li>`).join("")}</ul></div>`
    : "";
  const tasks = p.tasks.length
    ? `\n<ol class="tasks">\n${p.tasks.map((t) => {
        const by = t.blocked_by.length ? ` <span class="blocked">Blocked: ${t.blocked_by.map((id) => `<a href="#${id}">${esc(p.blockers.find((b) => b.id === id)!.text)}</a>`).join("; ")}</span>` : "";
        const resolved = p.blockers.filter((b) => b.resolved && b.tasks.includes(t.id)).map((b) => `<li><span class="label">Blocker resolved</span> ${text(b.resolved!.text)} <span class="source">Was: ${text(b.text)}</span></li>`);
        return `<li class="task" id="${t.id}" data-task="${t.state}"${t.blocked_by.length ? " data-blocked" : ""}><span class="tag">${TASK_LABELS[t.state]}</span><span>${text(t.title)}</span>${by} ${when(t.updates.at(-1)!)}${t.reason ? `<p class="reason">${text(t.reason)}</p>` : ""}${evidence(t.evidence)}${resolved.length ? `<ul class="bullets resolved">${resolved.join("")}</ul>` : ""}</li>`;
      }).join("\n")}\n</ol>`
    : "";
  return `<section class="progress" id="progress" aria-labelledby="progress-title"${p.complete ? " data-complete" : ""}>
<header><h2 id="progress-title">Progress</h2><p class="verdict">${verdict}</p></header>
<dl class="facts">${facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("")}</dl>${blockers}${tasks}
</section>`;
}

export function render(v: View): string {
  const sourceText = (id: string) => v.sources.find((x) => x.id === id)!.text;
  const entryTitle = (ref: string) => {
    const [rid, eid] = ref.split("/");
    const r = v.stages.flatMap((st) => st.results).find((x) => x.id === rid)!;
    const e = r.entries.find((x) => x.id === eid)!;
    const name = r.shape === "cards" ? (e.title as string) : r.shape === "ledger" ? (e.claim as string) : (e.cells as string[])[0] || e.id;
    return `${text(r.title)} <span class="entry-id">${e.id}</span>: ${text(name)}`;
  };
  const tabs = [`<a role="tab" id="tab-overview" aria-selected="true" aria-controls="overview" href="#overview">Overview</a>`];
  const jumpRows: string[] = [];
  const overview: string[] = [];
  const panels: string[] = [];
  for (const st of v.stages) {
    const { nav, body } = stageHtml(st, v, entryTitle, sourceText);
    const label = esc(st.label);
    const dot = `<span class="dot" data-state="${st.state}"></span>`;
    const asked = st.asked.map((q) => {
      const shown = shownAnswer(q);
      return `<li><a href="#${q.id}">Q${q.q}</a> ${text(q.title)} <span class="${shown.cls}">${shown.html}</span></li>`;
    });
    let empty = `<p class="empty">No questions yet.</p>`;
    const standing = st.assumed.filter((a) => !a.reopened_by).length;
    if (!asked.length && standing) empty = `<p class="empty"><a href="#${st.id}-assumed">No questions; ${standing} ${standing === 1 ? "decision" : "decisions"} assumed</a></p>`;
    tabs.push(`<a role="tab" id="tab-${st.id}" aria-selected="false" aria-controls="${st.id}" href="#${st.id}">${dot}${label}</a>`);
    if (nav.length) jumpRows.push(`<nav class="jump-row" aria-label="Jump row of ${label}" data-tab="${st.id}" hidden>${nav.join("")}</nav>`);
    overview.push(`<li class="stage" data-state="${st.state}">
<h3><a href="#${st.id}">${dot}${label}</a><span class="meta"><span class="state">${STATE_LABELS[st.state]}</span><span>${esc(st.skill)}</span></span></h3>
${asked.length ? `<ul>${asked.join("")}</ul>` : empty}
</li>`);
    panels.push(`<section class="tab" id="${st.id}" role="tabpanel" aria-labelledby="tab-${st.id}" hidden>\n${body.join("\n") || `<p class="empty">Nothing recorded yet.</p>`}\n</section>`);
  }
  if (v.topics.length) {
    tabs.push(`<a role="tab" id="tab-topics" aria-selected="false" aria-controls="topics" href="#topics">Topics</a>`);
    jumpRows.push(`<nav class="jump-row" aria-label="Topic notes" data-tab="topics" hidden>${v.topics.map((t) => `<a href="#${t.id}" data-for="${t.id}">${text(t.title)}</a>`).join("")}</nav>`);
    const notes = v.topics.map((t) => `<article class="topic" id="${t.id}" data-stop>
<h3>${text(t.title)}</h3>
<p class="summary-line">${text(t.summary)}</p>
<div class="description">${prose(t.body)}</div>${labelled("Asked in", t.questions.map((id) => `<li><a href="#${id}">Q${v.questions.get(id)!.q}</a>: ${text(v.questions.get(id)!.title)}</li>`), "result-links")}
${sourcesHtml(t.sourceTexts)}
</article>`);
    panels.push(`<section class="tab" id="topics" role="tabpanel" aria-labelledby="tab-topics" hidden>\n${notes.join("\n")}\n</section>`);
  }
  // A closed or reopened Flow says so under its heading; a Flow that was never closed needs no line.
  const last = v.lifecycle.at(-1);
  const lifecycle = last ? `<p class="lifecycle" data-state="${last.event}">${last.event === "closed" ? "Closed" : "Reopened"} <time datetime="${esc(last.time)}">${formatTime(last.time)}</time></p>` : "";
  const head = `<header class="page-head"><h1>${text(v.flow.title)}</h1>${lifecycle}</header>`;
  const overviewPanel = `<section class="tab" id="overview" role="tabpanel" aria-labelledby="tab-overview">\n${progressHtml(v.progress, v)}\n${overview.length ? `<ol class="stages">\n${overview.join("\n")}\n</ol>` : `<p class="empty">No Stage yet.</p>`}\n</section>`;
  const bar = `<header class="bar">\n<div class="tabs" role="tablist" aria-label="Stages">${tabs.join("")}</div>\n${jumpRows.join("\n")}\n</header>`;
  const meta = `<meta name="flow-page-flow" content="${esc(v.flow.id)}">\n  <meta name="flow-page-revision" content="${v.revision}">\n  <meta name="flow-page-renderer" content="${RENDERER}">`;
  return readFileSync(TEMPLATE, "utf8")
    .replace("{{title}}", () => esc(v.flow.title))
    .replace("<!-- META -->", () => meta)
    .replace("<!-- NAV -->", () => bar)
    .replace("<!-- BODY -->", () => [head, overviewPanel, ...panels].join("\n"));
}
