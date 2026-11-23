import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ApprovalChoice, ApprovalPlan } from "./approval.ts";
import { displayField, FIELD_SEPARATOR, shortPath } from "./display.ts";

type CommandOutput = { exit_code: number | null; file: string };
type Checkout = {
  path: string;
  kind: string;
  verdict: string;
  state: string;
  automatic?: boolean;
  branch?: string | null;
  reasons: string[];
  owners: { type: string; id?: string; pid?: number }[];
  unique_history: { ref: string }[];
};
type Inventory = { checkouts: Checkout[]; evidence_gaps: string[] };
type Investigation =
  | { path: string; status: "complete"; checkout: Checkout }
  | { path: string; status: "failed" | "not-run"; reason: string };
type Attempt = { origin: "automatic" | "picked"; targets: { path: string; repository: string }[]; output?: CommandOutput };
type Observation = {
  path: string;
  disk: "present" | "absent" | "unknown";
  ovnfs_listed?: boolean | null;
  git_registered?: boolean | null;
  branch_preserved?: boolean | null;
};
type Offer = { question_ref: string; picked?: string[] };
type RemovalResult = { path: string; method?: string; reason?: string; error?: string };
type RemovalReport = Record<"removed" | "skipped" | "failed", RemovalResult[]>;
type AttemptRecord = { origin: Attempt["origin"]; repository: string; output?: CommandOutput; status?: keyof RemovalReport; outcome?: RemovalResult };
type CheckoutRecord = {
  discovery: Checkout;
  investigation: Investigation | { status: "not-needed" };
  offer: { offered: boolean; picked: boolean; settled: boolean; question_ref?: string };
  removals: AttemptRecord[];
  verification: { inventory?: Checkout; observation?: Observation };
};
type Section = { heading: string; blocks: ({ prose: string } | { list: string[] } | { code: string })[] };
const HEADINGS = {
  pickedSkip: "Skipped",
  removed: "Removed",
  inUse: "Kept, in use",
  ownershipChanged: "Kept, ownership changed",
  unique: "Kept, unique commits",
  uncertain: "Kept, not safe to judge",
  notPicked: "Offered but not picked",
  removalPending: "Removal pending",
  failed: "Removal failed",
  automaticSkip: "Automatic removal skipped",
  notInvestigated: "Not investigated",
  unverified: "Outcome not verified",
  notAttempted: "Kept, no removal attempted",
} as const;
type Group = keyof typeof HEADINGS;
type Outcome = { group: Group | "needsPick"; reason: string; verificationGap?: string };

const SAFETY_REASONS = [
  "Unsupported checkout layout",
  "Named or verifier ovnfs checkout",
  "Source in use by ovnfs",
  "Unknown source repository",
  "Git state could not be checked",
  "Safety could not be established",
] as const;

const OWNER_TYPES = [
  ["session", "open session"], ["task", "running task"], ["process", "process using the checkout"],
] as const;

const STOP_MESSAGES = {
  inventory: "The cleanup stopped during initial inventory.",
  "prepare-source": "The cleanup stopped while preparing repository comparisons.",
  investigation: "The cleanup stopped during investigation.",
  approval: "The cleanup stopped before it could finish asking for picks.",
  removal: "The cleanup stopped during removal.",
  verification: "The cleanup stopped before verification finished.",
  other: "The cleanup stopped early.",
} as const;

const DOCUMENT_INLINE_MARKUP = /`[^`]+`|\[@[a-z0-9][a-z0-9-]*\]|\[[^\]]*\]\([^)\s]*\)/;

function rows(heading: string, list: string[]): Section {
  const hasDocumentInlineMarkup = list.some((line) => DOCUMENT_INLINE_MARKUP.test(line));
  return { heading, blocks: [hasDocumentInlineMarkup ? { code: list.join("\n") } : { list }] };
}

type Records = {
  version: 1;
  phase: "running" | "picking" | "finished";
  inventory?: CommandOutput;
  stop?: keyof typeof STOP_MESSAGES;
  investigations?: Investigation[];
  approval_plan?: string;
  offers?: Offer[];
  removals?: Attempt[];
  verification?: { inventory?: CommandOutput; observations: Observation[] };
};

function noInventory(records: Records): string {
  if (!records.inventory) return records.phase === "finished"
    ? "The cleanup stopped before the initial inventory ran."
    : "The initial inventory has not run yet.";
  if (records.inventory.exit_code === null) return "The initial inventory was interrupted before it returned a checkout list.";
  if (records.inventory.exit_code !== 0) return "The initial inventory failed before it returned a checkout list.";
  return "The initial inventory did not return a readable checkout list.";
}

function readJson(directory: string, file: string): unknown {
  return JSON.parse(readFileSync(resolve(directory, file), "utf8"));
}

function commandJson(directory: string, output?: CommandOutput): unknown {
  if (!output) return undefined;
  try {
    return readJson(directory, output.file);
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function readInventory(directory: string, output?: CommandOutput): Inventory | undefined {
  const raw = commandJson(directory, output) as Partial<Inventory> | undefined;
  if (!raw || !Array.isArray(raw.checkouts) || !Array.isArray(raw.evidence_gaps)
    || !raw.checkouts.every((c) => c && typeof c.path === "string" && typeof c.kind === "string"
      && typeof c.verdict === "string" && typeof c.state === "string" && Array.isArray(c.owners)
      && Array.isArray(c.reasons) && Array.isArray(c.unique_history))) return undefined;
  return raw as Inventory;
}

function removalRecords(directory: string, attempts: Attempt[]): Map<string, AttemptRecord[]> {
  const records = new Map<string, AttemptRecord[]>();
  for (const { origin, targets, output } of attempts) {
    const report = commandJson(directory, output) as Partial<RemovalReport> | undefined;
    const results = new Map<string, Pick<AttemptRecord, "status" | "outcome">>();
    for (const status of ["failed", "skipped", "removed"] as const) {
      if (Array.isArray(report?.[status])) {
        for (const outcome of report[status]) results.set(outcome.path, { status, outcome });
      }
    }
    for (const { path, repository } of targets) {
      const attempt = { origin, repository, output, ...results.get(path) };
      const previous = records.get(path);
      if (previous) previous.push(attempt);
      else records.set(path, [attempt]);
    }
  }
  return records;
}

function skipReason(reason: string | undefined, picked: boolean): string {
  if (reason === "it changed since the inventory") return picked ? "changed since it was investigated" : "changed since inventory";
  if (reason?.startsWith("it is in use now:")) return "in use when removal was checked";
  if (reason?.startsWith("its ownership is uncertain:")) return "could not establish that removal was safe";
  if (reason?.startsWith("it holds commits or stashes that exist nowhere else")) return "has commits or stashes to preserve";
  if (reason?.startsWith("its Git state and history cannot be verified")) return "could not verify its Git state";
  if (reason?.includes("removing it needs --approve")) return "needs an explicit pick for removal";
  if (reason?.startsWith("it is no longer a checkout")) return "no longer listed as a checkout";
  return "a removal guard blocked it";
}

function safetyReason(checkout: Checkout): string {
  const has = (prefix: string) => checkout.reasons.some((reason) => reason.startsWith(prefix));
  if (checkout.kind === "excluded" || has("native omp entry has no supported checkout layout")) return SAFETY_REASONS[0];
  if (has("ovnfs checkout is outside omp cleanup scope")) return SAFETY_REASONS[1];
  if (has("source for ovnfs checkouts:")) return SAFETY_REASONS[2];
  if (has("cannot establish source repository") || has("cannot establish ovnfs checkout origin")) return SAFETY_REASONS[3];
  if (checkout.state === "unknown") return SAFETY_REASONS[4];
  return SAFETY_REASONS[5];
}

function isUnsafe(checkout: Checkout): boolean {
  return checkout.verdict !== "owned"
    && (checkout.kind === "excluded" || checkout.verdict !== "unused" || checkout.state === "unknown" || checkout.reasons.length > 0);
}

function ownershipChange(before: Checkout, after: Checkout): string | undefined {
  if (before.verdict !== "owned") return after.verdict === "owned" ? "in use at verification" : undefined;
  if (after.verdict !== "owned") return "no longer in use at verification";
  const identities = ({ owners }: Checkout) => new Set(owners.map(({ type, id, pid }) => `${type}:${id ?? pid ?? ""}`));
  const previous = identities(before);
  const current = identities(after);
  if (previous.size !== current.size) return "different owners at verification";
  for (const owner of previous) {
    if (!current.has(owner)) return "different owners at verification";
  }
}

type VerificationStatus = "not-run" | "incomplete" | "complete";

function removalVerification(record: CheckoutRecord, target: Checkout, status: VerificationStatus): string | undefined {
  if (status === "not-run") return "removal reported, but verification did not run";
  if (status !== "complete") return "removal reported, but verification did not finish";
  if (record.verification.inventory) return "removal reported, but the checkout is still listed";
  const observed = record.verification.observation;
  if (observed?.disk !== "absent") return "removal reported, but absence from disk was not verified";
  if (target.kind === "ovnfs" && observed.ovnfs_listed !== false) return "removal reported, but ovnfs absence was not verified";
  if (target.kind === "linked-worktree") {
    if (observed.git_registered !== false) return "removal reported, but Git registration was not verified";
    if (target.branch && observed.branch_preserved !== true) return "removal reported, but branch preservation was not verified";
  }
}

function keptVerification({ inventory, observation }: CheckoutRecord["verification"], status: VerificationStatus): string | undefined {
  if (status === "not-run") return "verification did not run";
  if (status !== "complete") return "verification did not finish";
  if (!inventory) return "kept checkout was not listed at verification";
  if (observation?.disk === "absent") return "checkout was absent from disk at verification";
  if (observation?.disk !== "present") return "presence on disk was not verified";
}

function classify(record: CheckoutRecord, current: Checkout, { phase, stop }: Pick<Records, "phase" | "stop">, verificationStatus: VerificationStatus, pending?: string): Outcome {
  const { investigation, offer, removals, verification } = record;
  const attempt = removals.findLast(({ status }) => status === "removed") ?? removals.at(-1);
  if (attempt?.status === "removed") {
    const reason = phase === "finished" ? removalVerification(record, current, verificationStatus) : undefined;
    return reason ? { group: "unverified", reason } : { group: "removed", reason: attempt.repository };
  }
  if (attempt?.status === "skipped") {
    const picked = attempt.origin === "picked";
    let verificationGap: string | undefined;
    if (phase === "finished") {
      if (verification.observation?.disk !== "present") verificationGap = "presence not verified";
      else if (verificationStatus !== "complete" || !verification.inventory || verification.inventory.verdict === "uncertain") {
        verificationGap = "ownership not verified";
      }
    }
    return { group: picked ? "pickedSkip" : "automaticSkip", reason: skipReason(attempt.outcome?.reason, picked), verificationGap };
  }
  if (attempt?.status === "failed") return { group: "failed", reason: "the removal command reported a failure" };
  if (offer.picked && (!attempt || (phase !== "finished" && !attempt.output))) {
    return { group: "removalPending", reason: phase === "finished" ? "picked, but removal did not run" : "picked for removal" };
  }
  if (attempt) return { group: "unverified", reason: "no removal outcome was recorded" };
  if (phase === "finished" && (!stop || verificationStatus === "complete")) {
    const reason = keptVerification(verification, verificationStatus);
    if (reason) return { group: "unverified", reason };
    if (verification.inventory) {
      if (current.verdict !== "uncertain" && verification.inventory.verdict === "uncertain") {
        return { group: "unverified", reason: "ownership could not be verified" };
      }
      const change = ownershipChange(current, verification.inventory);
      if (change) return { group: "ownershipChanged", reason: change };
    }
  }
  if (pending) return { group: "needsPick", reason: pending };
  if (offer.offered) return { group: "notPicked", reason: "not selected for removal" };
  if (current.verdict === "owned") {
    const owners = OWNER_TYPES.filter(([type]) => current.owners.some((owner) => owner.type === type)).map(([, label]) => label);
    return { group: "inUse", reason: owners.join(", ") || "in use" };
  }
  if (isUnsafe(current)) {
    return { group: "uncertain", reason: safetyReason(current) };
  }
  if (current.unique_history.length > 0) {
    return { group: "unique", reason: [...new Set(current.unique_history.map(({ ref }) => ref))].join(", ") };
  }
  if (investigation.status === "failed" || investigation.status === "not-run") {
    return { group: "notInvestigated", reason: investigation.status === "failed" ? "investigation did not finish" : "investigation did not run" };
  }
  return { group: "notAttempted", reason: current.automatic ? "automatic removal did not run" : "not offered for removal" };
}

function render(records: Records, directory: string, revises?: string) {
  const result = {
    kind: "result", ...(revises ? { revises } : { ref: "cleanup-summary" }),
    shape: "document", title: "Checkout cleanup",
  };
  const sections: Section[] = [];
  const contribution = (summary: string) => ({ version: 1, items: [{ ...result, summary, sections }] });
  const inventory = readInventory(directory, records.inventory);
  if (!inventory) {
    sections.push({ heading: "Inventory", blocks: [{ prose: "No checkout counts are available." }] });
    return { checkouts: [], contribution: contribution(noInventory(records)) };
  }

  const plan = records.approval_plan ? readJson(directory, records.approval_plan) as ApprovalPlan : undefined;
  const pending = new Map<string, ApprovalChoice>();
  const offers = new Map<string, CheckoutRecord["offer"]>();
  const recordedOffers = new Map(records.offers?.map((offer) => [offer.question_ref, offer]));
  for (const { question_ref, mapping } of plan?.rounds ?? []) {
    const received = recordedOffers.get(question_ref);
    const picked = new Set(received?.picked);
    for (const choice of mapping) {
      const { path } = choice;
      if (records.phase === "picking" && received?.picked === undefined) pending.set(path, choice);
      if (received) offers.set(path, { question_ref, offered: true, settled: received.picked !== undefined, picked: picked.has(path) });
    }
  }
  const attempts = removalRecords(directory, records.removals ?? []);
  const investigations = new Map(records.investigations?.map((item) => [item.path, item]));
  const verification = readInventory(directory, records.verification?.inventory);
  const verificationStatus: VerificationStatus = !records.verification?.inventory ? "not-run"
    : records.verification.inventory.exit_code === 0 && verification?.evidence_gaps.length === 0 ? "complete" : "incomplete";
  const verificationInventory = new Map(verification?.checkouts.map((c) => [c.path, c]));
  const observations = new Map(records.verification?.observations.map((o) => [o.path, o]));
  const lines = new Map<Group, string[]>();
  const counts = new Map<Group, Map<string, number>>();
  const actionable = new Set<string>();
  let kept = 0;

  const checkouts = inventory.checkouts.map((discovery) => {
    const path = discovery.path;
    const needsInvestigation = discovery.verdict === "unused" && discovery.state === "dirty" && !discovery.automatic
      && discovery.unique_history.length === 0 && discovery.reasons.length === 0;
    const record: CheckoutRecord = {
      discovery,
      investigation: investigations.get(path) ?? (needsInvestigation
        ? { path, status: "not-run", reason: "No investigation record was saved." } : { status: "not-needed" }),
      offer: offers.get(path) ?? { offered: false, settled: false, picked: false },
      removals: attempts.get(path) ?? [],
      verification: { inventory: verificationInventory.get(path), observation: observations.get(path) },
    };
    const current = record.investigation.status === "complete" ? record.investigation.checkout : discovery;
    const outcome = classify(record, current, records, verificationStatus, pending.get(path)?.label);
    const { group, reason, verificationGap } = outcome;
    if (group === "needsPick") actionable.add(path);
    else if (group === "uncertain" || ((group === "unverified" || group === "ownershipChanged") && isUnsafe(current))) {
      const reasons = counts.get(group) ?? new Map<string, number>();
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      counts.set(group, reasons);
    } else {
      const row = `${shortPath(path)}${FIELD_SEPARATOR}${displayField(reason)}${verificationGap ? FIELD_SEPARATOR + verificationGap : ""}`;
      const groupLines = lines.get(group);
      if (groupLines) groupLines.push(row);
      else lines.set(group, [row]);
    }
    switch (group) {
      case "inUse":
      case "ownershipChanged":
      case "unique":
      case "uncertain":
      case "notPicked":
      case "notInvestigated":
      case "notAttempted":
        kept++;
    }
    return { ...record, outcome };
  });
  if (actionable.size) {
    sections.push({ heading: "Needs your pick", blocks: [{ prose: "Select only the checkouts you want removed." }] });
    const labels = { remove: [] as string[], keep: [] as string[] };
    for (const [path, { label, recommendation }] of pending) {
      if (actionable.has(path)) labels[recommendation].push(label);
    }
    if (labels.remove.length) sections.push(rows("Agent says remove", labels.remove));
    if (labels.keep.length) sections.push(rows("Agent says keep", labels.keep));
  }
  for (const [group, heading] of Object.entries(HEADINGS) as [Group, string][]) {
    const list = lines.get(group) ?? [];
    const reasons = counts.get(group);
    if (reasons) {
      for (const reason of group === "uncertain" ? SAFETY_REASONS : reasons.keys()) {
        if (reasons.has(reason)) list.push(`${reasons.get(reason)} · ${reason}`);
      }
    }
    if (list.length) sections.push(rows(heading, list));
  }
  if (records.stop) sections.push({ heading: "Run status", blocks: [{ prose: STOP_MESSAGES[records.stop] }] });
  else if (records.phase !== "finished") sections.push({ heading: "Run status", blocks: [{ prose: "Cleanup is in progress." }] });
  else if (!sections.length) sections.push({ heading: "Inventory", blocks: [{ prose: "No checkouts were found." }] });
  const removed = lines.get("removed")?.length ?? 0;
  const skipped = (lines.get("pickedSkip")?.length ?? 0) + (lines.get("automaticSkip")?.length ?? 0);
  return { checkouts, contribution: contribution(`${removed} removed · ${actionable.size} needs your pick · ${skipped} skipped · ${kept} kept`) };
}

function linkedRound(file: string, ref: string, resultId: string) {
  const plan = JSON.parse(readFileSync(file, "utf8")) as ApprovalPlan;
  const round = plan.rounds.find(({ question_ref }) => question_ref === ref);
  if (!round) throw new Error(`no approval round named ${ref}`);
  const question = round.contribution.items[0].questions[0];
  if (question.ref !== ref || resultId.includes("/")) throw new Error("link-round needs the question ref and a whole Result id");
  question.results = [resultId];
  return round.contribution;
}

function main([file, flag, revises, extra, ...rest]: string[]) {
  if (file === "link-round" && flag && revises && extra && !rest.length) return linkedRound(flag, revises, extra);
  if (!file || (flag !== undefined && (flag !== "--revises" || !revises || extra !== undefined))) {
    throw new Error("usage: bun summary.ts <summary-records.json> [--revises <result-id>] | link-round <approval-plan.json> <question-ref> <result-id>");
  }
  const directory = resolve(dirname(file));
  const records: Records = JSON.parse(readFileSync(file, "utf8"));
  if (records.version !== 1 || !["running", "picking", "finished"].includes(records.phase)) throw new Error("summary records require version 1 and a phase");
  const { checkouts, contribution } = render(records, directory, revises);
  writeFileSync(resolve(directory, "checkout-accounting.json"), `${JSON.stringify({ ...records, checkouts }, null, 2)}\n`);
  return contribution;
}

try {
  process.stdout.write(`${JSON.stringify(main(Bun.argv.slice(2)), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`clean-wt summary: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
