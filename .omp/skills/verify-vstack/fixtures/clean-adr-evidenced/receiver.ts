import { gunzipSync } from "node:zlib";

const wire = await Bun.stdin.bytes();
const entries: unknown = JSON.parse(gunzipSync(wire).toString("utf8"));
if (!Array.isArray(entries)) throw new Error("Receiver needs an entry array");
console.log(JSON.stringify(entries));
