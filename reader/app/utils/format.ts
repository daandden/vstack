
export type Cites = Map<string, { anchor: string; n: number }>;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(s: string, cites?: Cites): string {
  const out = esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("#") ? "" : ' rel="noreferrer"'}>${t}</a>`);
  if (!cites) return out;
  return out.replace(/\[@([a-z0-9][a-z0-9-]*)\]/g, (m, ref) => {
    const c = cites.get(ref);
    return c ? `<a class="cite" href="#${c.anchor}" aria-label="Citation ${c.n}">[${c.n}]</a>` : m;
  });
}

export function prose(s: string, cites?: Cites): string {
  return s
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) return `<ul class="bullets">${lines.map((l) => `<li>${inline(l.slice(2), cites)}</li>`).join("")}</ul>`;
      return `<p>${inline(lines.join(" "), cites)}</p>`;
    })
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTime(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}` : iso;
}

export function eventTime(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (!m) return iso;
  const date = `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const t = m[4].match(/^T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  if (!t) return date;
  return `${date}, ${t[1]}:${t[2]}${t[3] && t[3] !== "00" ? `:${t[3]}` : ""} ${t[4] === "Z" ? "UTC" : t[4]}`;
}

export const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
export const demoValue = (v: number | boolean | string) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));

export const STATE_LABELS: Record<string, string> = { "not-started": "Not started", "in-progress": "In progress", finished: "Finished" };
export const CLAIM_LABELS: Record<string, string> = { confirmed: "Confirmed", cleared: "Cleared", unproven: "Unproven" };
export const TYPE_LABELS: Record<string, string> = { image: "Image", video: "Video", svg: "SVG figure", mermaid: "Mermaid diagram", file: "File", trace: "Trace", evidence: "Captured evidence", artifact: "Runnable artifact" };
export const TASK_LABELS: Record<string, string> = { pending: "To do", active: "Active", done: "Done", skipped: "Skipped", inapplicable: "Does not apply" };
export const END_LABELS: Record<string, string> = { commit: "Commit", "merge-ready": "Merge-ready", shipped: "Shipped" };
export const PR_LABELS: Record<string, string> = { open: "Open", merged: "Merged", closed: "Closed" };
export const CHECK_LABELS: Record<string, string> = { passed: "Passed", failed: "Failed", pending: "Pending" };
export const OUTCOME_LABELS: Record<string, string> = { succeeded: "Succeeded", failed: "Failed", blocked: "Blocked", skipped: "Skipped", unknown: "Outcome unknown", noted: "Noted" };
export const AXIS_LABELS: Record<string, string> = { standards: "Standards", spec: "Spec", "blast-radius": "Blast radius" };
export const REVIEW_LABELS: Record<string, string> = { findings: "Findings", clean: "Clean", skipped: "Skipped", unavailable: "Unavailable", blocked: "Blocked" };
export const VERDICT_LABELS: Record<string, string> = { chosen: "Chosen", tie: "Tie", inconclusive: "Inconclusive" };
export const MEASURE_LABELS: Record<string, string> = { better: "Reported better", worse: "Reported worse", "no-difference": "Reported no measurable difference", inconclusive: "Reported inconclusive" };
export const PROVENANCE: Record<string, string> = { picked: "your pick", written: "your recorded words", resolved: "read from your words", unresolved: "not your answer", open: "not answered" };
export const SHAPE_LABELS: Record<string, string> = { cards: "Cards", review: "Review", ledger: "Ledger", table: "Table", document: "Document", code: "Code", timeline: "Timeline", prototype: "Prototype", comparison: "Comparison", metrics: "Metrics", quiz: "Quiz", demo: "Demo" };
