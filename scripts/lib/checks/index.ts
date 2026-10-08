// Every check-register check, in report order. To add a failure class, add it to an existing check's
// `classes` and emit it, or write a new module exporting a `Check` and append it here.

import { artifactChecks } from "./artifacts.ts";
import { houseStyleChecks } from "./house-style.ts";
import { migrationHouseStyleChecks } from "./migration-house-style.ts";
import { pageChecks } from "./pages.ts";
import { rowChecks } from "./rows.ts";
import type { Check } from "./types.ts";
import { upstreamChecks } from "./upstream.ts";
import { versionChecks } from "./version.ts";

export const checks: readonly Check[] = [rowChecks, artifactChecks, upstreamChecks, houseStyleChecks, migrationHouseStyleChecks, pageChecks, versionChecks];

export const failureClasses: readonly string[] = checks.flatMap((c) => c.classes);
