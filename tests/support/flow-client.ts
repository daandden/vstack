import { join } from "node:path";
import type { QuestionView, View } from "../../plugin/skills/flow-page/scripts/model.ts";
import { ENV } from "./fixture.ts";

const script = join(import.meta.dir, "../../plugin/skills/flow-page/scripts/flow-page.ts");
export type FlowContent = Omit<View, "questions"> & { questions: QuestionView[] };

export function flowContent(home: string, cwd: string, flow: string): FlowContent {
  const result = Bun.spawnSync([process.execPath, import.meta.path, home, cwd, flow], { env: ENV, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}

if (import.meta.main) {
  const [home, cwd, flow] = Bun.argv.slice(2) as [string, string, string];
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  const cli = (args: string[]) => {
    const result = Bun.spawnSync([process.execPath, script, ...args, "--home", home], {
      cwd, env: { ...ENV, HOME: join(home, "default-home"), VSTACK_FLOW_PORT: String(port) }, stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return JSON.parse(result.stdout.toString());
  };
  try {
    const shown = cli(["show", "--flow", flow]);
    if (shown.live.state !== "serving") throw new Error(JSON.stringify(shown.live));
    const response = await fetch(new URL("content", shown.live.url));
    if (!response.ok) throw new Error(`Flow content returned ${response.status}`);
    process.stdout.write(await response.text());
  } finally {
    cli(["host", "stop"]);
  }
}
