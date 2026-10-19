import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DIAGRAM_SCRIPTS, EVAL_PYTHON, runScript } from "./support/diagram-scripts";

const NO_PYTHON = EVAL_PYTHON === null;
const ASSETS = join(DIAGRAM_SCRIPTS, "..", "assets");
const SHIPPED = readdirSync(ASSETS).filter((name) => name.endsWith(".html")).sort();

test("the skill ships its templates and icon gallery", () => {
  expect(SHIPPED).toEqual(expect.arrayContaining(["icons.html", "template.html", "template-terminal.html"]));
});

for (const name of SHIPPED) {
  test.skipIf(NO_PYTHON)(`${name} passes every shipped checker`, () => {
    const path = join(ASSETS, name);
    for (const script of ["self_check.py", "verify-geometry.py", "lint-skin.py"]) {
      const r = runScript(script, [path]);
      expect({ script, stdout: r.stdout, stderr: r.stderr, code: r.code }).toMatchObject({ script, stderr: "", code: 0 });
    }
  });
}
