# Environment doctor

Load this file when the user asks to run diagnostics, health checks, or first-run troubleshooting, or name the diagram-design doctor.

The goal is a one-shot report that checks local readiness for Diagram Design import/export and command routing, without mutating user files or installing dependencies.

Resolve the Diagram Design installation from this loaded reference, not from the
user's current working directory. A normal project directory is the expected
place to invoke the doctor and must not be treated as a repository-path error.

Use two diagnostic modes:

- **Installed-skill mode** (default): check the runtime and the resolved skill
  installation. Do not require maintainer-only repository files.
- **Maintainer-checkout mode**: use this only when the resolved installation
  root contains `CONTRIBUTING.md`, `.github/workflows/ci.yml`, and
  `scripts/verify-plugin-package.py`. Add the repository integrity checks below.

## Inputs

Optional flags:

- `--strict` — treat warnings as failures in the final summary.
- `--json` — print a machine-readable JSON report in addition to human summary.

If no flags are provided, run in standard mode.

## Required checks

Run all checks in this order and report each as `pass`, `warn`, or `fail`.

1. Python runtime
- Python is omp's eval interpreter (the project venv, then `~/.omp/python-env`,
  then PATH). Run one eval cell that prints `sys.version` and `sys.executable`.
  If eval Python cannot start, report it as a failed check (remedy:
  `omp setup python`) rather than ending the run.
- Require version >= 3.10.
- `fail` if no Python interpreter is found.
- `fail` if version is below 3.10.

2. Playwright availability for PNG export
- Check in an eval cell whether `importlib.util.find_spec("playwright")` finds Playwright in eval's interpreter; an optional package version attribute is not required.
- When Playwright is found, verify that Playwright's default headless Chromium launches and closes. Run this eval cell exactly. It starts the probe as an owned child process that writes its output to temporary files, bounds browser startup to 5 seconds and the probe to 10 seconds, and on POSIX records the child's descendants every 0.2 seconds while the child runs. On a POSIX timeout, the cell lists the child's descendants again and, with `lsof`, the processes that hold the output files. It kills the child's process group and every process it recorded or found, then waits for them to exit. The listing, the kills, and that wait share one 2-second deadline, and every `pgrep` and `lsof` call gets only the time left. On Windows, `taskkill` gets 2 seconds. Reaping the child gets its own 2 seconds. If the child exits by itself while recorded descendants or output-file holders still run, the cell kills them within one 2-second deadline and names them in a cleanup warning. Without `lsof`, the cell skips the output-file check. If the child cannot start, the cell reports that and skips cleanup. The cell prints one line. Report it as the check result, and keep a cleanup failure in it as a warning. A headless-shell-only installation counts; default PNG export does not need the full Chromium executable path.

```python
import os, signal, subprocess, sys, tempfile, time

PROBE = """
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    p.chromium.launch(timeout=5000).close()
"""

def descendants(pid, deadline):
    left = deadline - time.monotonic()
    if left <= 0:
        raise subprocess.TimeoutExpired("pgrep", 0)
    out = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True, timeout=left).stdout
    pids = {int(line) for line in out.split()}
    for child in list(pids):
        pids |= descendants(child, deadline)
    return pids

def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    return True

def kill_tree(group, pids, deadline, cleanup):
    for kill, target in [(os.killpg, group)] + [(os.kill, pid) for pid in sorted(pids)]:
        try:
            kill(target, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except OSError as exc:
            cleanup.append(f"could not kill {target}: {exc}")
    while any(alive(pid) for pid in pids) and time.monotonic() < deadline:
        time.sleep(0.1)
    survivors = sorted(pid for pid in pids if alive(pid))
    if survivors:
        cleanup.append(f"probe processes still running: {survivors}")

def holders(paths, deadline, cleanup):
    # A detached descendant of a departed child still holds the probe's output files open.
    left = deadline - time.monotonic()
    try:
        if left <= 0:
            raise subprocess.TimeoutExpired("lsof", 0)
        out = subprocess.run(["lsof", "-t", *paths], capture_output=True, text=True, timeout=left).stdout
    except FileNotFoundError:
        return set()
    except (OSError, subprocess.SubprocessError) as exc:
        cleanup.append(f"could not list processes holding the probe output: {exc}")
        return set()
    return {int(pid) for pid in out.split()} - {os.getpid()}

def run_probe():
    posix = os.name == "posix"
    cleanup = []
    seen = set()
    # Files instead of pipes: a lingering Chromium that holds the output open cannot block the wait.
    with tempfile.NamedTemporaryFile() as out, tempfile.NamedTemporaryFile() as err:
        try:
            proc = subprocess.Popen([sys.executable, "-c", PROBE], stdout=out, stderr=err, start_new_session=posix)
        except OSError as exc:
            return f"warn: could not start the browser probe: {exc}"
        deadline = time.monotonic() + 10
        while proc.poll() is None and time.monotonic() < deadline:
            if posix:
                # Record the tree while the child runs: descendants of a departed child lose their parent link.
                try:
                    seen |= descendants(proc.pid, deadline)
                except (OSError, subprocess.SubprocessError):
                    pass
            time.sleep(0.2)
        if proc.poll() is None:
            result = "warn: the browser probe did not finish in 10 seconds"
            stop = time.monotonic() + 2
            if posix:
                try:
                    seen |= descendants(proc.pid, stop)
                except (OSError, subprocess.SubprocessError) as exc:
                    cleanup.append(f"could not list the probe's descendants: {exc}")
                seen |= holders([out.name, err.name], stop, cleanup) - {proc.pid}
                kill_tree(proc.pid, seen, stop, cleanup)
            else:
                try:
                    subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True, timeout=2, check=True)
                except (OSError, subprocess.SubprocessError) as exc:
                    cleanup.append(f"taskkill failed: {exc}")
                    try:
                        proc.kill()
                    except OSError:
                        pass
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cleanup.append(f"probe process {proc.pid} was not reaped in 2 seconds")
        else:
            if proc.returncode == 0:
                result = "pass: headless Chromium launched and closed"
            else:
                err.seek(0)
                lines = err.read().decode(errors="replace").strip().splitlines()
                result = "warn: the browser probe failed: " + (lines[-1] if lines else f"exit code {proc.returncode}")
            if posix:
                stop = time.monotonic() + 2
                lingering = {pid for pid in seen if alive(pid)} | holders([out.name, err.name], stop, cleanup)
                if lingering:
                    cleanup.append(f"the probe exited and left processes running: {sorted(lingering)}")
                    kill_tree(proc.pid, lingering, stop, cleanup)
    if cleanup:
        result += "; cleanup warning: " + "; ".join(cleanup)
    return result

print(run_probe())
```

- If missing, mark `warn` and report that PNG export offers to install
  Playwright with `%pip` after the user approves it through `ask`.
- Never auto-install dependencies.

3. Shipped script presence
- Verify these scripts exist in the resolved skill's `scripts/` folder:
  - `drawio_extract.py`
  - `mermaid_extract.py`
  - `excalidraw_extract.py`
  - `self_check.py`
  - `verify-geometry.py`
  - `lint-skin.py`
  - `export_svg.py`
- A missing script is `fail`. Suggest reinstalling or updating Diagram Design.

4. Plugin wiring surfaces (maintainer-checkout mode only)
- Verify Claude command files exist and point to their references:
  - `commands/export-diagram.md` -> `references/export.md`
  - `commands/import-drawio.md` -> `references/import-drawio.md`
  - `commands/import-mermaid.md` -> `references/import-mermaid.md`
  - `commands/import-excalidraw.md` -> `references/import-excalidraw.md`
  - `commands/doctor.md` -> `references/doctor.md`
- Verify Pi prompt files exist and point to their references:
  - `prompts/export-diagram.md` -> `references/export.md`
  - `prompts/import-mermaid.md` -> `references/import-mermaid.md`
  - `prompts/import-excalidraw.md` -> `references/import-excalidraw.md`
  - `prompts/doctor.md` -> `references/doctor.md`
- Missing files are `fail`.
- Mismatched reference routing is `fail`.
- In installed-skill mode, report that maintainer command/prompt wiring is not
  applicable; partial or absent repository routing trees are not failures.

5. Common path mistakes
- Verify `SKILL.md` beneath the resolved installation root. Do not search for it
  relative to the user's current project and do not instruct users to enter the
  maintainer repository.
- Detect Windows path quoting risk when paths contain spaces and the provided command examples omit quotes.
- Detect references to local installed skill paths that do not exist (if command output includes one).
- Mark these as `warn` with a precise fix suggestion.
- A missing resolved `SKILL.md` should suggest reinstalling or updating Diagram
  Design, not changing into a repository checkout.

## Output contract

Always print:

1. A compact summary line:
- `Doctor summary: <PASS|WARN|FAIL> (<pass_count> pass, <warn_count> warn, <fail_count> fail)`

2. A checklist with one line per check:
- `[PASS] Python 3.11.9 found at ...`
- `[WARN] Playwright not installed ...`
- `[FAIL] Missing scripts/verify-geometry.py`

3. A `Next actions` section only when warn/fail exists.

4. If `--json` is present, append JSON object with:
- `status`, `counts`, `checks[]` (`name`, `status`, `message`, `fix` optional), `timestamp`.

## Safety and behavior rules

- Read-only diagnostics only: do not modify files, do not install packages, do not run destructive git commands.
- If any command fails unexpectedly, capture stderr and continue remaining checks.
- Never claim a check passed unless verified directly in this run.
- Prefer explicit, copy-pastable remediation commands.

## Example result

```text
Doctor summary: WARN (6 pass, 2 warn, 0 fail)
[PASS] Python 3.11.9 found at /usr/bin/python3
[WARN] Playwright package not found in active interpreter
[PASS] scripts/verify-geometry.py present
...

Next actions
- Provision an approved PNG export renderer, then re-run the doctor check
- Re-run: the diagram-design doctor with --strict
```
