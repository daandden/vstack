// The one Flow page renderer. It turns the derived view into the whole static page; every string from a
// contribution is escaped, so the page's only markup, style, and script come from this file and the template.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AnswerView, QuestionView, ResultView, StageView, View } from "./model.ts";

/** Raise this when the page a given state renders to changes, so a page names the renderer that made it. */
export const RENDERER = 1;
const TEMPLATE = join(import.meta.dir, "..", "templates", "flow-page.html");

const STATE_LABELS: Record<string, string> = { "in-progress": "In progress", finished: "Finished" };
const CLAIM_LABELS: Record<string, string> = { confirmed: "Confirmed", cleared: "Cleared", unproven: "Unproven" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escaped text with `code` and [text](https://url) kept. */
function text(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
}
/** Paragraphs split on blank lines; a block whose lines all start with "- " is a bullet list. */
function prose(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) return `<ul class="bullets">${lines.map((l) => `<li>${text(l.slice(2))}</li>`).join("")}</ul>`;
      return `<p>${text(lines.join(" "))}</p>`;
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

/** What the reader sees for an answer. A pick shows the picked label; nothing stands in for a missing answer. */
function shownAnswer(a: AnswerView): { cls: "pick" | "open"; html: string } {
  if (a.picks) return { cls: "pick", html: text(a.picks.join(", ")) };
  if (a.other !== undefined) return { cls: "pick", html: text(a.other) };
  return { cls: "open", html: a.state === "unanswered" ? "Unanswered" : "Open" };
}
function answerLine(a: AnswerView): string {
  let line: [string, string] | undefined;
  if (a.state === "unanswered") line = ["Unanswered", text(a.reason || "The ask timed out or was cancelled. This is not your answer, and the question stays open.")];
  else if (a.other !== undefined) line = ["Your answer", text(a.other)];
  else if (a.note) line = ["Your note", text(a.note)];
  return line ? `\n<p class="answer" data-state="${a.state}"><span class="label">${line[0]}</span><span>${line[1]}</span></p>` : "";
}

function questionHtml(q: QuestionView, v: View, entryTitle: (ref: string) => string, sourceText: (id: string) => string): string {
  const facts = (q.today ?? []).map((f) => `<li>${text(f.text)} <span class="source">${text(sourceText(f.source))}</span></li>`);
  const notes = (q.terms ?? []).map((t) => `<dt>${text(t.term)}</dt><dd>${text(t.text)}</dd>`).join("");
  const topics = (q.topics ?? []).map((id) => {
    const t = v.topics.find((x) => x.id === id)!;
    return `<li><a href="#${id}">${text(t.title)}</a>: ${text(t.summary)}</li>`;
  });
  const entries = (q.entries ?? []).map((ref) => `<li><a href="#${ref.replace("/", "-")}">${entryTitle(ref)}</a></li>`);
  const earlier = q.again ? [`<li><a href="#${q.again}">Q${v.questions.get(q.again)!.q}, asked earlier</a></li>`] : [];
  const later = q.asked_again_by.map((id) => `<li><a href="#${id}">Q${q.q}, asked again</a></li>`);
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
  return `<article class="question" id="${q.id}" data-state="${q.answer.state}"${q.open ? " data-open" : ""} data-stop>
<h3><span class="qnum">Q${q.q}</span>${text(q.title)}</h3>
<div class="description">${prose(q.description)}</div>${labelled("From the results", entries, "result-links")}${labelled("Related asks", [...earlier, ...later, ...decided], "result-links")}${labelled("Today", facts, "today")}${notes ? `\n<div class="terms"><p class="label">Term notes</p><dl>${notes}</dl></div>` : ""}${labelled("Topic notes", topics, "topics")}${q.example ? `\n<div class="example"><p class="label">Example</p><p>${text(q.example)}</p></div>` : ""}
<ol class="options">
${options}
</ol>${answerLine(q.answer)}
</article>`;
}

function resultHtml(r: ResultView, v: View): string {
  const asks = (qs: string[]) => qs.map((id) => `<a href="#${id}">Q${v.questions.get(id)!.q}</a>: ${text(v.questions.get(id)!.title)}`);
  const askLine = (qs: string[]) => (qs.length ? `\n<p class="ask"><span class="label">Asked in</span><span>${asks(qs).join("; ")}</span></p>` : "");
  const fields = (pairs: [string, string][]) => `<dl class="fields">${pairs.map(([k, val]) => `<dt>${k}</dt><dd>${text(val)}</dd>`).join("")}</dl>`;
  let body: string;
  if (r.shape === "table") {
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
  return `<section class="result" id="${r.id}" data-shape="${r.shape}" aria-labelledby="${r.id}-title" data-stop>
<header><h2 id="${r.id}-title">${text(r.title)}</h2>${r.summary ? `<p class="result-summary">${text(r.summary)}</p>` : ""}</header>
${body}
</section>`;
}

function stageHtml(st: StageView, v: View, entryTitle: (ref: string) => string, sourceText: (id: string) => string) {
  const nav: string[] = [];
  const body: string[] = [];
  const link = (id: string, label: string) => `<a href="#${id}" data-for="${id}">${esc(label)}</a>`;
  const bg = st.background;
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
  for (const item of st.items) {
    if (item.type === "round") {
      const r = item.round;
      body.push(`<section class="round" aria-labelledby="${r.id}">
<header><h2 id="${r.id}">Round ${r.n}<time datetime="${esc(r.time)}">${formatTime(r.time)}</time></h2></header>
${item.questions.map((q) => questionHtml(q, v, entryTitle, sourceText)).join("\n")}
</section>`);
      if (item.questions.length) {
        if (nav.length) nav.push(`<span class="sep" aria-hidden="true"></span>`);
        for (const q of item.questions) nav.push(`<a href="#${q.id}" data-for="${q.id}"><span class="dot" data-state="${q.answer.state}"></span>Q${q.q}</a>`);
      }
    } else {
      const c = item.close;
      const bullets = [
        ...[...c.decisions].sort((a, b) => v.questions.get(a.question)!.q - v.questions.get(b.question)!.q).map((d) => `<li><a href="#${d.question}">Q${v.questions.get(d.question)!.q}</a>: ${text(d.text)}</li>`),
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
      const shown = shownAnswer(q.answer);
      return `<li><a href="#${q.id}">Q${q.q}</a> ${text(q.title)} <span class="${shown.cls}">${shown.html}</span></li>`;
    });
    let empty = `<p class="empty">No questions yet.</p>`;
    const close = st.items.findLast((i) => i.type === "close");
    if (!asked.length && st.state === "finished" && close?.type === "close") {
      const assumed = (close.close.extra ?? []).filter((b) => b.startsWith("Assumed:")).length;
      if (assumed) empty = `<p class="empty"><a href="#${close.close.id}">No questions; ${assumed} ${assumed === 1 ? "decision" : "decisions"} assumed</a></p>`;
    }
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
  const head = `<header class="page-head"><h1>${text(v.flow.title)}</h1></header>`;
  const overviewPanel = `<section class="tab" id="overview" role="tabpanel" aria-labelledby="tab-overview">\n${overview.length ? `<ol class="stages">\n${overview.join("\n")}\n</ol>` : `<p class="empty">No Stage yet.</p>`}\n</section>`;
  const bar = `<header class="bar">\n<div class="tabs" role="tablist" aria-label="Stages">${tabs.join("")}</div>\n${jumpRows.join("\n")}\n</header>`;
  const meta = `<meta name="flow-page-flow" content="${esc(v.flow.id)}">\n  <meta name="flow-page-revision" content="${v.revision}">\n  <meta name="flow-page-renderer" content="${RENDERER}">`;
  return readFileSync(TEMPLATE, "utf8")
    .replace("{{title}}", () => esc(v.flow.title))
    .replace("<!-- META -->", () => meta)
    .replace("<!-- NAV -->", () => bar)
    .replace("<!-- BODY -->", () => [head, overviewPanel, ...panels].join("\n"));
}
