export const SUMMARY_RECORDS_VERSION = 2;

export function requireSummaryRecordsVersion(version: unknown): void {
  if (version === SUMMARY_RECORDS_VERSION) return;
  const reported = typeof version === "number" ? `version ${version} is unsupported` : "version is missing or invalid";
  throw new Error(`summary records ${reported}; expected version ${SUMMARY_RECORDS_VERSION}`);
}
