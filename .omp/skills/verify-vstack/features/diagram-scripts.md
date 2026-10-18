# Diagram scripts

The diagram-design skill bundles Python scripts that need only the standard library, and an agent runs them in omp's eval tool. The extract scripts turn a Mermaid, draw.io, or Excalidraw file into a digest of nodes, edges, hubs, and budget flags. The self-check script and the geometry checker check a generated diagram HTML file. The export script turns a diagram HTML file into a standalone SVG.

## Sub-features

- `diagram-mermaid` `mermaid_extract.py <file>` prints a Markdown digest of the first Mermaid diagram. `--json` prints the full IR.
- `diagram-drawio` `drawio_extract.py <file>` prints the same digest for a draw.io file.
- `diagram-excalidraw` `excalidraw_extract.py <file>` prints the same digest for an Excalidraw scene. A file without `"type": "excalidraw"` exits 2 and names the problem.
- `diagram-check` `self_check.py <file>...` prints `OK <file>` for a good diagram. For a bad one, it prints `FAIL <file>` and one `  - <error>` line per problem, and exits 1.
- `diagram-geometry` `verify-geometry.py <file>...` prints one `<file name>:<line>: ...` line per connector or label-mask problem, then a `Summary:` line, and exits 1 when it finds any. A clean file prints only the summary and exits 0.
- `diagram-export` `export_svg.py <html> [<out.svg>]` writes a well-formed SVG and prints its path. A missing source exits 2.

## How to get to it (user POV)

- An agent in `/skill:diagram-design` runs "the eval cell for `<skill-dir>/scripts/<script>.py <args>`". That is one Python eval cell that sets `sys.argv` and runs the script with `runpy`. The skill's SKILL.md gives the cell.
- Import: the agent runs an extract script on the user's Mermaid, draw.io, or Excalidraw file before it redraws the diagram.
- Check: the agent runs the self-check and the geometry checker on each diagram HTML file that it writes.
- Export: the user asks to export or save a diagram as SVG.

## Driving it with omp's Python eval

Preconditions:

- The baseline from `README.md`.
- The fixtures and outputs are proof, so they go in `$VERIFY_RUN_DIR/diagram-scripts/`, not in `data/`.

- Runner. In one Python eval cell, set `CHECKOUT` and `RUN` to the absolute paths of `CHECKOUT` and `VERIFY_RUN_DIR`, and define the runner below. It is the skill's eval cell with captured output, so each call returns the exit code, stdout, and stderr. Eval state persists, so later cells reuse `cell`, `S`, and `D`. Record `sys.executable` in `notes.md`.

  ```python
  import contextlib, io, json, os, runpy, sys
  CHECKOUT = "<CHECKOUT>"
  RUN = "<VERIFY_RUN_DIR>"
  S = f"{CHECKOUT}/plugin/skills/diagram-design/scripts"
  D = f"{RUN}/diagram-scripts"
  os.makedirs(D, exist_ok=True)

  def cell(argv):
      out, err, code = io.StringIO(), io.StringIO(), 0
      sys.argv = argv
      with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
          try:
              runpy.run_path(argv[0], run_name="__main__")
          except SystemExit as e:
              code = e.code or 0
      return code, out.getvalue(), err.getvalue()
  ```

- Fixtures. Write one source file per format:

  ```python
  open(f"{D}/flow.mmd", "w").write("flowchart LR\n  A[Client] --> B[API]\n  B -->|reads| C[(Notes DB)]\n")
  open(f"{D}/flow.drawio", "w").write("""<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="a" value="Client" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="b" value="API" vertex="1" parent="1"><mxGeometry x="200" y="0" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="e1" value="calls" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram></mxfile>
  """)
  open(f"{D}/flow.excalidraw", "w").write(json.dumps({"type": "excalidraw", "elements": [
      {"id": "a", "type": "rectangle", "x": 0, "y": 0, "width": 120, "height": 60},
      {"id": "ta", "type": "text", "x": 10, "y": 20, "text": "Client", "containerId": "a"},
      {"id": "b", "type": "rectangle", "x": 200, "y": 0, "width": 120, "height": 60},
      {"id": "tb", "type": "text", "x": 210, "y": 20, "text": "API", "containerId": "b"},
      {"id": "e1", "type": "arrow", "x": 120, "y": 30, "points": [[0, 0], [80, 0]],
       "startBinding": {"elementId": "a"}, "endBinding": {"elementId": "b"}, "startArrowhead": None, "endArrowhead": "arrow"},
  ]}))
  ```

- Mermaid. Run `cell([f"{S}/mermaid_extract.py", f"{D}/flow.mmd"])`. Exit 0. stdout starts with `# Mermaid IR — flow.mmd`, then `1 diagram(s): [0] flowchart (3n/2e)`. The Edges table has the row `| API | Notes DB | reads | solid arrow |`. Save stdout to `$D/mermaid-digest.md`. Run it again with `"--json"` added: `json.loads(stdout)["diagrams"][0]` lists the nodes `A`, `B`, and `C` and two edges.
- draw.io. Run `cell([f"{S}/drawio_extract.py", f"{D}/flow.drawio"])`. Exit 0. stdout holds `1 page(s): [0] Page\-1 (2n/1e)` and the Edges row `| Client | API | calls | - |`. Save stdout to `$D/drawio-digest.md`.
- Excalidraw. Run `cell([f"{S}/excalidraw_extract.py", f"{D}/flow.excalidraw"])`. Exit 0. stdout holds `1 scene: flow (2n/1e)` and the Edges row `| Client | API | - | - |`. Save stdout to `$D/excalidraw-digest.md`.
- Excalidraw refusal. Write `{"elements": []}` to `$D/not-a-scene.excalidraw` and run the same script on it. Exit 2, stdout is empty, and stderr is `excalidraw_extract: not-a-scene.excalidraw: not an Excalidraw scene (missing type: excalidraw)`.
- Self-check pass. Run `cell([f"{S}/self_check.py", f"{CHECKOUT}/tests/fixtures/diagram-design/figure-mocha.html"])`. Exit 0, and stdout is `OK ` and that path.
- Self-check fail. Write `<!doctype html><html><head><title>x</title><script src="https://cdn.example.com/app.js"></script></head><body></body></html>` to `$D/bad.html` and run the self-check on it. Exit 1. stdout is `FAIL ` and that path, then `  - remote reference on <script>: https://cdn.example.com/app.js` and `  - script 1 must carry only the canonical data-diagram-controls attribute`.
- Geometry pass. Run `cell([f"{S}/verify-geometry.py", f"{CHECKOUT}/tests/fixtures/diagram-design/figure-mocha.html"])`. Exit 0, and stdout is `Summary: 1 file(s) checked, 0 finding(s).`
- Geometry fail. Write the Mocha figure to `$D/diagonal.html` with `<line x1="200" y1="148" x2="278" y2="148"` changed to end at `y2="164"`, and run the geometry checker on it. Exit 1. stdout is `diagonal.html:91: connector <line 200,148 -> 278,164> has a diagonal segment 200,148 -> 278,164 - route it as a rounded right-angle elbow`, then `Summary: 1 file(s) checked, 1 finding(s).`
- Export. Save `git -C "$CHECKOUT" status --porcelain -- plugin/skills/diagram-design tests/fixtures` as `$D/checkout-before.txt`. Run `cell([f"{S}/export_svg.py", f"{CHECKOUT}/tests/fixtures/diagram-design/figure-mocha.html", f"{D}/figure-mocha.svg"])`. Exit 0, and stdout is the output path. `xml.etree.ElementTree.parse(f"{D}/figure-mocha.svg").getroot()` has the tag `{http://www.w3.org/2000/svg}svg` and the `viewBox` `0 0 1000 360`. Save the same `git status` as `$D/checkout-after.txt`. It equals the before file, so the export wrote nothing into the checkout.
- Export refusal. Run the export on `f"{D}/missing.html"` with the output `f"{D}/missing.svg"`. Exit 2, and stderr is `error: source not found: ` and that path.

## Gotchas

- Run the scripts in the eval tool, never with `python3` through bash. The skill runs them under eval's interpreter: the project venv, then `~/.omp/python-env`, then `PATH`.
- `runpy` raises `SystemExit` on every exit. A bare `runpy.run_path` in a cell turns exit 1 into a cell error, so use the runner.
- With no output path, `export_svg.py` writes `<source-stem>.svg` next to the source. Always pass an output path under `$D`, so the export never writes into `$CHECKOUT`.
- Use the checkout's script paths. `skill://diagram-design` resolves to the plugin that your own session loaded.
- The draw.io and Excalidraw digests escape Markdown in names, such as `flow\.drawio` and `Page\-1`. Match the escaped text.
