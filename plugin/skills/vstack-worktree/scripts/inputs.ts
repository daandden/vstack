import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export function readInputs(path: string | undefined): string[] {
  if (!path || !isAbsolute(path)) throw new Error("--inputs requires an absolute declaration file containing a JSON array of relative runtime input paths.");
  const inputs: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(inputs) || inputs.some(input => typeof input !== "string" || isAbsolute(input) ||
      input.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git"))) {
    throw new Error("--inputs must contain relative runtime input paths without empty, dot, parent, or .git components.");
  }
  return [...new Set(inputs as string[])].sort();
}

export function declaredInput(path: string, inputs: string[]): boolean {
  return inputs.some(input => path === input || path.startsWith(input + "/"));
}

export function refuseCommittedOverlap(tracked: string[], inputs: string[]): void {
  for (const input of inputs) {
    if (tracked.some(name => declaredInput(name, [input]) || declaredInput(input, [name]))) {
      throw new Error(`Runtime input ${JSON.stringify(input)} overlaps committed source. Declare only untracked dependency or runtime inputs.`);
    }
  }
}
