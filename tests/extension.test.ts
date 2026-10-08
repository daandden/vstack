import { describe, expect, test } from "bun:test";
import { fakeHost } from "./support/extension-host.ts";

describe("vstack_rename_session", () => {
  test("registers as a top-level tool with a name parameter", () => {
    const tool = fakeHost().tools.get("vstack_rename_session");
    expect(tool).toBeDefined();
    expect(tool!.loadMode).toBe("essential");
    expect(JSON.stringify(tool!.parameters)).toContain("name");
  });

  test("registers in subagent sessions too", () => {
    const host = fakeHost({ agent: { kind: "sub", id: "Child", name: "vstack-worker", depth: 1, parentId: "Main" } });
    expect(host.tools.has("vstack_rename_session")).toBe(true);
  });

  test("sets a user-sourced session name", async () => {
    const host = fakeHost();
    const result = await host.callTool("vstack_rename_session", { name: "#69 extension" });
    expect(result.isError).toBeFalsy();
    expect(host.session).toMatchObject({ name: "#69 extension", source: "user" });
    expect(result.content[0]!.text).toContain("#69 extension");
  });

  test("the name survives omp's auto title", async () => {
    const host = fakeHost();
    await host.callTool("vstack_rename_session", { name: "#69 extension" });
    expect(host.autoTitle("Some auto title")).toBe(false);
    expect(host.session.name).toBe("#69 extension");
  });

  test("trims the name and rejects an empty one", async () => {
    const host = fakeHost();
    const blank = await host.callTool("vstack_rename_session", { name: "   " });
    expect(blank.isError).toBe(true);
    expect(host.session.name).toBeUndefined();
    await host.callTool("vstack_rename_session", { name: "  padded  " });
    expect(host.session.name).toBe("padded");
  });
});
