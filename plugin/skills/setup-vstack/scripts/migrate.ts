// Public CLI for setup-vstack's machine Migration. Checking and planning never change machine state.
import { readFileSync } from "node:fs";
import { applyMachine, machinePlan, migrationHome, type Plan } from "./migration.ts";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const roots: string[] = [], skip: string[] = [];
  let planPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i];
    if (!value) throw new Error(`${flag} needs a value`);
    if (flag === "--scan-root") roots.push(value);
    else if (flag === "--skip") skip.push(value);
    else if (flag === "--plan") planPath = value;
    else throw new Error(`unknown option ${flag}`);
  }
  if (cmd === "cancel") {
    console.log(JSON.stringify({ complete: false, applied: [], message: "Cancelled the whole machine Migration; no machine changes." })); return 0;
  }
  if (cmd !== "plan" && cmd !== "apply") throw new Error("Usage: migrate.ts plan [--scan-root <dir>...] | apply --plan <approved JSON file> [--skip <id>...]");
  const plan = planPath ? JSON.parse(readFileSync(planPath, "utf8")) as Plan : machinePlan(migrationHome(), roots.length ? roots : [migrationHome()]);
  if (cmd === "plan") { console.log(JSON.stringify(plan, null, 2)); return plan.scan_errors.length ? 1 : 0; }
  const report = await applyMachine(plan, skip);
  console.log(JSON.stringify(report, null, 2)); return report.complete ? 0 : 1;
}
try { process.exit(await main()); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); }
