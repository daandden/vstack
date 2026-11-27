import { chmodSync, copyFileSync, lstatSync, mkdirSync, readdirSync, readlinkSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type CopyOptions = {
  dereference?: boolean;
  filter?: (source: string, destination: string) => boolean;
};

// Bun's recursive cpSync can treat ovnfs directories as files. Stat each entry before copying it.
export function copyTree(source: string, destination: string, options: CopyOptions = {}): void {
  if (options.filter && !options.filter(source, destination)) return;
  const entry = options.dereference ? statSync(source) : lstatSync(source);
  const directory = entry.isDirectory();
  const file = entry.isFile();
  if (!directory && !file && !entry.isSymbolicLink()) {
    throw new Error(`Cannot copy unsupported fixture entry: ${source}`);
  }
  const previous = lstatSync(destination, { throwIfNoEntry: false });
  const existingDirectory = previous?.isDirectory();
  if (previous && !existingDirectory) unlinkSync(destination);
  if (directory) {
    if (!existingDirectory) mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source)) copyTree(join(source, name), join(destination, name), options);
    if (!existingDirectory) chmodSync(destination, entry.mode & 0o7777);
  } else {
    mkdirSync(dirname(destination), { recursive: true });
    if (file) {
      copyFileSync(source, destination);
      chmodSync(destination, entry.mode & 0o7777);
    } else {
      const target = resolve(dirname(source), readlinkSync(source));
      symlinkSync(target, destination);
    }
  }
}
