import { readFileSync } from "node:fs";
import { isAbsolute, parse, resolve } from "node:path";
import type { Option, Question } from "../../flow-page/scripts/model.ts";

const CATEGORIES = ["source", "configuration", "scratch", "design", "generated-metadata", "other"] as const;
type Category = (typeof CATEGORIES)[number];
type InspectedTarget = {
  readonly path: string;
  readonly fingerprint: string;
  contents: { category: Category; detail: string }[];
  integration: { evidence: string } | { gap: string };
  classification: string;
  risk: string;
  recommendation: { action: "keep" | "remove"; reason: string };
};
type ApprovalQuestion = Pick<Question, "title" | "description" | "needs"> & {
  ref: string;
  multi: true;
  options: Omit<Option, "recommended" | "preview">[];
};

function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error(`${at} must be nonempty text without control characters`);
  return value;
}

function empty(value: unknown, at: string): void {
  if (!Array.isArray(value) || value.length !== 0) throw new Error(`${at} must be an empty array`);
}

function readTargets(value: unknown): InspectedTarget[] {
  const input = object(value, "input");
  if (input.version !== 1 || !Array.isArray(input.targets)) throw new Error("input requires version 1 and a targets array");
  const paths = new Set<string>();
  return input.targets.map((value, i) => {
    const at = `targets[${i}]`;
    const target = object(value, at);
    const checkout = object(target.checkout, `${at}.checkout`);
    const path = text(checkout.path, `${at}.checkout.path`);
    if (!isAbsolute(path) || resolve(path) !== path || path === parse(path).root || /[\r\n\t]/.test(path)) throw new Error(`${at}.checkout.path must be a normalized absolute checkout path`);
    if (paths.has(path)) throw new Error(`${at}.checkout.path duplicates another target: ${path}`);
    paths.add(path);
    if (typeof checkout.kind !== "string" || !["ovnfs", "linked-worktree", "standalone-clone", "task-isolation", "orphaned-worktree"].includes(checkout.kind)) throw new Error(`${at}.checkout.kind is protected or unsupported`);
    if (checkout.verdict !== "unused" || checkout.state !== "dirty" || checkout.automatic !== false) throw new Error(`${at}.checkout must be unused, dirty, and nonautomatic`);
    empty(checkout.owners, `${at}.checkout.owners`);
    empty(checkout.reasons, `${at}.checkout.reasons`);
    empty(checkout.unique_history, `${at}.checkout.unique_history`);
    const fingerprint = text(checkout.fingerprint, `${at}.checkout.fingerprint`);
    if (fingerprint.length !== 64 || !/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error(`${at}.checkout.fingerprint must be a lowercase SHA-256 fingerprint`);
    if (!Array.isArray(target.contents) || target.contents.length === 0) throw new Error(`${at}.contents must describe the remaining contents`);
    const contents = target.contents.map((value, n) => {
      const content = object(value, `${at}.contents[${n}]`);
      const category = CATEGORIES.find((category) => category === content.category);
      if (!category) throw new Error(`${at}.contents[${n}].category must be ${CATEGORIES.join(", ")}`);
      return { category, detail: text(content.detail, `${at}.contents[${n}].detail`) };
    });
    const rawIntegration = object(target.integration, `${at}.integration`);
    if (("evidence" in rawIntegration) === ("gap" in rawIntegration)) throw new Error(`${at}.integration requires exactly one evidence or gap`);
    const integration = "evidence" in rawIntegration
      ? { evidence: text(rawIntegration.evidence, `${at}.integration.evidence`) }
      : { gap: text(rawIntegration.gap, `${at}.integration.gap`) };
    const recommendation = object(target.recommendation, `${at}.recommendation`);
    const action = recommendation.action;
    if (action !== "keep" && action !== "remove") throw new Error(`${at}.recommendation.action must be keep or remove`);
    return {
      path, fingerprint, contents, integration,
      classification: text(target.classification, `${at}.classification`),
      risk: text(target.risk, `${at}.risk`),
      recommendation: { action, reason: text(recommendation.reason, `${at}.recommendation.reason`) },
    };
  });
}

const contentsOf = (target: InspectedTarget) => target.contents.map(({ category, detail }) => `${category}: ${detail}`).join("\n");
const integrationOf = (target: InspectedTarget) => "evidence" in target.integration ? `Evidence: ${target.integration.evidence}` : `Gap: ${target.integration.gap}`;
const recommendationOf = (target: InspectedTarget) => `${target.recommendation.action === "keep" ? "Keep" : "Remove"}: ${target.recommendation.reason}`;

function plan(targets: InspectedTarget[]) {
  const rounds = [];
  for (let offset = 0; offset < targets.length; offset += 26) {
    const batch = targets.slice(offset, offset + 26);
    const number = rounds.length + 1;
    const question: ApprovalQuestion = {
      ref: `cleanup-approval-${number}`,
      title: `Which checkouts in cleanup batch ${number} may be removed?`,
      description: `Select only the checkouts in batch ${number} that you authorize removing at their inspected fingerprints. All unselected checkouts stay. Recommendations below are evidence, not default selections. Cancellation, timeout, an unavailable picker, an empty selection, or a request for recommendations authorizes no removal. The removal command still refreshes every safety guard.`,
      needs: [{ need: `Understand the remaining contents, integration evidence, recommendation, and loss risk of each checkout in batch ${number}.`, kind: "prose" }],
      multi: true,
      options: batch.map((target) => ({
        label: target.path,
        does: `Authorize removal of ${target.path} only at inspected fingerprint ${target.fingerprint}.\nRemaining contents: ${contentsOf(target)}\n${integrationOf(target)}\nClassification: ${target.classification}\nRecommendation: ${recommendationOf(target)}`,
        gains: [`Removes the unresolved checkout at ${target.path} if the current ownership, contents, history, and snapshot guards pass.`],
        costs: [target.risk],
      })),
    };
    const round = { kind: "round" as const, questions: [question] };
    const table = offset === 0 ? {
      kind: "result" as const, shape: "table" as const,
      title: "Investigated unresolved checkouts",
      summary: "Recommendations are not consent. Only explicit picks map to the original inspected paths and fingerprints, subject to fresh removal guards.",
      columns: ["Checkout", "Inspected fingerprint", "Remaining contents", "Integration evidence or gap", "Classification", "Risk", "Recommendation"],
      rows: targets.map((target, i) => ({
        ref: `checkout-${i + 1}`,
        cells: [target.path, target.fingerprint, contentsOf(target), integrationOf(target), target.classification, target.risk, recommendationOf(target)],
      })),
    } : undefined;
    rounds.push({
      contribution: { version: 1, items: table ? [table, round] : [round] },
      question_ref: question.ref,
      mapping: batch.map(({ path, fingerprint }, i) => ({ letter: String.fromCharCode(65 + i), label: path, path, fingerprint })),
    });
  }
  return { version: 1, rounds };
}

try {
  const args = Bun.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("--")) throw new Error("usage: bun approval.ts <investigated-evidence.json | ->");
  const input: unknown = JSON.parse(readFileSync(args[0] === "-" ? 0 : args[0], "utf8"));
  process.stdout.write(`${JSON.stringify(plan(readTargets(input)), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`clean-wt approval: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
