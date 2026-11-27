import { expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { copyTree } from "./support/copy-tree.ts";

test.skipIf(process.platform === "win32")("a fixture copy preserves file and directory modes and keeps symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-copy-tree-"));
  const source = join(root, "source"), destination = join(root, "parent", "destination");
  try {
    mkdirSync(join(source, ".nested"), { recursive: true });
    chmodSync(join(source, ".nested"), 0o750);
    const script = join(source, ".nested", "script");
    writeFileSync(script, "#!/bin/sh\n");
    chmodSync(script, 0o751);
    symlinkSync(".nested/script", join(source, "link"));
    copyTree(source, destination, { dereference: false });

    expect(readFileSync(join(destination, ".nested", "script"), "utf8")).toBe("#!/bin/sh\n");
    expect(lstatSync(join(destination, ".nested", "script")).mode & 0o777).toBe(0o751);
    expect(lstatSync(join(destination, ".nested")).mode & 0o777).toBe(0o750);
    expect(readlinkSync(join(destination, "link"))).toBe(script);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("a filtered fixture copy follows selected directory links and skips excluded trees", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-copy-tree-"));
  const source = join(root, "source"), destination = join(root, "destination"), target = join(root, "target");
  try {
    mkdirSync(join(source, "skip"), { recursive: true });
    mkdirSync(target);
    writeFileSync(join(target, "entry"), "fixture");
    symlinkSync(target, join(source, "dir-link"));
    symlinkSync(join(root, "missing"), join(source, "skip", "dangling-link"));

    copyTree(source, destination, { dereference: true, filter: path => basename(path) !== "skip" });

    expect(lstatSync(join(destination, "dir-link")).isDirectory()).toBe(true);
    expect(readFileSync(join(destination, "dir-link", "entry"), "utf8")).toBe("fixture");
    expect(existsSync(join(destination, "skip"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("a fixture file replaces a destination symlink without changing its target", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-copy-tree-"));
  const source = join(root, "source");
  const destination = join(root, "clone", "destination");
  const sentinel = join(root, "outside-clone");
  try {
    writeFileSync(source, "fixture");
    chmodSync(source, 0o751);
    writeFileSync(sentinel, "sentinel");
    chmodSync(sentinel, 0o600);
    mkdirSync(join(root, "clone"));
    symlinkSync(sentinel, destination);

    copyTree(source, destination);

    expect({
      destinationIsFile: lstatSync(destination).isFile(),
      destinationBytes: readFileSync(destination, "utf8"),
      destinationMode: lstatSync(destination).mode & 0o777,
      sentinelBytes: readFileSync(sentinel, "utf8"),
      sentinelMode: lstatSync(sentinel).mode & 0o777,
    }).toEqual({
      destinationIsFile: true,
      destinationBytes: "fixture",
      destinationMode: 0o751,
      sentinelBytes: "sentinel",
      sentinelMode: 0o600,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("a fixture directory replaces a destination symlink without changing its target", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-copy-tree-"));
  const source = join(root, "source");
  const clone = join(root, "clone");
  const destination = join(clone, "nested");
  const outside = join(root, "outside-clone");
  const sentinel = join(outside, "sentinel");
  try {
    mkdirSync(join(source, "nested"), { recursive: true });
    chmodSync(join(source, "nested"), 0o751);
    writeFileSync(join(source, "nested", "entry"), "fixture");
    mkdirSync(clone);
    mkdirSync(outside);
    chmodSync(outside, 0o750);
    writeFileSync(sentinel, "sentinel");
    chmodSync(sentinel, 0o600);
    symlinkSync(outside, destination);

    copyTree(source, clone);

    expect({
      destinationIsDirectory: lstatSync(destination).isDirectory(),
      destinationMode: lstatSync(destination).mode & 0o777,
      destinationChild: readFileSync(join(destination, "entry"), "utf8"),
      outsideEntries: readdirSync(outside).sort(),
      outsideMode: lstatSync(outside).mode & 0o777,
      sentinelBytes: readFileSync(sentinel, "utf8"),
      sentinelMode: lstatSync(sentinel).mode & 0o777,
    }).toEqual({
      destinationIsDirectory: true,
      destinationMode: 0o751,
      destinationChild: "fixture",
      outsideEntries: ["sentinel"],
      outsideMode: 0o750,
      sentinelBytes: "sentinel",
      sentinelMode: 0o600,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("a fixture directory replaces a destination file and merges into a real directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-copy-tree-"));
  const source = join(root, "source");
  const destination = join(root, "clone");
  try {
    mkdirSync(join(source, "nested"), { recursive: true });
    writeFileSync(join(source, "nested", "entry"), "fixture");
    mkdirSync(destination);
    chmodSync(destination, 0o750);
    writeFileSync(join(destination, "nested"), "old file");
    writeFileSync(join(destination, "keep"), "keep");

    copyTree(source, destination);

    expect(lstatSync(join(destination, "nested")).isDirectory()).toBe(true);
    expect(readFileSync(join(destination, "nested", "entry"), "utf8")).toBe("fixture");
    expect(readFileSync(join(destination, "keep"), "utf8")).toBe("keep");
    expect(lstatSync(destination).mode & 0o777).toBe(0o750);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
