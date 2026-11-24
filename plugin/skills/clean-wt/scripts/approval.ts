import { readFileSync } from "node:fs";
import { isAbsolute, parse, resolve } from "node:path";
import type { Option, Question } from "../../flow-page/scripts/model.ts";
import { displayField, FIELD_SEPARATOR, shortPath } from "./display.ts";

const CATEGORIES = ["source", "configuration", "scratch", "design", "generated-metadata", "other"] as const;
type Recommendation = "keep" | "remove";
type InspectedTarget = {
  readonly path: string;
  readonly fingerprint: string;
  readonly repository: string;
  readonly verdict: string;
  readonly action: Recommendation;
};
type ApprovalQuestion = Pick<Question, "title" | "description" | "needs"> & {
  brief: Required<Pick<NonNullable<Question["brief"]>, "unblocks" | "undo" | "no_recommendation">>;
  ref: string;
  results?: string[];
  multi: true;
  options: Omit<Option, "recommended" | "preview">[];
};

export type ApprovalChoice = { letter: string; label: string; path: string; fingerprint: string; recommendation: Recommendation };
type ApprovalRound = {
  question_ref: string;
  mapping: ApprovalChoice[];
  contribution: { version: 1; items: [{ kind: "round"; now: string; questions: [ApprovalQuestion] }] };
};
export type ApprovalPlan = { version: 1; rounds: ApprovalRound[] };

function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error(`${at} must be nonempty text without control characters`);
  return value;
}

function oneLine(value: unknown, at: string): string {
  const line = text(value, at);
  if (/[\r\n\u0085\u2028\u2029]/.test(line)) throw new Error(`${at} must be one line`);
  return line.trim();
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
    if (checkout.outcome === "vanished" || checkout.outcome === "replaced" || checkout.outcome === "inspection failed") {
      throw new Error(`${at}.checkout has a protected ${checkout.outcome} outcome`);
    }
    if (checkout.verdict !== "unused" || checkout.state !== "dirty" || checkout.automatic !== false) throw new Error(`${at}.checkout must be unused, dirty, and nonautomatic`);
    empty(checkout.owners, `${at}.checkout.owners`);
    empty(checkout.reasons, `${at}.checkout.reasons`);
    empty(checkout.unique_history, `${at}.checkout.unique_history`);
    const fingerprint = text(checkout.fingerprint, `${at}.checkout.fingerprint`);
    if (fingerprint.length !== 64 || !/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error(`${at}.checkout.fingerprint must be a lowercase SHA-256 fingerprint`);
    const namedTarget = `${at} (${path})`;
    const repository = oneLine(target.repository, `${namedTarget}.repository`);
    const verdict = oneLine(target.verdict, `${namedTarget}.verdict`);
    if (!Array.isArray(target.contents) || target.contents.length === 0) throw new Error(`${at}.contents must describe the remaining contents`);
    for (const [n, value] of target.contents.entries()) {
      const content = object(value, `${at}.contents[${n}]`);
      if (!CATEGORIES.some((category) => category === content.category)) throw new Error(`${at}.contents[${n}].category must be ${CATEGORIES.join(", ")}`);
      text(content.detail, `${at}.contents[${n}].detail`);
    }
    const rawIntegration = object(target.integration, `${at}.integration`);
    if (("evidence" in rawIntegration) === ("gap" in rawIntegration)) throw new Error(`${at}.integration requires exactly one evidence or gap`);
    if ("evidence" in rawIntegration) text(rawIntegration.evidence, `${at}.integration.evidence`);
    else text(rawIntegration.gap, `${at}.integration.gap`);
    const recommendation = object(target.recommendation, `${at}.recommendation`);
    const action = recommendation.action;
    if (action !== "keep" && action !== "remove") throw new Error(`${at}.recommendation.action must be keep or remove`);
    text(target.classification, `${at}.classification`);
    text(target.risk, `${at}.risk`);
    text(recommendation.reason, `${at}.recommendation.reason`);
    return { path, fingerprint, repository, verdict, action };
  });
}

function plan(targets: InspectedTarget[]): ApprovalPlan {
  const rounds: ApprovalRound[] = [];
  for (const action of ["remove", "keep"] as const) {
    const group = targets.filter((target) => target.action === action);
    const groupName = `Agent says ${action}`;
    for (let offset = 0; offset < group.length; offset += 26) {
      const number = rounds.length + 1;
      const mapping = group.slice(offset, offset + 26).map(({ path, fingerprint, repository, verdict }, i) => {
        const label = [shortPath(path), displayField(repository), displayField(verdict), groupName].join(FIELD_SEPARATOR);
        return { letter: String.fromCharCode(65 + i), label, path, fingerprint, recommendation: action };
      });
      const question: ApprovalQuestion = {
        ref: `cleanup-approval-${number}`,
        title: `Which checkouts may be removed from "${groupName}" (batch ${number})?`,
        description: "Select only the checkouts you want removed. Unselected checkouts stay. Recommendations do not authorize removal. Removal still requires the safety checks to pass.",
        brief: {
          unblocks: "Run the final safety checks and remove only the checkouts you select.",
          undo: "Removal discards uncommitted changes and cannot be undone.",
          no_recommendation: "Each checkout has its own recommendation. Nothing is selected because removal needs your explicit choice.",
        },
        needs: [{ need: "Compare the verdicts and recommendations to decide which checkouts to remove.", kind: "prose" }],
        multi: true,
        options: mapping.map(({ label }) => ({
          label,
          does: "Authorize removal of this checkout.",
          gains: ["Frees the checkout directory."],
          costs: ["Discards local changes in that copy."],
        })),
      };
      rounds.push({
        contribution: { version: 1, items: [{
          kind: "round",
          now: `Inspection found ${mapping.length} unused ${mapping.length === 1 ? "checkout" : "checkouts"} with uncommitted changes in this "${groupName}" batch.`,
          questions: [question],
        }] },
        question_ref: question.ref,
        mapping,
      });
    }
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
