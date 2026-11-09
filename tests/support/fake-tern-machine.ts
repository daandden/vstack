import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.env.HOME!, ".config", "tern", "plugins");
const [command, verb, arg] = process.argv.slice(2);
if (command !== "plugin") process.exit(2);
if (verb === "dir") {
  console.log(JSON.stringify({ dir }));
} else if (verb === "list") {
  const links = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".path")).sort() : [];
  console.log(JSON.stringify({ plugins: links.map(name => ({ id: name.slice(0, -5), path: readFileSync(join(dir, name), "utf8").trim() })) }));
} else if (verb === "link" || verb === "unlink") {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "writes.jsonl"), `${JSON.stringify([verb, arg])}\n`);
  if (verb === "link") {
    const id = /^id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(arg!, "plugin.toml"), "utf8"))?.[1];
    if (!id || existsSync(join(dir, `${id}.path`))) process.exit(1);
    writeFileSync(join(dir, `${id}.path`), `${arg}\n`);
  } else {
    rmSync(join(dir, `${arg}.path`));
  }
} else {
  process.exit(2);
}
