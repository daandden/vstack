const spawnSync = Bun.spawnSync;

Bun.spawnSync = ((...args: Parameters<typeof spawnSync>) => {
  const result = spawnSync(...args);
  if (args[0][0] !== "git") return result;
  return { ...result, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
}) as typeof spawnSync;
