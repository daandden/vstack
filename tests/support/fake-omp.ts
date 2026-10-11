import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.FAKE_OMP_LOG) appendFileSync(process.env.FAKE_OMP_LOG, `${JSON.stringify(args)}\n`);
console.error(`maintain must not call omp: ${args.join(" ")}`);
process.exit(1);
