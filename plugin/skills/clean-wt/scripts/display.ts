import { homedir } from "node:os";
import { resolve, sep } from "node:path";

export const FIELD_SEPARATOR = " · ";

const home = resolve(homedir());
const homePrefix = home.endsWith(sep) ? home : home + sep;

export function displayField(value: string): string {
  return value.replace(/[\\\x00-\x1f\x7f\u0085·\u2028\u2029]/g, (char) =>
    char === "\\" ? "\\\\" : `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function shortPath(path: string): string {
  const short = path === home ? "~" : path.startsWith(homePrefix) ? `~${sep}${path.slice(homePrefix.length)}` : path;
  return displayField(short);
}
