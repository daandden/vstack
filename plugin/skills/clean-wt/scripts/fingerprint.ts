import { createHash } from "node:crypto";

export type InspectionKind = "discovery" | "targeted";

const VERSION = "v1";
export type Fingerprint<Kind extends InspectionKind = InspectionKind> = `${typeof VERSION}:${Kind}:${string}`;
const FORMAT = new RegExp(`^${VERSION}:(discovery|targeted):[0-9a-f]{64}$`);

export function fingerprintKind(value: unknown): InspectionKind | undefined {
  if (typeof value !== "string") return undefined;
  const match = FORMAT.exec(value);
  if (match?.[0] === value) return match[1] === "discovery" ? "discovery" : "targeted";
}

export function makeFingerprint<Kind extends InspectionKind>(kind: Kind, evidence: unknown): Fingerprint<Kind> {
  const prefix = `${VERSION}:${kind}:` as const;
  const digest = createHash("sha256").update(prefix).update(JSON.stringify(evidence)).digest("hex");
  return `${prefix}${digest}`;
}

export function isTargetedFingerprint(value: unknown): value is Fingerprint<"targeted"> {
  return fingerprintKind(value) === "targeted";
}
