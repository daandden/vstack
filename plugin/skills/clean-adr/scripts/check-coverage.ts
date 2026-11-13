#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type ObjectValue = Record<string, unknown>;
type OwnedRow = { id: string; kind: "archived" | "new"; source: string; affectedAdrs: string[]; group: string };
const object = (value: unknown): ObjectValue => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
	return value as ObjectValue;
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const load = (path: string): ObjectValue => object(JSON.parse(readFileSync(path, "utf8")));
function ownership(value: unknown, group: string): OwnedRow {
	const row = object(value);
	if (!text(row.id) || !text(row.source) || !strings(row.affectedAdrs)) throw new Error("Each owned row needs id, source, and affectedAdrs");
	if (row.kind !== "archived" && row.kind !== "new") throw new Error("Each owned row needs kind archived or new");
	return { id: row.id, kind: row.kind, source: row.source, affectedAdrs: row.affectedAdrs, group };
}

try {
	const [file, previousFile, ...extra] = process.argv.slice(2);
	if (!file || extra.length) throw new Error("Usage: check-coverage.ts <manifest.json> [previous-outcome.json]");
	const manifest = load(file);
	const check = manifest.check;
	if (check !== 1 && check !== 2 && check !== 3) throw new Error("check must be 1, 2, or 3; a fourth check is not allowed");
	if (!Array.isArray(manifest.groups) || !manifest.groups.length) throw new Error("groups must contain the whole check's owning groups");
	const owned = new Map<string, OwnedRow>();
	const previouslyOpen = new Set<string>();
	if (check > 1) {
		if (!previousFile) throw new Error("Checks 2 and 3 require the previous outcome to preserve coverage rows");
		const previous = load(previousFile);
		if (previous.completedChecks !== check - 1 || !Array.isArray(previous.coverage) || !Array.isArray(previous.openRewriteRows)) throw new Error("Previous outcome must be the completed preceding check");
		for (const value of previous.openRewriteRows) {
			const row = object(value);
			if (!text(row.id)) throw new Error("Previous open row needs its stable id");
			previouslyOpen.add(row.id);
		}
		for (const value of previous.coverage) {
			const row = object(value);
			if (!text(row.group)) throw new Error("Previous coverage row needs its owning group");
			const item = ownership(row, row.group);
			owned.set(item.id, item);
		}
	} else if (previousFile) throw new Error("Check 1 starts a new run and takes no previous outcome");

	const reports = new Map<string, Map<string, ObjectValue>>();
	const uncheckedGroups: string[] = [];
	for (const value of manifest.groups) {
		const group = object(value);
		if (!text(group.id) || !Array.isArray(group.rows) || !text(group.report)) throw new Error("Each group needs id, rows, and a raw report path");
		if (reports.has(group.id) || uncheckedGroups.includes(group.id)) throw new Error(`Duplicate group ${group.id}`);
		const ids = new Set<string>();
		for (const value of group.rows) {
			const row = ownership(value, group.id);
			if (ids.has(row.id) || (owned.has(row.id) && owned.get(row.id)!.group !== group.id)) throw new Error(`Duplicate or reassigned row ${row.id}`);
			if (owned.has(row.id) && owned.get(row.id)!.kind !== row.kind) throw new Error(`Changed kind for row ${row.id}`);
			ids.add(row.id);
			owned.set(row.id, row);
		}
		let report: ObjectValue;
		try { report = load(resolve(dirname(file), group.report)); }
		catch { uncheckedGroups.push(group.id); continue; }
		if (!Array.isArray(report.rows)) { uncheckedGroups.push(group.id); continue; }
		const rows = new Map<string, ObjectValue>();
		for (const value of report.rows) {
			const row = object(value);
			if (!text(row.id) || rows.has(row.id)) throw new Error(`Report for ${group.id} needs unique row ids`);
			if (owned.get(row.id)?.group !== group.id) throw new Error(`Add discovered row ${row.id} to group ${group.id} in the manifest`);
			rows.set(row.id, row);
		}
		reports.set(group.id, rows);
	}
	if (!owned.size) throw new Error("Coverage must include every archived provision and new statement");
	for (const row of owned.values()) {
		if (!reports.has(row.group) && !uncheckedGroups.includes(row.group)) uncheckedGroups.push(row.group);
	}
	const openRewriteRows = [];
	for (const row of owned.values()) {
		const result = reports.get(row.group)?.get(row.id);
		const problems: string[] = [];
		if (!result) problems.push("Missing coverage from the current check");
		else {
			if (result.disposition === "restated") {
				if (!text(result.replacement)) problems.push("Missing replacement provision location");
			} else if (result.disposition === "dropped") {
				if (row.kind !== "archived") problems.push("Only archived provisions can be dropped with the original judge's reason");
				if (!text(result.droppedReason)) problems.push("Missing evidence-backed dropped reason");
			} else if (result.disposition === "removed") {
				if (row.kind !== "new") problems.push("Only new statements can be removed; archived provisions need restated or dropped");
				if (!strings(result.removedFrom) || !result.removedFrom.length) problems.push("Removed statement needs its former new ADR paths in removedFrom");
			} else problems.push("Missing provision disposition or archived source");
			const evidence = result.evidence && typeof result.evidence === "object" && !Array.isArray(result.evidence) ? object(result.evidence) : {};
			if (evidence.status !== "verified") problems.push(`Independent evidence is ${text(evidence.status) ? evidence.status : "unknown"}: ${text(evidence.detail) ? evidence.detail : "no evidence supplied"}`);
			else if (!strings(evidence.references) || !evidence.references.length || !text(evidence.detail)) problems.push("Verified evidence needs independent references and a finding");
			if (result.disposition === "removed" && strings(result.removedFrom) && result.removedFrom.length && evidence.status === "verified" && strings(evidence.references)) {
				for (const path of result.removedFrom) {
					if (!evidence.references.some((reference) => reference === path || reference.startsWith(`${path}:`) || reference.startsWith(`${path}#`))) problems.push(`Removed statement needs current ADR evidence for ${path}`);
				}
			}
			if (text(result.problem)) problems.push(result.problem);
			else if (result.problem !== null) problems.push("Missing explicit problem assessment");
			if (!problems.length && previouslyOpen.has(row.id) && !text(result.resolution)) problems.push("Missing resolution of the previous open row");
		}
		if (problems.length) openRewriteRows.push({ ...row, problems });
	}
	console.log(JSON.stringify({
		completedChecks: uncheckedGroups.length ? check - 1 : check,
		uncheckedGroups,
		coverage: [...owned.values()],
		openRewriteRows,
		action: uncheckedGroups.length ? "incomplete" : !openRewriteRows.length ? "finish" : check === 3 ? "report-open" : "recheck",
	}, null, 2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
}
