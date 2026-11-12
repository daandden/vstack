import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The path with symbolic links resolved, or its absolute form when it does not exist. */
export const canonical = (path: string) => {
  try { return realpathSync(path); } catch { return resolve(path); }
};
/** Whether `home` is the user's normal home, compared through symbolic links. */
export const isNormalHome = (home: string) => canonical(home) === canonical(homedir());
/** The skills directory of the vstack plugin installed in omp under `home`. */
export const installedSkills = (home: string) => join(home, ".omp", "plugins", "node_modules", "vstack", "skills");
