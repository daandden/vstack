import { isDeepStrictEqual } from "node:util";
import { KnownFailure } from "./trackers.ts";

export type Schema = boolean | {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: Schema;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  description?: string;
};
export type Action = "owner" | "search" | "read" | "create" | "parent" | "block" | "activate";
export type ActionBinding = { tool: string; arguments: Record<string, unknown>; result?: string; replace?: boolean; pagination?: { offset: string; limit: string; total: string } };
export type CollectionPath = string | { path: string; empty: true };
export type IssueBinding = Record<"id" | "title" | "body" | "author" | "createdAt" | "parent" | "project" | "issueType", string> & {
  labels: CollectionPath;
  readiness: CollectionPath;
  blockedBy: string | { path: string; empty?: true; type: string; sides: { inwardIssue: string; outwardIssue: string } };
};
export type Binding = { actions: Partial<Record<Action, ActionBinding>>; issue: IssueBinding };
export const actions: Action[] = ["owner", "search", "read", "create", "parent", "block", "activate"];
const fields = ["id", "title", "body", "labels", "readiness", "author", "createdAt", "parent", "project", "issueType", "blockedBy"];
const roles = new Set(["issue", "parent", "blocker", "dependent", "title", "body", "labels", "readiness", "readinessValues", "idempotencyKey"]);
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function gap(server: string, message: string): never { throw new KnownFailure(`MCP server ${server}: ${message}`, "capability-gap"); }
function keys(server: string, value: unknown, allowed: string[], location: string): asserts value is Record<string, unknown> {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) gap(server, `unsupported ${location} binding keys`);
}
export function pathValid(path: unknown, root = false): path is string {
  return typeof path === "string" && (root && path === "" || /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/.test(path) && path.split(".").every(key => !["__proto__", "prototype", "constructor"].includes(key)));
}
export function at(value: unknown, path: string): unknown {
  if (path === "") return value;
  for (const part of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
export function bindingFor(server: string, value: unknown): Binding {
  keys(server, value, ["actions", "issue"], "MCP");
  keys(server, value.actions, actions, "action");
  keys(server, value.issue, fields, "issue");
  for (const field of fields.filter(field => !["labels", "readiness", "blockedBy"].includes(field))) if (!pathValid(value.issue[field])) gap(server, `invalid issue.${field} result path`);
  for (const field of ["labels", "readiness"]) {
    const selector = value.issue[field];
    if (typeof selector === "string") {
      if (!pathValid(selector)) gap(server, `invalid issue.${field} result path`);
    } else {
      keys(server, selector, ["path", "empty"], field);
      if (!pathValid(selector.path) || selector.empty !== true) gap(server, `invalid issue.${field} empty collection mapping`);
    }
  }
  const links = value.issue.blockedBy;
  if (typeof links === "string") {
    if (!pathValid(links)) gap(server, "invalid blockedBy result path");
  } else {
    keys(server, links, ["path", "empty", "type", "sides"], "blockedBy");
    if (links.empty !== undefined && links.empty !== true) gap(server, "invalid blockedBy empty declaration");
    keys(server, links.sides, ["inwardIssue", "outwardIssue"], "blockedBy sides");
    for (const path of [links.path, links.type, links.sides.inwardIssue, links.sides.outwardIssue]) if (!pathValid(path)) gap(server, "invalid blockedBy result path");
  }
  for (const name of actions) {
    const binding = value.actions[name];
    if (binding === undefined) {
      if (name !== "owner" && name !== "parent") gap(server, `missing ${name} action binding`);
      continue;
    }
    keys(server, binding, ["tool", "arguments", "result", "replace", "pagination"], name);
    if (typeof binding.tool !== "string" || !binding.tool.trim() || !plain(binding.arguments)) gap(server, `invalid ${name} tool or argument template`);
    if (binding.result !== undefined && (!pathValid(binding.result, true) || !["owner", "search", "create"].includes(name))) gap(server, `invalid ${name} result path`);
    if (binding.replace !== undefined && (name !== "activate" || typeof binding.replace !== "boolean")) gap(server, `invalid ${name} replace declaration`);
    if (binding.pagination !== undefined) {
      if (name !== "search") gap(server, `invalid ${name} pagination declaration`);
      keys(server, binding.pagination, ["offset", "limit", "total"], "search pagination");
      const { offset, limit, total } = binding.pagination;
      if (!pathValid(offset) || offset.includes(".") || !pathValid(limit) || limit.includes(".") || offset === limit || !pathValid(total)) gap(server, "invalid search pagination paths");
      if (binding.arguments[offset] !== 0 || !Number.isSafeInteger(binding.arguments[limit]) || Number(binding.arguments[limit]) <= 0) gap(server, "search pagination requires an initial zero offset and a positive integer limit");
    }
  }
  return value as unknown as Binding;
}
export function placeholders(server: string, template: unknown): Set<string> {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
        const role = match[1];
        if (!roles.has(role) && !(role.startsWith("facts.") && pathValid(role.slice(6)))) gap(server, `unknown argument placeholder {${role}}`);
        found.add(role);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (plain(value)) Object.values(value).forEach(visit);
  };
  visit(template);
  return found;
}
export function render(server: string, template: unknown, values: Record<string, unknown>, facts: Record<string, unknown>, action: Action): unknown {
  if (typeof template === "string") {
    const get = (role: string) => {
      const value = role.startsWith("facts.") ? at(facts, role.slice(6)) : values[role];
      if (value === undefined && !(action === "create" && role === "parent" && template === "{parent}")) gap(server, `${action} argument placeholder {${role}} has no value`);
      return value;
    };
    const exact = template.match(/^\{([^{}]+)\}$/);
    if (exact) return get(exact[1]);
    return template.replace(/\{([^{}]+)\}/g, (_, role: string) => JSON.stringify(get(role)));
  }
  if (Array.isArray(template)) return template.map(value => render(server, value, values, facts, action));
  if (plain(template)) return Object.fromEntries(Object.entries(template).flatMap(([key, value]) => {
    const rendered = render(server, value, values, facts, action);
    return rendered === undefined ? [] : [[key, rendered]];
  }));
  return template;
}
function typed(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return plain(value);
    case "array": return Array.isArray(value);
    case "null": return value === null;
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    default: return false;
  }
}
function problem(value: unknown, schema: Schema, path: string, deferred: Set<string> = new Set()): string | undefined {
  if (schema === false) return `${path} is not allowed`;
  if (schema === true) return;
  if (Object.hasOwn(schema, "$ref")) return `${path} uses an unsupported schema reference`;
  if (schema.anyOf && !schema.anyOf.some(branch => !problem(value, branch, path, deferred))) return `${path} matches no anyOf schema`;
  if (schema.oneOf && schema.oneOf.filter(branch => !problem(value, branch, path, deferred)).length !== 1) return `${path} must match one oneOf schema`;
  if (schema.allOf) for (const branch of schema.allOf) { const error = problem(value, branch, path, deferred); if (error) return error; }
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type => typed(value, type))) return `${path} has incompatible type`;
  const equal = (other: unknown) => isDeepStrictEqual(value, other);
  const pending = [...deferred].some(prefix => path === prefix || path.startsWith(`${prefix}.`));
  if (!pending && (schema.enum && !schema.enum.some(equal) || Object.hasOwn(schema, "const") && !equal(schema.const))) return `${path} has an unapproved enum or const value`;
  if (!pending && typeof value === "string" && (schema.minLength !== undefined && value.length < schema.minLength || schema.maxLength !== undefined && value.length > schema.maxLength || schema.pattern !== undefined && !new RegExp(schema.pattern).test(value))) return `${path} does not match string constraints`;
  if (!pending && typeof value === "number" && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) return `${path} is outside numeric bounds`;
  if (Array.isArray(value)) {
    if (!pending && (schema.minItems !== undefined && value.length < schema.minItems || schema.maxItems !== undefined && value.length > schema.maxItems)) return `${path} has incompatible array length`;
    if (schema.items !== undefined) for (let index = 0; index < value.length; index++) { const error = problem(value[index], schema.items, `${path}.${index}`, deferred); if (error) return error; }
  }
  if (plain(value)) {
    for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) return `${path}.${name} is required`;
    for (const [name, entry] of Object.entries(value)) {
      const property = schema.properties?.[name] ?? schema.additionalProperties;
      if (property !== undefined) { const error = problem(entry, property, `${path}.${name}`, deferred); if (error) return error; }
    }
  }
}
function encode(value: unknown, schema: Schema): unknown {
  if (typeof schema === "boolean") return value;
  for (const branch of schema.anyOf ?? schema.oneOf ?? []) {
    const candidate = encode(value, branch);
    if (!problem(candidate, schema, "argument")) return candidate;
  }
  if (schema.type === "string" && (plain(value) || Array.isArray(value))) return JSON.stringify(value);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, encode(entry, schema.properties?.[name] ?? schema.additionalProperties ?? true)]));
  if (Array.isArray(value) && schema.items !== undefined) return value.map(entry => encode(entry, schema.items!));
  return value;
}
export function argumentsFor(server: string, action: Action, template: Record<string, unknown>, schema: Exclude<Schema, boolean>, values: Record<string, unknown>, facts: Record<string, unknown>, deferredRoles: Set<string> = new Set()): Record<string, unknown> {
  const rendered = render(server, template, values, facts, action) as Record<string, unknown>;
  for (const name of Object.keys(rendered)) if (!Object.hasOwn(schema.properties ?? {}, name)) gap(server, `${action} binds unknown parameter ${name}`);
  try {
    const deferred = new Set(Object.entries(template).filter(([, value]) => [...placeholders(server, value)].some(role => deferredRoles.has(role))).map(([name]) => `${action}.${name}`));
    const args = encode(rendered, schema) as Record<string, unknown>;
    const error = problem(args, schema, action, deferred);
    if (error) gap(server, error);
    return args;
  } catch (error) {
    if (error instanceof KnownFailure) throw error;
    return gap(server, `${action} has an invalid live parameter schema: ${String(error)}`);
  }
}
