import type { Contract } from "./contracts.ts";

type Description = Partial<Omit<Contract, "fields" | "items" | "variants" | "select" | "check" | "purpose">> & {
  fields?: Record<string, Description>;
  variants?: Record<string, Description>;
  items?: Description;
  $ref?: string;
  [key: string]: unknown;
};

function describe(contract: Contract, path = "$", ancestors = new Map<Contract, string>()): Description {
  const previous = ancestors.get(contract);
  if (previous) return { $ref: previous };
  const next = new Map(ancestors).set(contract, path);
  const result: Description = {};
  for (const [key, value] of Object.entries(contract)) {
    if (typeof value === "function" || key === "purpose") continue;
    if (key === "fields" || key === "variants") {
      result[key] = Object.fromEntries(Object.entries(value as Record<string, Contract>).map(([name, child]) => [name, describe(child, `${path}.${key}.${name}`, next)]));
    } else if (key === "items") {
      result.items = describe(value as Contract, `${path}.items`, next);
    } else result[key] = value;
  }
  return result;
}

function compact(contract: Description): string {
  const lines: string[] = [];
  const typeOf = (field: Description): string => {
    if (field.$ref) return `ref(${field.$ref})`;
    if (field.type === "literal") return [...new Set(field.values!.map(value => typeof value))].join("|");
    if (field.items) return `${field.type}<${typeOf(field.items)}>`;
    return field.type!;
  };
  const visit = (field: Description, path: string, required?: boolean): void => {
    if (required !== undefined) {
      const details = [`${path} type=${typeOf(field)} required=${required}`];
      if (field.values) details.push(`enum=${JSON.stringify(field.values)}`);
      for (const key of ["min", "max", "integer", "expected", "discriminator", "oneOf", "selection"]) {
        if (field[key] !== undefined) details.push(`${key}=${JSON.stringify(field[key])}`);
      }
      lines.push(details.join(" "));
    }
    if (required === undefined && field.selection) lines.push(`${path} selection=${JSON.stringify(field.selection)}`);
    for (const [name, child] of Object.entries(field.fields ?? {})) {
      visit({ ...(child as Description), ...(field.oneOf?.includes(name) ? { oneOf: field.oneOf } : {}) }, `${path}.${name}`, field.required?.includes(name) ?? false);
    }
    if (field.items) visit(field.items, `${path}${field.type === "record" ? "[*]" : "[]"}`);
    for (const [name, variant] of Object.entries(field.variants ?? {})) visit(variant as Description, `${path}<${name}>`);
  };
  visit(contract, "$");
  return lines.join("\n");
}

export function describeResult(shape: string, contract: Contract, short: boolean): string {
  const described = describe(contract);
  return short ? compact(described) : JSON.stringify({ shape, purpose: contract.purpose, contract: described });
}

export function describeContribution(kind: string, contract: Contract, short: boolean): string {
  const described = describe(contract);
  return short ? compact(described) : JSON.stringify({ kind, contract: described });
}
