import { homedir } from "node:os";
import { resolve, sep } from "node:path";

export const FIELD_SEPARATOR = " · ";

const home = resolve(homedir());
const homePrefix = home.endsWith(sep) ? home : home + sep;

export function displayField(value: string): string {
  return value.replace(/[\\·\p{Cc}\p{Cf}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}[\p{Z}--\x20]]/gv, (char) => {
    if (char === "\\") return "\\\\";
    const hex = char.codePointAt(0)!.toString(16);
    return char.length === 1 ? `\\u${hex.padStart(4, "0")}` : `\\u{${hex}}`;
  });
}

export function shortPath(path: string): string {
  const short = path === home ? "~" : path.startsWith(homePrefix) ? `~${sep}${path.slice(homePrefix.length)}` : path;
  return displayField(short);
}
