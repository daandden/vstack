import { publish, resume, PublicationError } from "./publisher.ts";

try {
  const [action, ...args] = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    if (!["--input", "--record"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new PublicationError("usage", "Expected publish --input approved.json --record publication.json, or resume --record publication.json");
    options.set(args[index], args[index + 1]);
  }
  const record = options.get("--record");
  if (!record || action !== "publish" && action !== "resume" || action === "publish" && !options.get("--input") || action === "resume" && options.has("--input")) throw new PublicationError("usage", "Expected publish --input approved.json --record publication.json, or resume --record publication.json");
  const result = action === "publish" ? await publish(await Bun.file(options.get("--input")!).json(), record) : await resume(record);
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "complete" ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ category: error instanceof PublicationError ? error.category : "invalid-input", message: String(error) }));
  process.exitCode = 1;
}
