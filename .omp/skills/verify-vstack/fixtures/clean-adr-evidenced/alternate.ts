import { argv } from "node:process";

const mode = argv[2];
const input = await Bun.stdin.bytes();
if (mode === "encode") await Bun.write(Bun.stdout, Bun.zstdCompressSync(input));
else if (mode === "decode") await Bun.write(Bun.stdout, Bun.zstdDecompressSync(input));
else throw new Error("Usage: alternate.ts encode|decode");
