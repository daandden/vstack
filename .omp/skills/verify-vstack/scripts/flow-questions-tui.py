#!/usr/bin/env python3
"""Drive the UI-only Flow panel beside ordinary ask, and separate answer recording, in native omp."""
import argparse
from contextlib import ExitStack
import errno
import fcntl
import json
from html.parser import HTMLParser
import os
from pathlib import Path
import pty
import re
import secrets
import select
import shlex
import shutil
import signal
import socket
import struct
import subprocess
import tempfile
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

PANEL = '[data-role="vstack.flow-panel"]'
FORM = '[data-role="omp.ask.card"]'
COMPOSER = '.tn-pane.on:not(.off) .sf-editor'


def owned_processes(home, port):
    # A detached CLI or worker no longer has omp as its parent. Match the unique run HOME instead.
    home_arg = re.escape(str(home))
    namespace = re.compile(rf"(?<!\S)HOME={home_arg}(?!\S)")
    host = re.compile(rf"/(?:managed-host|host)\.ts --home {home_arg} --port {port}(?!\S)")
    result = subprocess.run(["ps", "axeww", "-o", "pid=,stat=,command="], check=True,
                            capture_output=True, text=True, errors="replace", timeout=5)
    processes = []
    for line in result.stdout.splitlines():
        pid, state, command = line.split(maxsplit=2)
        if not state.startswith("Z") and namespace.search(command):
            processes.append({"pid": int(pid), "kind": "host" if host.search(command) else "client"})
    return processes


def stop_host_clients(home, port, stopped):
    sent = set()
    start = time.monotonic()
    while True:
        clients = [p["pid"] for p in owned_processes(home, port) if p["kind"] == "client"]
        if not clients:
            return
        elapsed = time.monotonic() - start
        if elapsed >= 5:
            raise RuntimeError(f"Flow host clients still running: {clients}")
        sig = signal.SIGTERM if elapsed < 1 else signal.SIGKILL
        for pid in clients:
            if (pid, sig) not in sent:
                try:
                    os.kill(pid, sig)
                except ProcessLookupError:
                    continue
                sent.add((pid, sig))
                stopped.append({"pid": pid, "signal": sig.name})
        time.sleep(0.05)


def verify_host_stopped(home, port, cleanup):
    deadline = time.monotonic() + 5
    while True:
        cleanup["remaining_processes"] = owned_processes(home, port)
        with socket.socket() as probe:
            probe.settimeout(1)
            result = probe.connect_ex(("127.0.0.1", port))
        if result not in (0, errno.ECONNREFUSED):
            raise OSError(result, f"Cannot inspect Flow host port {port}: {os.strerror(result)}")
        cleanup["port_listening"] = result == 0
        if not cleanup["port_listening"] and not cleanup["remaining_processes"]:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Flow host port {port} listening: {cleanup['port_listening']}; "
                               f"run processes still present: {cleanup['remaining_processes']}")
        time.sleep(0.05)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def lines(path):
    if not path.exists():
        return []
    result = []
    records = path.read_text().splitlines(keepends=True)
    for index, line in enumerate(records):
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            if index == len(records) - 1 and not line.endswith(("\n", "\r")):
                break
            raise
    return result


def plain(data):
    text = data.decode("utf-8", errors="replace")
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    return re.sub(r"\x1b[^\n]", "", text).replace("\r", "")


def control_names(html):
    if not isinstance(html, str):
        return []

    class Controls(HTMLParser):
        def __init__(self):
            super().__init__()
            self.all_names = {}
            self.form_names = None
            self.in_form = False

        def handle_starttag(self, tag, attrs):
            if tag == "form" and self.form_names is None:
                self.form_names = {}
                self.in_form = True
            attrs = dict(attrs)
            if tag in ("input", "select", "textarea") and attrs.get("name"):
                if tag == "input" and (attrs.get("type") or "").lower() in (
                    "hidden", "button", "file", "submit", "reset", "image",
                ):
                    return
                self.all_names[attrs["name"]] = None
                if self.in_form:
                    self.form_names[attrs["name"]] = None

        def handle_endtag(self, tag):
            if tag == "form":
                self.in_form = False

    parser = Controls()
    parser.feed(html)
    parser.close()
    return list(parser.form_names if parser.form_names is not None else parser.all_names)


def fixture_ask(receipt):
    return {"html": receipt["ask"]["html"]}


def renamed_ask(receipt):
    first = receipt["ask"]["questions"][0]["id"]
    return {"html": receipt["ask"]["html"].replace(f'name="{first}"', 'name="renamed-control"')}


def html_answers(result):
    text = result["content"][0]["text"]
    header = "User answers:\n"
    assert text.startswith(header), text
    return json.JSONDecoder().raw_decode(text[len(header):])[0]


def recorded_answers(stage):
    return {question["id"]: question["answer"] for question in stage["questions"]
            if "response" in question["answer"]}


def actual_model(args):
    """Observe a fresh Session-model TUI; keyboard policy is never scenario input."""
    import hashlib

    checkout, tools, run = (Path(p).resolve() for p in (args.checkout, args.omp_tools, args.run))
    source = Path(args.session_source or os.environ.get("PI_SESSION_FILE", ""))
    records = lines(source)
    model = next((r["model"] for r in reversed(records) if r.get("type") == "model_change"), None)
    thinking = next((r["thinkingLevel"] for r in reversed(records) if r.get("type") == "thinking_level_change"), None)
    if not model or not thinking:
        raise RuntimeError("Session source lacks the last model or thinking record")
    run.mkdir(parents=True, exist_ok=False)
    prompt, config = Path(args.prompt).resolve(), Path(args.config).resolve()
    env = {k: v for k, v in os.environ.items() if not k.startswith(("PI_", "OMP_"))}
    env.update(PI_CONFIG_FILES=str(config), TERM="xterm-256color")
    with socket.socket() as free:
        free.bind(("127.0.0.1", 0))
        env["VSTACK_FLOW_PORT"] = str(free.getsockname()[1])
    flow_home = run / "flow-home"
    scenario = prompt.read_text()
    guidance = (
        f"\n\nRuntime isolation for this disposable evaluation: retain real HOME for credentials, "
        f"but use the checkout CLI at {checkout / 'plugin/skills/flow-page/scripts/flow-page.ts'} "
        f"with explicit --home {shlex.quote(str(flow_home))} on every Flow command, "
        "including publication, recovery, export, closure, and host cleanup. "
        "Use your own fresh session and agent identity. Let the CLI start its owned host on demand "
        "using VSTACK_FLOW_PORT. The normal-HOME native extension is intentionally unbound; "
        "this proves explicit isolated CLI publication plus ordinary native ask, not automatic "
        "binding or Flow-card acceptance. VSTACK_FLOW_PORT cannot override an existing discovery "
        "record. Do not launch host.ts directly or alter normal-HOME discovery, secrets, bindings, "
        "or hosts. Do not stop foreign listeners, including port 51417. "
        "Write scenario outputs only in this run directory."
    )
    effective_prompt = scenario + guidance
    sessions = run / "sessions"
    argv = ["omp", "--no-title", "--model", model, "--thinking", thinking,
            "--approval-mode", "yolo", "--no-rules", "--no-context-files",
            "--no-extensions", "-e", str(checkout / "plugin"), "-e", str(tools),
            "--config", str(config), "--session-dir", str(sessions),
            "--cwd", str(run), effective_prompt]
    save(run / "launch.json", {"argv": argv, "session_source": str(source), "model": model,
         "thinking": thinking, "checkout": str(checkout), "omp_tools": str(tools),
         "prompt_sha256": hashlib.sha256(prompt.read_bytes()).hexdigest(),
         "config_sha256": hashlib.sha256(config.read_bytes()).hexdigest(),
         "effective_prompt_sha256": hashlib.sha256(effective_prompt.encode()).hexdigest(),
         "flow_home": str(flow_home), "flow_cli_guidance": guidance.strip(),
         "normal_home_extension_bound": False, "normal_home_binding_card_proven": False,
         "cleared_variables": [k for k in os.environ if k.startswith(("PI_", "OMP_"))],
         "home": env.get("HOME"), "port": env["VSTACK_FLOW_PORT"],
         "automated_controller": args.case, "human_consent": False})
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 55, 180, 0, 0))
    child = subprocess.Popen(argv, cwd=run, env=env, stdin=slave, stdout=slave, stderr=slave,
                             start_new_session=True, preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
    os.close(slave)
    captured, inputs, started = bytearray(), [], time.monotonic()
    summary = {"transport_complete": False, "human_consent": False, "case": args.case}

    message_sessions = {}

    def messages():
        current = []
        for session_file in sessions.rglob("*.jsonl"):
            for record in lines(session_file):
                if record.get("type") == "message":
                    message = record["message"]
                    if message.get("role") == "toolResult":
                        message_sessions[message["toolCallId"]] = session_file
                    current.append(message)
        return current

    def send(label, value):
        inputs.append({"at_seconds": time.monotonic() - started, "label": label,
                       "bytes_hex": value.hex(), "output_byte_offset": len(captured)})
        save(run / "inputs.json", inputs)
        os.write(master, value)

    def verify_picker(current, text):
        ask_calls = [block for message in current if message.get("role") == "assistant"
                     for block in message.get("content", []) if isinstance(block, dict)
                     and block.get("type") == "toolCall" and block.get("name") == "ask"]
        if not ask_calls:
            raise RuntimeError("Visible picker has no ordinary ask call in the native session")
        asked_html = ask_calls[-1].get("arguments", {}).get("html", "")
        expected = control_names(asked_html)
        receipts = []
        decoder = json.JSONDecoder()
        for message in current:
            if message.get("role") != "toolResult":
                continue
            values = [block.get("text", "") for block in message.get("content", [])
                      if isinstance(block, dict)]
            column_truncation = (message.get("details", {}).get("meta", {})
                                 .get("limits", {}).get("columnTruncated", {}))
            artifact_id = column_truncation.get("artifactId")
            if artifact_id is not None and re.fullmatch(r"\d+", str(artifact_id)):
                # omp stores full outputs beside the owning session's JSONL file.
                artifact_dir = message_sessions[message["toolCallId"]].with_suffix("")
                artifacts = list(artifact_dir.glob(f"{artifact_id}.*.log"))
                if len(artifacts) == 1:
                    values.append(artifacts[0].read_text())
            for value in values:
                for match in re.finditer(r"\{", value):
                    try:
                        receipt, _ = decoder.raw_decode(value[match.start():])
                    except json.JSONDecodeError:
                        continue
                    if (isinstance(receipt, dict) and isinstance(receipt.get("ask"), dict)
                            and expected and [q["id"] for q in receipt["ask"].get("questions", [])] == expected):
                        receipts.append(receipt)
        if not receipts:
            raise RuntimeError("Ordinary ask has no matching CLI publication receipt")
        receipt = receipts[-1]
        if asked_html != receipt["ask"].get("html"):
            raise RuntimeError("Ordinary ask HTML differs from the matching CLI receipt's ask.html")
        if receipt.get("live", {}).get("state") != "serving":
            raise RuntimeError(f"Question reader is unavailable: {receipt.get('live')}")
        url = receipt["live"]["url"]
        with urlopen(url.rstrip("/") + "/content", timeout=10) as response:
            content = json.loads(response.read())
        ids = [question["id"] for question in receipt["ask"]["questions"]]
        visible = {question["id"]: question for question in content["questions"]}
        if (content["flow"]["id"] != receipt["flow"] or content["revision"] != receipt["revision"]
                or any(identity not in visible for identity in ids)):
            raise RuntimeError("Live question identity differs from its publication receipt")
        save(run / "live-content.json", content)
        save(run / "publication.json", receipt)
        save(run / "ask-call.json", ask_calls[-1])
        save(run / "before-picker.json", {"elapsed_seconds": time.monotonic() - started,
             "picker_text_offset": text.find("n add note"), "output_bytes": len(captured),
             "normal_home_extension_bound": False, "popup_proven": False,
             "question_context": [visible[identity] for identity in ids]})

    try:
        controlled, submitted_empty, completed_calls, terminal_reply = False, False, 0, False
        deadline = time.monotonic() + args.deadline_seconds
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.15)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        chunk = b""
                    else:
                        raise
                captured.extend(chunk)
                with (run / "terminal.bin").open("ab") as log:
                    log.write(chunk)
                (run / "terminal.txt").write_text(plain(captured))
            current = messages()
            calls = [m for m in current if m.get("role") == "toolResult" and m.get("toolName") == "ask"]
            save(run / "tool-results.json", calls)
            text = plain(captured)
            if not controlled and "n add note" in text:
                verify_picker(current, text)
                if args.case == "cancelled":
                    send("cancel actual picker", b"\x1b")
                elif args.case == "empty":
                    # Shift+Tab reaches the submit review without selecting an option.
                    send("open picker submit review without a selection", b"\x1b[Z")
                controlled = True
            if args.case == "empty" and controlled and not submitted_empty and "n add submit note" in text:
                send("submit actual picker with no selection", b"\r")
                submitted_empty = True
            if calls and len(calls) != completed_calls:
                completed_calls = len(calls)
                summary["attempts"] = [{"isError": m.get("isError", False), "details": m.get("details"),
                                        "content": m.get("content")} for m in calls]
                if calls[-1].get("isError"):
                    summary.update(transport_complete=True, aborted_tool_result=True,
                                   model_continuation_observed=False)
                    break
            if calls:
                last = current[-1] if current else {}
                content = last.get("content", [])
                terminal_reply = (last.get("role") == "assistant" and
                                  not any(b.get("type") == "toolCall" for b in content if isinstance(b, dict)))
                if terminal_reply:
                    summary["transport_complete"] = True
                    break
            if child.poll() is not None:
                raise RuntimeError(f"omp exited {child.returncode} before the scenario completed")
        else:
            raise RuntimeError("Controller deadline reached without a terminal scenario result; this is not a picker timeout")
        summary.update(picker_observed=controlled, ask_results=completed_calls,
                       elapsed_seconds=time.monotonic() - started,
                       note="Inspect actual raw results and Flow behavior. Transport completion is not acceptance.")
    except Exception as error:
        summary["error"] = repr(error)
    finally:
        os.close(master)
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        summary["exit_code"] = child.returncode
        save(run / "summary.json", summary)
        print(json.dumps(summary, indent=2))
    return 0 if summary["transport_complete"] and not summary.get("unavailable") else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--omp-tools", help="omp-tools plugin for legacy Verify cases only")
    parser.add_argument("--run", required=True, help="new Verify run, with no data directory yet")
    parser.add_argument("--case", choices=["native", "native-offline", "tui", "timeout", "cancel", "retry",
                        "offline", "abort", "ratchet", "cancelled", "empty", "later-round", "eval", "eval-read-error"],
                        default="native")
    parser.add_argument("--tern", action="store_true", help="drive a separate real Tern renderer and capture native link clicks")
    parser.add_argument("--prompt", help="Scenario file selects actual Session-model mode, without a stub provider")
    parser.add_argument("--config", help="Actual-model isolation overlay")
    parser.add_argument("--session-source", help="Persistent caller session for model and thinking discovery")
    parser.add_argument("--deadline-seconds", type=int, default=1800)
    args = parser.parse_args()
    native = args.case in ("native", "native-offline")
    specialized = args.case in ("eval", "eval-read-error", "ratchet")
    if (native or specialized) and args.omp_tools:
        parser.error("native cases use stock omp ask; omit --omp-tools")
    if not (native or specialized or args.omp_tools):
        parser.error("legacy Verify cases still require --omp-tools")
    if args.prompt:
        if not args.config or args.case not in ("cancelled", "timeout", "empty"):
            parser.error("--prompt requires --config and --case cancelled|timeout|empty")
        return actual_model(args)
    if args.case in ("cancelled", "empty"):
        parser.error("--case cancelled|empty requires an actual-model --prompt and --config")
    if specialized and not args.tern:
        parser.error(f"--case {args.case} requires --tern for native panel and dialog snapshots")
    checkout, run = (Path(p).resolve() for p in (args.checkout, args.run))
    tools = Path(args.omp_tools).resolve() if args.omp_tools else None
    plugins = [(checkout / "plugin", "vstack")]
    if tools:
        plugins.append((tools, "omp-tools"))
    for root, name in plugins:
        if json.loads((root / "package.json").read_text())["name"] != name:
            parser.error(f"{root} does not name {name}")
    binaries = ["omp", "bun", "git"] + (["tern", "cwebp"] if args.tern else [])
    for binary in binaries:
        if not shutil.which(binary):
            parser.error(f"missing prerequisite: {binary}")
    with ExitStack() as stack:
        return run_case(args, checkout, run, tools, native, stack)


def run_case(args, checkout, run, tools, native, stack):
    out = run / ("flow-questions-" + args.case)
    out.mkdir(parents=True, exist_ok=False)
    data = run / "data"
    data.mkdir(exist_ok=False)
    eval_case = args.case in ("eval", "eval-read-error")
    read_fault = args.case == "eval-read-error"
    stock = native or eval_case or args.case == "ratchet"
    owned_window = stock and args.tern
    temp = "/tmp" if owned_window else tempfile.gettempdir()
    temp = Path(temp).resolve()
    if temp.is_relative_to(Path.home().resolve()):
        raise RuntimeError("OS temp directory is inside the real home; use TMPDIR outside it")
    if stock:
        outside = Path(tempfile.mkdtemp(prefix="vstack-verify-", dir=temp))
    else:
        while True:
            outside = temp / ("vstack-verify-" + secrets.token_hex(3))
            try:
                outside.mkdir()
                break
            except FileExistsError:
                continue
    (data / "outside").symlink_to(outside, target_is_directory=True)
    tern_run = outside / "tern"
    home = tern_run / "data/home" if owned_window else outside / "home"
    project = outside / "proj"
    project.mkdir()
    (data / "home").symlink_to(home, target_is_directory=True)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": str(home), "TERM": "xterm-256color"}
    with socket.socket() as free:
        free.bind(("127.0.0.1", 0))
        port = free.getsockname()[1]
        env["VSTACK_FLOW_PORT"] = str(port)
    versions = {}
    if stock:
        pins = {"omp": "omp/19.1.1", **({"tern": "tern 0.9.30"} if args.tern else {})}
        for binary, pin in pins.items():
            versions[binary] = subprocess.check_output([binary, "--version"], env=env, text=True, timeout=10).strip()
            assert versions[binary].split(" (")[0] == pin, versions
    if owned_window:
        tern_run.mkdir()
        helper = Path(__file__).resolve().with_name("tern-verify")
        tern_env = {**env, "TERN_VERIFY_HOME": str(home), "VSTACK_CHECKOUT": str(checkout)}

        def native_tern(*words):
            result = subprocess.run([helper, words[0], tern_run, *map(str, words[1:])],
                                    env=tern_env, cwd=project, capture_output=True, text=True, timeout=32)
            with (out / "tern-commands.jsonl").open("a") as log:
                log.write(json.dumps({"argv": list(words), "exit": result.returncode,
                                      "stdout": result.stdout, "stderr": result.stderr}) + "\n")
            if result.returncode:
                raise RuntimeError(f"isolated Tern {words}: {result.stdout} {result.stderr}")
            return result.stdout

        def stop_window():
            if (tern_run / "data").exists():
                for name in ("start.log", "window.log"):
                    source = tern_run / name
                    if source.exists():
                        shutil.copy2(source, out / name)
                native_tern("stop")

        # The helper creates HOME when starting its isolated window.
        stack.callback(stop_window)
        native_tern("start")
        try:
            native_tern("clear")
        except RuntimeError:
            native_tern("ctl", "tree", ".mdl, .tn-signin-card")
            native_tern("ctl", "system")
            raise
        native_tern("doctor")
        path = os.pathsep.join([str(Path(shutil.which("bun")).resolve().parent),
                                str(Path(shutil.which("tern")).resolve().parent), "/usr/bin", "/bin", "/usr/sbin", "/sbin"])
        (home / ".zprofile").write_text(f"export PATH={shlex.quote(path)}\n")
    (home / ".omp/agent").mkdir(parents=True)
    cli = checkout / "plugin/skills/flow-page/scripts/flow-page.ts"
    read_error = "fixture: ask-status could not read the bound Flow"
    failures_path = out / "ask-status-failures.txt"
    fault_marker = outside / "fail-ask-status"
    if read_fault:
        bun = Path(shutil.which("bun")).resolve()
        bin_dir = outside / "bin"
        bin_dir.mkdir()
        shim = bin_dir / "bun"
        shim.write_text("#!/bin/sh\n"
                       f'if [ -f {shlex.quote(str(fault_marker))} ]; then\n'
                        '  case "$1:$2" in\n'
                        "    */flow-page/scripts/flow-page.ts:ask-status)\n"
                        f"      printf '%s\\n' {shlex.quote(read_error)} >&2\n"
                        f"      printf '%s\\n' \"$*\" >> {shlex.quote(str(failures_path))}\n"
                        "      exit 1;;\n"
                        "  esac\n"
                        "fi\n"
                        f'exec {shlex.quote(str(bun))} "$@"\n')
        shim.chmod(0o755)
        env["PATH"] = str(bin_dir) + os.pathsep + env["PATH"]
    competing = None
    command_log = []

    def command(argv, label, *, connect=True):
        command_env = env if connect else {**env, "VSTACK_FLOW_HOST": "off"}
        result = subprocess.run(argv, cwd=project, env=command_env, capture_output=True, text=True, timeout=45)
        command_log.append({"argv": argv, "cwd": str(project), "exit": result.returncode,
                            "stdout": result.stdout, "stderr": result.stderr})
        save(out / "commands.json", command_log)
        if result.returncode:
            raise RuntimeError(f"{label} failed: {result.stderr}")
        return result.stdout

    def flow_read(*args):
        session = (out / "child-session-id.txt").read_text()
        argv = ["bun", str(cli), *args, "--home", str(home), "--session", session, "--agent", "main"]
        return json.loads(command(argv, f"read Flow {args[0]}", connect=False))

    def export_flow(state, binding):
        export = out / "export"
        export.mkdir(exist_ok=True)
        save(export / "show.json", state)
        save(export / "bound.json", binding)

    if tools:
        command(["omp", "plugin", "link", str(checkout / "plugin")], "link vstack")
        command(["omp", "plugin", "link", str(tools)], "link omp-tools")
    else:
        generation = cli.with_name("generation.ts").as_uri()
        dest = home / ".omp/plugins/node_modules/vstack/skills"
        assert dest.resolve().is_relative_to(home), dest
        command(["bun", "-e", f"""
import {{ coherentRuntime, runtimePackages, stageRuntime }} from {json.dumps(generation)};
stageRuntime(coherentRuntime(), runtimePackages(), process.argv[1]);
""", str(dest)], "stage candidate Flow runtime into disposable HOME")
        save(out / "staged-runtime.json", {"entry": str(dest / "flow-page/scripts/flow-page.ts"),
             "manifest": str(dest / "flow-page/runtime.json"),
             "source": str(checkout / "plugin/skills")})
    save(out / "identity.json", {"checkout": str(checkout), "omp_tools": str(tools) if tools else None,
         "home": str(home), "project": str(project), "env": env, "versions": versions,
         "omp": str(Path(shutil.which("omp")).resolve()),
         "bun": str(Path(shutil.which("bun")).resolve()),
         "plugins": command(["omp", "plugin", "list"], "list plugins"),
         "human_consent": False})
    contribution = {"version": 1, "items": [
        {"kind": "result", "shape": "document", "ref": "fixture", "title": "Disposable picker fixture",
         "sections": [{"heading": "Context", "blocks": [{"prose": "Fixture evidence, not a real user decision."}]}]},
        {"kind": "round", "questions": [
            {"ref": "pick", "title": "Pick fixture paths", "description": "Full authored context retained on Flow.", "multi": True,
             "needs": [{"need": "Compare fixture tradeoffs.", "kind": "prose"}],
             "options": [{"label": "Alpha", "does": "Use Alpha.", "gains": ["First fixture"], "costs": ["Fixture only"]},
                         {"label": "Beta", "does": "Use Beta.", "gains": ["Second fixture"], "costs": ["Fixture only"]}]},
            {"ref": "words", "title": "Describe the fixture concern", "description": "Preserve Other words without inventing consent.",
             "needs": [{"need": "Explain the fixture concern.", "kind": "prose"}],
             "options": [{"label": "Proceed", "does": "Continue.", "gains": ["Progress"], "costs": ["Unresolved concern"]},
                         {"label": "Pause", "does": "Wait.", "gains": ["Review"], "costs": ["Delay"]}]}]}]}
    if native:
        first, second = contribution["items"][1]["questions"]
        del first["multi"]
        first["title"] = "Which fixture path should the form record?"
        second["title"] = "Which optional control should remain unpicked?"
        second["description"] = "Leave this question open in the baseline."
    if eval_case:
        del contribution["items"][1]["questions"][0]["multi"]
    if args.case == "ratchet":
        ratchet_input = {"id": "fixture", "input": "Say Alpha", "expected": "Alpha", "tag": "smoke"}
        contribution["items"][0] = {
            "kind": "result", "shape": "table", "ref": "fixture", "title": "Ratchet fixture inputs",
            "columns": ["Case", "Complete input", "Expected answer", "Tag", "Provenance"],
            "rows": [{"ref": "input", "cells": [*ratchet_input.values(), "Fixed local transport fixture"]}],
        }
        contribution["items"][1]["questions"] = [{
            "ref": "approval", "title": "Approve fixture inputs?",
            "description": "The complete input set is one disposable case with id fixture. This is UI proof, not tuning approval.",
            "needs": [{"need": "Review the complete disposable input set.", "kind": "prose"}],
            "results": ["fixture/input"],
            "options": [
                {"label": "Approve", "does": "Approve the fixture inputs.", "gains": ["Exercise native approval"], "costs": ["Fixture only"]},
                {"label": "Revise", "does": "Return feedback without approval.", "gains": ["Keep feedback"], "costs": ["No approval"]},
                {"label": "Abort", "does": "Stop the disposable run.", "gains": ["No approval"], "costs": ["No continuation"]},
            ],
        }]
    save(out / "contribution.json", contribution)
    session_dir = out / "sessions"
    session_dir.mkdir()

    def messages():
        return [entry["message"] for file in session_dir.rglob("*.jsonl") for entry in lines(file)
                if entry.get("type") == "message"]

    def asks():
        names = {"eval", "ask"} if eval_case or args.case == "ratchet" else {"ask"}
        return [m for m in messages() if m.get("role") == "toolResult" and m.get("toolName") in names]

    q = shlex.quote
    identity = '--session "$PI_SESSION_ID" --agent main'
    skill = "tune-llm-flow" if args.case == "ratchet" else "implement"
    open_command = (f'bun {q(str(cli))} open --skill {skill} --title "Disposable Flow questions proof" '
                    f'--home "$HOME" {identity} > {q(str(out / "open.json"))} && '
                    f'printf "%s" "$PI_SESSION_ID" > {q(str(out / "child-session-id.txt"))}')
    publish_command = (f'bun {q(str(cli))} submit {q(str(out / "contribution.json"))} '
                       f'--home "$HOME" {identity} > {q(str(out / "publication.json"))}')
    phase, requests, handler_errors = 0, [], []
    inventory_error = None
    receipt = None

    def published_state(opened):
        shown = flow_read("show", "--flow", opened["flow"])
        assert shown["flow"]["id"] == opened["flow"], shown
        return shown

    def published_stage(state, opened):
        return next(stage for stage in state["stages"] if stage["id"] == opened["stage"])

    def live_question():
        nonlocal receipt
        receipt = json.loads((out / "publication.json").read_text())
        assert receipt["live"]["state"] == "serving", receipt
        url = receipt["live"]["url"]
        with urlopen(url, timeout=10) as response:
            html = response.read().decode()
            status = response.status
        (out / "live-page.html").write_text(html)
        assert status == 200
        content_url = url.rstrip("/") + "/content"
        with urlopen(content_url, timeout=10) as response:
            content = json.loads(response.read())
            content_status = response.status
        save(out / "live-content.json", content)
        assert content_status == 200
        assert content["flow"]["id"] == receipt["flow"], content
        assert content["revision"] == receipt["revision"], content
        assert [question["id"] for question in content["questions"]] == [
            question["id"] for question in receipt["ask"]["questions"]], content
        authored = json.dumps(content)
        if args.case == "ratchet":
            required_context = ["Ratchet fixture inputs", "Say Alpha", "Fixed local transport fixture",
                                "The complete input set is one disposable case with id fixture."]
        else:
            required_context = ["Disposable picker fixture", "Fixture evidence, not a real user decision.",
                                "Full authored context retained on Flow.", "Compare fixture tradeoffs.", "Use Alpha.", "Use Beta."]
        for context in required_context:
            assert context in authored, context
        save(out / "live-identity.json", {"url": url, "status": status, "content_url": content_url,
             "content_status": content_status, "flow": receipt["flow"],
             "revision": receipt["revision"], "question_ids": [x["id"] for x in receipt["ask"]["questions"]]})
        if args.case in ("offline", "native-offline"):
            nonlocal competing
            command(["bun", str(cli), "host", "stop", "--home", str(home)], "stop proof host for offline case")
            class Occupied(BaseHTTPRequestHandler):
                def log_message(self, *_):
                    pass
                def do_GET(self):
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"owned competing listener")
            competing = ThreadingHTTPServer(("127.0.0.1", int(env["VSTACK_FLOW_PORT"])), Occupied)
            threading.Thread(target=competing.serve_forever, daemon=True).start()
            bound = json.loads(command(["bun", str(cli), "bound", "--home", str(home),
                                       "--session", (out / "child-session-id.txt").read_text(), "--agent", "main"], "offline binding"))
            save(out / "offline-bound.json", bound)
            assert bound["live"]["state"] == "unavailable"
            committed = published_state(receipt)
            assert committed["revision"] == receipt["revision"], committed
            assert not recorded_answers(published_stage(committed, receipt)), committed
            save(out / "committed-before-answers.json", committed)
        if args.case == "ratchet":
            (project / "cases.jsonl").write_text(json.dumps(ratchet_input) + "\n")
            (project / "harness.ts").write_text("\n")
            (project / "prompt.md").write_text("Disposable approval proof prompt.\n")
            return ratchet_approval("FIRST_APPROVAL", initialize=True)
        if args.case == "eval":
            return eval_ask(renamed_ask(receipt))
        if read_fault:
            assert control_names(receipt["ask"]["html"]) == [q["id"] for q in receipt["ask"]["questions"]]
            current = flow_read("ask-status", *control_names(receipt["ask"]["html"]))
            assert current["binding"]["flow"] == receipt["flow"] and current["binding"]["stage"] == receipt["stage"]
            assert current["refusals"] == [], current
            save(out / "checked-receipt-ask-status.json", current)
            fault_marker.touch()
        return {"tool": "ask", "args": fixture_ask(receipt)}

    def eval_ask(arguments):
        code = 'const result = await tool.ask(' + json.dumps(arguments) + '); print(result.text);'
        return {"tool": "eval", "args": {"language": "js", "code": code}}

    def ratchet_approval(label, initialize=False):
        question = receipt["ask"]["questions"][0]["question"]
        numbered = question.partition(".")[0]
        code = 'import json\nr = ratchet("panel-fixture")\n'
        if initialize:
            code += 'await r.init(cases=["cases.jsonl"], harness=["harness.ts"], change=["prompt.md"])\n'
        code += (f'approval = await r.approve("inputs", question={question!r}, preview="Review {numbered} on the Flow page.")\n'
                 f'print("{label}", json.dumps(approval))')
        return {"tool": "eval", "args": {"language": "py", "code": code, "timeout": 60}}

    def ratchet_outcome(label, outcome):
        assert outcome["toolName"] == "eval" and not outcome.get("isError"), outcome
        text = "\n".join(part.get("text", "") for part in outcome["content"])
        return next(json.loads(line[len(label) + 1:]) for line in text.splitlines() if line.startswith(label + " "))

    def eval_answers(outcome):
        assert outcome["toolName"] == "eval" and not outcome.get("isError"), outcome
        text = "\n".join(part.get("text", "") for part in outcome["content"])
        answer = text.partition("User answers:\n")[2]
        assert answer, outcome
        return json.JSONDecoder().raw_decode(answer)[0]

    def alpha():
        return {receipt["refs"]["pick"]: "A. Alpha"}
    done = threading.Event()
    refusal_observed = threading.Event()
    direct_close_observed = threading.Event()
    submitted = threading.Event()
    follow_prompt = "Bind the second disposable native session."
    follow_open = out / "follow-open.json"
    follow_ready = threading.Event()
    follow_session_dir = out / "follow-sessions"

    class Model(BaseHTTPRequestHandler):
        timeout = 10

        def log_message(self, *_):
            pass

        def do_POST(self):
            nonlocal phase, inventory_error
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append({"path": self.path, "body": body})
                with (out / "model-requests.jsonl").open("a") as log:
                    log.write(json.dumps(requests[-1]) + "\n")
                last_user = next((m for m in reversed(body.get("messages", [])) if m.get("role") == "user"), {})
                probe = str(last_user.get("content", "")).strip() if not body.get("tools") else ""
                if probe == "What is 17 times 23? Answer with only the number.":
                    reply = {"text": "391"}
                elif probe.startswith("Compress into one routing hint"):
                    reply = {"text": "Use this tool when its description matches the task."}
                elif owned_window and any(
                    m.get("role") == "user" and (
                        m.get("content") == follow_prompt or
                        isinstance(m.get("content"), list) and
                        any(p.get("text") == follow_prompt for p in m["content"])
                    ) for m in body.get("messages", [])
                ):
                    if follow_open.exists():
                        reply = {"text": "FLOW_FOLLOW_SESSION_READY"}
                    else:
                        flow = json.loads((out / "open.json").read_text())["flow"]
                        reply = {"tool": "bash", "args": {"command":
                            f"bun {q(str(cli))} open --flow {q(flow)} --skill implement "
                            f'--home "$HOME" {identity} > {q(str(follow_open))}'}}
                elif phase == 0:
                    names = sorted(t.get("function", {}).get("name", t.get("name", "")) for t in body.get("tools", []))
                    save(out / "runtime-inventory.json", names)
                    if "flow_ask" in names:
                        inventory_error = "Fresh runtime still registers flow_ask"
                        reply = {"text": "FLOW_QUESTIONS_INVENTORY_RED"}
                        done.set()
                    else:
                        assert "ask" in names and "bash" in names, names
                        reply = {"tool": "bash", "args": {"command": open_command}}
                        phase = 1
                elif phase == 1:
                    if owned_window and args.case == "native" and not follow_ready.wait(timeout=25):
                        raise RuntimeError("Second session did not bind before publication")
                    reply = {"tool": "bash", "args": {"command": publish_command}}
                    phase = 2
                elif phase == 2:
                    reply = live_question()
                    phase = 3
                    if args.case == "tui" or native:
                        reply = {"tool": "ask", "args": renamed_ask(receipt)}
                        phase = "guard"
                    elif args.case == "eval":
                        phase = "eval-guard"
                elif phase == "guard":
                    if not refusal_observed.wait(timeout=45):
                        raise RuntimeError("Native controller did not release the valid ask after checking the guard")
                    reply = {"tool": "ask", "args": fixture_ask(receipt)}
                    phase = 3
                elif phase == "eval-guard":
                    if not refusal_observed.wait(timeout=30):
                        raise RuntimeError("Native controller did not observe the Eval guard refusal")
                    reply = eval_ask(fixture_ask(receipt))
                    phase = 3
                elif phase == 3:
                    result = asks()
                    assert result, "No dialog tool result"
                    raw = result[-1].get("details", {})
                    committed = published_state(receipt)
                    save(out / "committed-before-answers.json", committed)
                    assert not recorded_answers(published_stage(committed, receipt)), "Ask delivery must not author Flow answers"
                    if native:
                        assert submitted.wait(timeout=2), "No explicit native Submit action"
                        assert len(result) == 2 and not result[-1].get("isError") and not raw.get("timedOut"), result
                        pick_id, optional_id = [question["id"] for question in receipt["ask"]["questions"]]
                        assert html_answers(result[-1]) == {pick_id: "A. Alpha"}, result[-1]
                        assert [(a["name"], a["answer"]) for a in raw["answers"]] == [
                            (pick_id, "A. Alpha"), (optional_id, "")], raw
                        assert not raw.get("notes"), raw
                        save(out / "observed-native-submit.json", result[-1])
                        save(out / "normalized-answers.json", {"version": 1, "items": [
                            {"kind": "answer", "question": pick_id, "response": {"status": "answered", "picks": ["A"]}},
                        ]})
                        reply = {"tool": "bash", "args": {"command":
                            f'bun {q(str(cli))} submit {q(str(out / "normalized-answers.json"))} --home "$HOME" {identity}'
                            f' > {q(str(out / "answers-receipt.json"))}'}}
                        phase = 4
                    elif args.case == "ratchet":
                        first = ratchet_outcome("FIRST_APPROVAL", result[-1])
                        assert len(result) == 1 and first == {"approved": True}, result
                        save(out / "ratchet-first-outcome.json", first)
                        if not direct_close_observed.wait(timeout=20):
                            raise RuntimeError("Native controller did not observe the Ratchet gate close")
                        reply = ratchet_approval("REUSED_APPROVAL")
                        phase = 4
                    elif args.case == "eval":
                        assert len(result) == 2 and eval_answers(result[-1]) == alpha(), result
                        reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                        done.set()
                    elif read_fault:
                        assert len(result) == 1 and result[-1]["toolName"] == "ask" and not result[-1].get("isError"), result
                        assert html_answers(result[-1]) == alpha(), result[-1]
                        if not direct_close_observed.wait(timeout=20):
                            raise RuntimeError("Native controller did not observe the direct native form close")
                        reply = eval_ask(fixture_ask(receipt))
                        phase = 4
                    elif args.case in ("tui", "retry", "later-round"):
                        assert not result[-1].get("isError"), result[-1]
                        pick_id, words_id = [question["id"] for question in receipt["ask"]["questions"]]
                        values = html_answers(result[-1])
                        assert values == {pick_id: ["A. Alpha", "B. Beta"], words_id: "fixture-custom-concern"}, values
                        notes = [note["text"] for note in raw["notes"]
                                 if note["name"] == pick_id and note["option"] == "A. Alpha"]
                        words = [entry["text"] for entry in raw["other"] if entry["name"] == words_id]
                        assert notes == ["fixture-option-note"] and words == ["fixture-custom-concern"], raw
                        option_note, custom_input = notes[0], words[0]
                        assert raw.get("submitNote") == "fixture-submit-note", raw
                        normalized = {"version": 1, "items": [
                            {"kind": "answer", "question": pick_id, "response": {
                                "status": "answered", "picks": ["A", "B"], "text": option_note}},
                            {"kind": "answer", "question": words_id, "response": {
                                "status": "answered", "text": custom_input},
                             "reading": {"outcome": "concern", "unresolved": "Scripted fixture concern remains unresolved."}},
                            {"kind": "result", "shape": "document", "title": "Note on all answers",
                             "sections": [{"heading": "Submit note", "blocks": [{"prose": raw["submitNote"]}]}]},
                        ]}
                        save(out / "normalized-answers.json", normalized)
                        reply = {"tool": "bash", "args": {"command":
                            f'bun {q(str(cli))} submit {q(str(out / "normalized-answers.json"))} --home "$HOME" {identity} > {q(str(out / "answers-receipt.json"))}'}}
                        phase = 4
                    else:
                        assert args.case == "timeout", "Cancellation unexpectedly resumed the model"
                        assert raw.get("timedOut") is True, raw
                        reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                        done.set()
                elif phase == 4 and read_fault:
                    result = asks()
                    assert len(result) == 2 and eval_answers(result[-1]) == alpha(), result
                    reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                    done.set()
                elif phase == 4 and args.case == "ratchet":
                    result = asks()
                    assert len(result) == 2, result
                    reused = ratchet_outcome("REUSED_APPROVAL", result[-1])
                    assert reused == {"approved": True, "already": True}, reused
                    save(out / "ratchet-outcomes.json", {
                        "FIRST_APPROVAL": json.loads((out / "ratchet-first-outcome.json").read_text()),
                        "REUSED_APPROVAL": reused,
                    })
                    reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                    done.set()
                elif phase == 4 and args.case == "later-round":
                    assert len(recorded_answers(published_stage(published_state(receipt), receipt))) == 2, \
                        "First answers were not separately recorded"
                    later = {"version": 1, "items": [{"kind": "round", "questions": [{
                        "ref": "later", "title": "Choose the later fixture path",
                        "description": "This is a new authored round, not a retry of the first picker.",
                        "needs": [{"need": "Compare the later fixture paths.", "kind": "prose"}],
                        "options": [
                            {"label": "Continue", "does": "Continue the fixture.", "gains": ["Exercise a later round"], "costs": ["Fixture only"]},
                            {"label": "Stop", "does": "Stop the fixture.", "gains": ["No continuation"], "costs": ["No later answer"]},
                        ],
                    }]}]}
                    save(out / "later-contribution.json", later)
                    reply = {"tool": "bash", "args": {"command":
                        f'bun {q(str(cli))} submit {q(str(out / "later-contribution.json"))} --home "$HOME" {identity} > {q(str(out / "later-publication.json"))}'}}
                    phase = 5
                elif phase == 5 and args.case == "later-round":
                    later = json.loads((out / "later-publication.json").read_text())
                    assert later["live"]["state"] == "serving", later
                    assert later["flow"] == receipt["flow"] and later["live"]["url"] == receipt["live"]["url"]
                    with urlopen(later["live"]["url"].rstrip("/") + "/content", timeout=10) as response:
                        content = json.loads(response.read())
                    expected_ids = [q["id"] for q in receipt["ask"]["questions"] + later["ask"]["questions"]]
                    assert content["flow"]["id"] == later["flow"] and content["revision"] == later["revision"], content
                    assert [q["id"] for q in content["questions"]] == expected_ids, content
                    assert "This is a new authored round" in json.dumps(content), content
                    save(out / "later-live-content.json", content)
                    reply = {"tool": "ask", "args": fixture_ask(later)}
                    phase = 6
                elif phase == 6 and args.case == "later-round":
                    result = asks()
                    assert len(result) == 2 and not result[-1].get("isError"), result
                    save(out / "later-tool-result.json", result[-1])
                    later = json.loads((out / "later-publication.json").read_text())
                    assert html_answers(result[-1]) == {later["ask"]["questions"][0]["id"]: "A. Continue"}, result[-1]
                    assert len(recorded_answers(published_stage(published_state(receipt), receipt))) == 2, \
                        "Later ask delivery authored an answer"
                    normalized = {"version": 1, "items": [{"kind": "answer",
                        "question": later["ask"]["questions"][0]["id"],
                        "response": {"status": "answered", "picks": ["A"]}}]}
                    save(out / "later-normalized-answer.json", normalized)
                    reply = {"tool": "bash", "args": {"command":
                        f'bun {q(str(cli))} submit {q(str(out / "later-normalized-answer.json"))} --home "$HOME" {identity} > {q(str(out / "later-answers-receipt.json"))}'}}
                    phase = 7
                else:
                    reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                    done.set()
                message = {"role": "assistant", "content": reply.get("text")}
                if "tool" in reply:
                    message["tool_calls"] = [{"index": 0, "id": f"fixture_{len(requests)}", "type": "function",
                        "function": {"name": reply["tool"], "arguments": json.dumps(reply["args"])}}]
                finish = "tool_calls" if "tool" in reply else "stop"
                usage = {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}
                if body.get("stream"):
                    chunks = [{"choices": [{"index": 0, "delta": message, "finish_reason": None}]},
                              {"choices": [{"index": 0, "delta": {}, "finish_reason": finish}], "usage": usage}]
                    payload = "".join("data: " + json.dumps({"id": "stub", "object": "chat.completion.chunk",
                        "created": 0, "model": "stub-model", **chunk}) + "\n\n" for chunk in chunks) + "data: [DONE]\n\n"
                else:
                    payload = json.dumps({"id": "stub", "object": "chat.completion", "created": 0, "model": "stub-model",
                        "choices": [{"index": 0, "message": message, "finish_reason": finish}], "usage": usage})
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream" if body.get("stream") else "application/json")
                self.send_header("Content-Length", str(len(payload.encode())))
                self.end_headers()
                self.wfile.write(payload.encode())
            except Exception as error:
                handler_errors.append(repr(error))
                save(out / "provider-errors.json", handler_errors)
                self.send_error(500, str(error))

    server = ThreadingHTTPServer(("127.0.0.1", 0), Model)
    server.daemon_threads = False  # Join provider requests that can still issue Flow CLI calls.
    threading.Thread(target=server.serve_forever, daemon=True).start()
    (home / ".omp/agent/models.yml").write_text(f"""providers:
  stub:
    baseUrl: http://127.0.0.1:{server.server_port}/v1
    apiKey: stub-dummy-key
    api: openai-completions
    models:
      - id: stub-model
        name: Stub Model
        input: [text]
        contextWindow: 200000
        maxTokens: 8192
""")
    config = "startup:\n  setupWizard: false\n  showSplash: false\n"
    if args.case == "timeout":
        config += "ask:\n  timeout: 1\n"
    if args.case == "ratchet":
        config += "ratchet:\n  enabled: true\n"
    (home / ".omp/agent/config.yml").write_text(config)
    argv = ["omp", "--no-title", "--model", "stub/stub-model", "--session-dir", str(session_dir)]
    if stock:
        argv[0] = str(Path(shutil.which("omp")).resolve())
        argv += ["--cwd", str(project), "--approval-mode", "yolo", "--no-rules", "--no-context-files",
                 "--no-skills", "--no-extensions", "-e", str(checkout / "plugin")]
    argv += ["Run the disposable Flow questions fixture through the scripted provider."]
    save(out / "launch.json", {"argv": argv, "cwd": str(project), "case": args.case})
    child = master = tern_control = tern_log = None

    def ctl(*words):
        if owned_window:
            if words[0] in ("click", "key", "type"):
                native_tern("clear")
            return json.loads(native_tern("ctl", *words))
        result = subprocess.run(["tern", "ctl", "--control", tern_control, *words],
                                capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError(f"tern ctl {words}: {result.stdout} {result.stderr}")
        value = json.loads(result.stdout)
        if not value.get("ok"):
            raise RuntimeError(f"tern ctl {words}: {value}")
        return value

    def launch_native():
        nonlocal child, master, tern_control, tern_log
        if owned_window:
            ctl("size", "1600", "1000")
            run_omp(ctl("state")["focused"]["id"], argv)
            return
        if args.tern:
            with socket.socket() as free:
                free.bind(("127.0.0.1", 0))
                tern_control = str(free.getsockname()[1])
            tern_env = {**os.environ, "TERN_CONFIG_DIR": str(out / "tern-config")}
            tern_log = (out / "tern.log").open("w")
            child = subprocess.Popen(["tern", "serve", "--control", tern_control, "--out", str(out), str(project)],
                                     env=tern_env, stdout=tern_log, stderr=tern_log)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    ctl("state")
                    break
                except (RuntimeError, json.JSONDecodeError):
                    time.sleep(0.1)
            ctl("size", "1600", "1000")
            launch = "env -i " + " ".join(q(k + "=" + v) for k, v in env.items()) + " " + shlex.join(argv)
            ctl("run", json.dumps(launch))
            save(out / "tern-control.json", {"endpoint": tern_control, "pid": child.pid, "launch": launch})
        else:
            master, slave = pty.openpty()
            try:
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 55, 180, 0, 0))
                child = subprocess.Popen(argv, cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave,
                                         start_new_session=True, preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
            finally:
                os.close(slave)
        with (data / "pids").open("a") as log:
            log.write(f"{child.pid} {'tern' if args.tern else 'omp'} flow-questions {args.case}\n")

    def with_env(args):
        return ["env", *(k + "=" + v for k, v in env.items()), *args]

    def run_omp(pane, args):
        native_tern("tern", "run", pane, shlex.join(with_env(args)))
    captured = bytearray()
    inputs, started = [], time.monotonic()
    refused_call_id = None

    def send(label, value):
        inputs.append({"at_seconds": time.monotonic() - started, "label": label, "bytes_hex": value.hex(),
                       "output_byte_offset": len(captured)})
        save(out / "inputs.json", inputs)
        if args.tern:
            keys = {b"\r": "Enter", b"\x1b": "Escape", b"\x1b[15~": "F5", b" ": "Space", b"\x03": "Ctrl+c",
                    b"n": "n", b"j": "j"}
            if value in keys:
                ctl("key", keys[value])
            else:
                ctl("type", json.dumps(value.decode()))
        else:
            os.write(master, value)
        deadline = time.monotonic() + 0.15
        while time.monotonic() < deadline:
            read_output(0.03)

    def wait_for_text(text, after=0):
        if args.tern:
            text = {"n add note": "Add note", "Space/Enter/n type answer": "Type answer",
                    "n add submit note": "Submit note"}.get(text, text)
        deadline = time.monotonic() + (15 if native else 90)
        while time.monotonic() < deadline:
            if text in plain(captured[after:]):
                return
            if inventory_error:
                raise AssertionError(inventory_error)
            failed = next((m for m in asks() if m.get("isError") and m["toolCallId"] != refused_call_id), None)
            if failed and args.case not in ("cancel", "retry"):
                raise RuntimeError(f"ordinary ask failed before the picker: {failed}")
            read_output(0.1)
            if child is not None and child.poll() is not None:
                raise RuntimeError(f"omp exited before {text!r}")
        raise RuntimeError(f"timed out waiting for {text!r}; inspect terminal.bin and session records")

    def read_output(timeout):
        if args.tern:
            time.sleep(timeout)
            tree = ctl("tree")
            chunk = (json.dumps(tree) + "\n").encode()
            captured.extend(chunk)
            with (out / "terminal.bin").open("ab") as log:
                log.write(chunk)
            (out / "terminal.txt").write_text(plain(captured))
            return
        if select.select([master], [], [], timeout)[0]:
            try:
                chunk = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    return
                raise
            captured.extend(chunk)
            with (out / "terminal.bin").open("ab") as log:
                log.write(chunk)
            (out / "terminal.txt").write_text(plain(captured))

    def native_click(label, node, *modifiers):
        x, y, width, height = node["rect"]
        point = [str(x + min(8, width / 2)), str(y + min(8, height / 2))]
        inputs.append({"at_seconds": time.monotonic() - started, "label": label,
                       "click": point, "modifiers": modifiers, "output_byte_offset": len(captured)})
        save(out / "inputs.json", inputs)
        ctl("click", *point, *modifiers)
        read_output(0.15)

    def click_option(label):
        options = ctl("tree", '[role="listbox"] .sf-act')["nodes"]
        row = next(node for node in options if node.get("text", "").endswith(label))
        native_click(f"click option {label}", row)

    summary = {"ok": False, "case": args.case}

    def panel_nodes():
        return [node for node in ctl("tree", PANEL)["nodes"] if node.get("tag") != "a"] if args.tern else []

    def round_receipt(round_file, require_ask=True):
        # The shell redirect creates the file before the CLI writes it, so only a parsed receipt counts.
        try:
            current = json.loads((out / round_file).read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None
        return current if not require_ask or "ask" in current else None

    def panel_with_picker(name, after=0, round_file="publication.json"):
        # A later round has its own receipt; its question title and fragment differ from the first round's.
        current = round_receipt(round_file)
        if args.tern:
            deadline = time.monotonic() + 30
            while (receipt is None or current is None) and time.monotonic() < deadline:
                read_output(0.1)
                current = round_receipt(round_file)
            assert receipt is not None and current is not None, "No publication receipt before native picker"
        current = current or receipt
        if args.tern:
            wait_for_text(current["ask"]["questions"][0]["question"], after=after)
        else:
            wait_for_text("n add note", after=after)
        if args.case == "offline":
            expected = json.loads((out / "offline-bound.json").read_text())["live"]["error"]
        else:
            expected = current["live"]["url"] + "#" + current["ask"]["questions"][0]["id"]
        wait_for_text(expected, after=after)
        if args.tern:
            # Judge one snapshot taken while panel and picker show together: a timeout case can close both
            # while the screenshot converts.
            deadline = time.monotonic() + 5
            while True:
                tree, panel = ctl("tree"), ctl("tree", PANEL)
                together = ("Flow page" in json.dumps(panel) and expected in json.dumps(panel)
                            and "Add note" in json.dumps(tree))
                if together or time.monotonic() >= deadline:
                    break
                read_output(0.1)
            save(out / f"{name}.tree.json", tree)
            save(out / f"{name}.panel.json", panel)
            save(out / f"{name}.state.json", ctl("state"))
            assert together, "No Flow panel holds the expected text beside the open picker"
            shot = ctl("shot", name)
            subprocess.run(["cwebp", "-lossless", shot["png"], "-o", str(out / f"{name}.webp")], check=True,
                           capture_output=True)
        return expected

    def panel_gone(label):
        if not args.tern:
            return
        for _ in range(50):
            read_output(0.1)
            if not panel_nodes():
                save(out / f"after-{label}.panel.json", ctl("tree", PANEL))
                return
        raise AssertionError(f"Flow panel still shown after {label}")

    def wait_native(label, probe, seconds=8):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = probe()
            if value:
                return value
            if handler_errors:
                raise RuntimeError(handler_errors[0])
            time.sleep(0.15)
        raise AssertionError(f"Timed out waiting for {label}")

    def browser(op, **fields):
        return json.loads(native_tern("tern", "browser", json.dumps({"op": op, **fields})))["ok"]

    def focus(pane):
        native_tern("tern", "focus", pane)
        wait_native(f"pane {pane} focused", lambda: ctl("state")["focused"]["id"] == pane)

    def tern_shot(name):
        native_tern("shot", name)
        for suffix in (".webp", ".layout.json"):
            shutil.copy2(tern_run / (name + suffix), out / (name + suffix))

    def native_target():
        session = (out / "child-session-id.txt").read_text()
        return json.loads(command(["bun", str(cli), "target", "--home", str(home), "--session", session],
                                  "read actual native session target"))

    def launch_follow_peer():
        wait_native("the main session's initial Flow binding", lambda: round_receipt("open.json", require_ask=False), 20)
        a = ctl("state")["focused"]["id"]
        second_argv = [str(follow_session_dir) if arg == str(session_dir) else arg for arg in argv[:-1]]
        b = int(native_tern("tern", "split", a, "down", "--cwd", str(project), "--",
                            *with_env([*second_argv, follow_prompt])).strip())
        focus(b)
        second = wait_native("second session's own CLI binding",
                             lambda: round_receipt(follow_open.name, require_ask=False), 14)
        follow_ready.set()
        focus(a)
        return a, b, second

    def prepare_following(a, b, second):
        url = receipt["live"]["url"]
        assert second["flow"] == receipt["flow"] and second["stage"] != receipt["stage"], second
        inspection = json.loads(native_tern("tern", "inspect", "--json"))
        by_pane = {pane["pane"]: pane for pane in inspection["panes"]}
        headers = {}
        for pane, directory in ((a, session_dir), (b, follow_session_dir)):
            file = Path(by_pane[pane]["omp_session_file"]).resolve()
            assert file.is_relative_to(directory), (file, directory)
            headers[str(pane)] = next(row for row in lines(file) if row["type"] == "session")
        assert headers[str(a)]["id"] == (out / "child-session-id.txt").read_text()
        assert headers[str(a)]["id"] != headers[str(b)]["id"]
        assert any({a, b} <= {block["id"] for block in tab["blocks"]}
                   for session in inspection["sessions"] for tab in session["tabs"]), inspection
        save(out / "native-pane-identities.json", {"inspection": inspection, "session_headers": headers})

        # Focus switches have occurred with no page open. Only the fixture explicitly opens these pages.
        focus(a)
        no_pages = browser("blocks")["blocks"]
        save(out / "follow-no-page.json", no_pages)
        assert not no_pages, no_pages
        own = browser("open", owner=a, how="beside", url=url + "#overview")["block"]
        tab = int(native_tern("tern", "new", "tab").strip())
        focus(tab)
        other = browser("open", owner=tab, how="beside", url=url + "#overview")["block"]
        for block in (own, other):
            browser("release", block=block)

        def check(label, fragment):
            expected = {own: url + "#" + fragment, other: url + "#overview"}
            blocks = wait_native(label, lambda: page_positions() == expected and browser("blocks")["blocks"])
            save(out / f"{label}.blocks.json", blocks)
            save(out / f"{label}.state.json", ctl("state"))
            (out / f"{label}.ls.txt").write_text(native_tern("tern", "ls"))

        def page_positions():
            return {page["block"]: page["url"] for page in browser("blocks")["blocks"]}

        focus(b)
        check("follow-select-second", second["stage"])
        focus(a)
        check("follow-select-first", receipt["stage"])
        browser("goto", block=own, url=url + "#overview")
        browser("release", block=own)
        check("follow-before-form", "overview")
        target = native_target()
        assert target["picker"] is None and target["target"] == url + "#" + receipt["stage"], target
        save(out / "before-form.target.json", target)
        return a, own, check

    def drive_native(following):
        current = receipt["ask"]["questions"]
        panel_link = receipt["live"]["url"] + "#" + current[0]["id"]
        offline = args.case == "native-offline"
        expected = json.loads((out / "offline-bound.json").read_text())["live"]["error"] if offline else panel_link
        wait_for_text(current[0]["question"])
        wait_for_text(expected)
        assert len(asks()) == 1, "Form settled before explicit submit"
        if not offline:
            target = wait_native("the active form's lease", lambda: (row := native_target())["picker"] and row)
            assert target["target"] == panel_link, target
            save(out / "active-form.target.json", target)
            with urlopen(receipt["live"]["url"] + "presence", timeout=5) as response:
                active = json.load(response)["presences"]
            assert len(active) == 1 and active[0]["questions"] == [q["id"] for q in current], active
            save(out / "active-form.presence.json", active)
        if args.tern:
            card = wait_native("native ask card", lambda: ctl("tree", FORM)["nodes"])
            panel = ctl("tree", PANEL)
            assert len(panel_nodes()) == 1 and expected in json.dumps(panel), panel
            assert all(q["question"] in json.dumps(card) for q in current), card
            save(out / "panel.tree.json", ctl("tree"))
            save(out / "panel.panel.json", panel)
            save(out / "active-form.card.json", card)
            save(out / "panel.state.json", ctl("state"))
            tern_shot("panel")

            if following:
                pane, page, check = following
                check("follow-open-form", current[0]["id"])
                browser("goto", block=page, url=receipt["live"]["url"] + "#overview")
                browser("release", block=page)
                check("follow-before-link-click", "overview")
                link = next(node for node in ctl("tree", PANEL + " a")["nodes"] if node.get("text") == panel_link)
                x, y, width, height = link["rect"]
                save(out / "click-target.json", ctl("pick", str(x + min(8, width / 2)), str(y + min(8, height / 2))))
                native_click("click exact Flow panel link", link, "cmd")
                check("click-destination", current[0]["id"])
                assert ctl("state")["focused"]["id"] == page, "Link did not focus the same-tab page"
                tern_shot("clicked-link")
                focus(pane)

            composer = wait_native("native composer", lambda: ctl("tree", COMPOSER)["nodes"])
            assert composer[0]["rect"][1] > panel_nodes()[0]["rect"][1], "Flow panel is not above the composer"
            native_click("focus the composer while the form is open", composer[0])
            focused = wait_native("composer focused while the form waits",
                                  lambda: ctl("tree", COMPOSER + ".focused")["nodes"])
            assert ctl("tree", FORM)["nodes"] and len(asks()) == 1, "Focusing the composer closed the form"
            save(out / "active-form.composer.json", focused)
            inputs.append({"at_seconds": time.monotonic() - started, "label": "return from composer and pick Alpha",
                           "keys": ["Up", "Enter"]})
            save(out / "inputs.json", inputs)
            ctl("key", "Up")
            ctl("key", "Enter")
            submit = next(node for node in ctl("tree", FORM + " .sf-btn-label")["nodes"]
                          if node.get("text") == "Submit")
            native_click("submit one listed choice", submit)
            submitted.set()
            wait_native("native form and panel closed", lambda: not panel_nodes() and not ctl("tree", FORM)["nodes"])
            save(out / "after-submit.tree.json", ctl("tree"))
        else:
            wait_for_text("Submit")
            (out / "active-form.terminal.txt").write_text(plain(captured))
            send("pick the first listed choice", b"\r")
            send("skip the second optional question to focus Submit", b"\t")
            send("submit one listed choice", b"\r")
            submitted.set()
        if not offline:
            settled = wait_native("advisory presence cleared", lambda: (row := native_target())["picker"] is None and row)
            save(out / "settled-form.target.json", settled)
        if following:
            time.sleep(1)
            following[2]("follow-after-close", current[0]["id"])

    def no_native_dialog(label):
        card, panel = ctl("tree", FORM), ctl("tree", PANEL)
        assert not card["nodes"] and not panel["nodes"], (label, card, panel)
        save(out / f"{label}.card.json", card)
        save(out / f"{label}.panel.json", panel)

    def live_presence():
        with urlopen(receipt["live"]["url"] + "presence", timeout=5) as response:
            return json.load(response)["presences"]

    def drive_specialized_dialog(route, before_results):
        ratchet = route == "ratchet"
        wait_native(f"{route} published and checked receipt", lambda: receipt and (out / "live-identity.json").exists(), 20)
        questions = receipt["ask"]["questions"]
        ids = [] if ratchet else [question["id"] for question in questions]
        stage_url = receipt["live"]["url"] + "#" + receipt["stage"]
        link = stage_url if ratchet else receipt["live"]["url"] + "#" + ids[0]
        expected = f"Flow question lookup failed: {read_error}" if read_fault else link
        card = wait_native(f"{route} native card", lambda: ctl("tree", FORM)["nodes"], 18)
        save(out / f"{route}.card.json", card)
        assert all(question["question"] in json.dumps(card) for question in questions), card
        if ratchet:
            assert all(text in json.dumps(card) for text in ("Approve", "Revise", "Abort", "on the Flow page.")), card
        panel = wait_native(f"{route} panel", lambda: (row := ctl("tree", PANEL))["nodes"] and row)
        save(out / f"{route}.panel.json", panel)
        assert expected in json.dumps(panel), panel
        links = ctl("tree", PANEL + " a")
        save(out / f"{route}.links.json", links)
        assert [node["text"] for node in links["nodes"] if node["tag"] == "a"] == ([] if read_fault else [link]), links
        save(out / f"{route}.tree.json", ctl("tree"))
        save(out / f"{route}.state.json", ctl("state"))
        tern_shot(route + "-panel")
        active = wait_native(f"{route} advisory presence", live_presence)
        save(out / f"{route}.presence.json", active)
        assert len(active) == 1 and active[0]["stage"] == receipt["stage"] and active[0]["questions"] == ids, active
        assert active[0]["session"] == (out / "child-session-id.txt").read_text(), active
        assert len(asks()) == before_results and ctl("tree", FORM)["nodes"], "Dialog settled before explicit input"
        if ratchet:
            send("explicitly choose Approve in the Ratchet gate", b"\r")
        else:
            send(f"select Alpha in {route}", b"\r")
            submit = next(node for node in ctl("tree", FORM + " .sf-btn-label")["nodes"] if node["text"] == "Submit")
            native_click(f"explicitly submit {route}", submit)
        wait_native(f"{route} form and panel closed", lambda: not panel_nodes() and not ctl("tree", FORM)["nodes"])
        no_native_dialog(f"after-{route}")
        save(out / f"after-{route}.tree.json", ctl("tree"))
        settled = wait_native(f"{route} presence cleared", lambda: (row := native_target())["picker"] is None and row)
        assert settled["target"] == stage_url and not live_presence(), settled
        save(out / f"after-{route}.target.json", settled)
        save(out / f"after-{route}.presence.json", live_presence())

    def drive_eval_guard():
        deadline = time.monotonic() + 20
        while True:
            no_native_dialog("eval-refusal")
            if result := asks():
                break
            if handler_errors:
                raise RuntimeError(handler_errors[0])
            assert time.monotonic() < deadline, "Eval returned no guard refusal"
            time.sleep(0.15)
        assert len(result) == 1 and result[0]["toolName"] == "eval", result
        refusal = "\n".join(part.get("text", "") for part in result[0]["content"])
        save(out / "eval-guard-refusal.json", result[0])
        assert all(text in refusal for text in ("renamed-control", "not a published question", "ask.html")), refusal
        target = native_target()
        assert target["picker"] is None and not live_presence(), target
        save(out / "eval-refusal.target.json", target)
        refusal_observed.set()

    def observe_ratchet_reuse():
        deadline = time.monotonic() + 15
        while True:
            no_native_dialog("ratchet-reuse")
            assert not live_presence(), "Reused approval opened Picker presence"
            if len(asks()) == 2:
                break
            if handler_errors:
                raise RuntimeError(handler_errors[0])
            assert time.monotonic() < deadline, "Ratchet returned no reused approval"
            time.sleep(0.15)
        save(out / "ratchet-reuse.target.json", native_target())

    try:
        launch_native()
        peer = launch_follow_peer() if owned_window and args.case == "native" else None
        following = None
        if args.case == "tui" or native:
            deadline = time.monotonic() + 30
            while True:
                read_output(0.1)
                if args.tern:
                    tree = ctl("tree")
                    form_visible = ctl("tree", FORM)["nodes"] if native else "Add note" in json.dumps(tree)
                    assert not panel_nodes() and not form_visible, "Renamed control opened a form or Flow panel"
                assert ("A. Alpha" if native else "n add note") not in plain(captured), "Renamed control opened a form"
                if handler_errors:
                    raise RuntimeError(handler_errors[0])
                result = asks()
                if result or time.monotonic() >= deadline:
                    break
            assert len(result) == 1 and result[0].get("isError"), result
            refusal = "\n".join(part.get("text", "") for part in result[0]["content"])
            assert all(text in refusal for text in ('"renamed-control"', "not a published question", "ask.html")), refusal
            refused_call_id = result[0]["toolCallId"]
            save(out / "guard-refusal.json", result[0])
            if args.tern:
                save(out / "guard-refusal.tree.json", tree)
                save(out / "guard-refusal.panel.json", ctl("tree", PANEL))
            if peer:
                following = prepare_following(*peer)
            refusal_observed.set()
        if native:
            drive_native(following)
        elif args.case == "eval":
            drive_eval_guard()
            drive_specialized_dialog("eval", 1)
        elif read_fault:
            drive_specialized_dialog("direct", 0)
            direct_failures = len(failures_path.read_text().splitlines())
            assert direct_failures > 0, "No failed ask-status call during the direct form"
            direct_close_observed.set()
            drive_specialized_dialog("eval", 1)
        elif args.case == "ratchet":
            drive_specialized_dialog("ratchet", 0)
            direct_close_observed.set()
            observe_ratchet_reuse()
        else:
            panel_url = panel_with_picker("panel")
            if args.case != "timeout":
                assert len(asks()) == (1 if args.case == "tui" else 0), "Picker returned before it was shown"
        if args.tern and not stock and args.case not in ("offline", "timeout"):
            before_click = ctl("state")
            save(out / "before-click.state.json", before_click)
            omp_pane = before_click["focused"]["id"]
            save(out / "before-click.system.json", ctl("system"))
            links = ctl("tree", PANEL + " a")
            save(out / "panel-links.json", links)
            link = next(node for node in links["nodes"]
                        if node.get("tag") == "a" and node.get("text") == panel_url)
            x, y, _, _ = link["rect"]
            save(out / "click-target.json", ctl("pick", str(x + 8), str(y + 8)))
            native_click("click exact Flow Markdown link", link)
            deadline = time.monotonic() + 5
            while True:
                destination = ctl("tree", ".kit-web-url")
                after_click = ctl("state")
                if any(node.get("value") == panel_url for node in destination["nodes"]) or time.monotonic() >= deadline:
                    break
                time.sleep(0.1)
            save(out / "after-click.system.json", ctl("system"))
            save(out / "after-click.state.json", after_click)
            save(out / "after-click.tree.json", ctl("tree"))
            save(out / "click-destination.json", destination)
            if not any(node.get("value") == panel_url for node in destination["nodes"]):
                summary["click_error"] = "Native click opened no matching live URL"
            elif after_click["focused"]["id"] == omp_pane:
                summary["click_error"] = "Native click did not focus a separate browser pane"
            else:
                shot = ctl("shot", "clicked-link")
                subprocess.run(["cwebp", "-lossless", shot["png"], "-o", str(out / "clicked-link.webp")], check=True,
                               capture_output=True)
                ctl("close")
            assert ctl("state")["focused"]["id"] == omp_pane, "Picker pane is not focused after the link step"
        if args.case == "abort":
            send("cancel the whole turn while the picker and panel are open", b"\x03")
            panel_gone("abort")
            if args.tern:
                after_abort = ctl("tree")
                save(out / "after-abort.tree.json", after_abort)
                assert "Add note" not in json.dumps(after_abort), "Turn cancellation left the picker open"
            done.set()
        if args.case in ("cancel", "retry", "offline"):
            send("Escape cancels the actual ordinary ask picker", b"\x1b")
            deadline = time.monotonic() + 20
            while not asks() and time.monotonic() < deadline:
                read_output(0.1)
            assert asks() and asks()[-1].get("isError"), "Escape did not produce an aborted ask result"
            cancelled = published_state(receipt)
            save(out / "cancelled-state.json", cancelled)
            assert not recorded_answers(published_stage(cancelled, receipt)), "Cancellation must not record consent"
            panel_gone("cancel")
            if args.case in ("cancel", "offline"):
                done.set()
            else:
                for _ in range(10):
                    read_output(0.1)
                before_retry = len(captured)
                send("F5 native retry of the aborted turn", b"\x1b[15~")
                panel_with_picker("retry-panel", after=before_retry)
        if args.case in ("tui", "retry", "later-round"):
            send("open Alpha option note", b"n")
            wait_for_text("Note for")
            send("type option note", b"fixture-option-note")
            time.sleep(0.15)
            send("save option note", b"\r")
            time.sleep(0.2)
            send("pick Alpha", b" ")
            if args.tern:
                click_option("B. Beta")
            else:
                send("move to Beta", b"j")
                send("pick Beta", b" ")
            send("advance from the multiselect question", b"\r")
            time.sleep(0.2)
            send("move to Other", b"j")
            time.sleep(0.15)
            send("move to Other again", b"j")
            wait_for_text("Space/Enter/n type answer")
            send("open Other editor", b"n")
            wait_for_text("Other answer")
            send("type custom words", b"fixture-custom-concern")
            time.sleep(0.15)
            send("save custom words", b"\r")
            time.sleep(0.2)
            send("advance to submit review", b"\r")
            wait_for_text("n add submit note")
            send("open submit note", b"n")
            time.sleep(0.2)
            send("type submit note", b"fixture-submit-note")
            time.sleep(0.15)
            send("save submit note", b"\r")
            time.sleep(0.2)
            before_submit = len(captured)
            send("submit real picker", b"\r")
            if args.case == "tui" and args.tern:
                panel_gone("submit")
                after_submit = ctl("tree")
                save(out / "after-submit.tree.json", after_submit)
                assert "Add note" not in json.dumps(after_submit), "Submit left the picker open"
        if args.case == "later-round":
            panel_with_picker("later-panel", after=before_submit, round_file="later-publication.json")
            assert len(asks()) == 1, "Later picker returned before it was shown"
            before_later_pick = len(captured)
            send("pick Continue in later round", b"\r")
            deadline = time.monotonic() + 20
            while len(asks()) < 2 and time.monotonic() < deadline:
                read_output(0.1)
                if ("Submit note" if args.tern else "n add submit note") in plain(captured[before_later_pick:]):
                    send("submit later round picker", b"\r")
                    break
        deadline = time.monotonic() + (15 if stock else 90)
        while not done.is_set() and time.monotonic() < deadline:
            read_output(0.1)
            if stock and handler_errors:
                raise RuntimeError(handler_errors[0])
            if child is not None and child.poll() is not None:
                raise RuntimeError("omp exited before fixture completion")
        assert done.is_set(), "provider never reached completion; inspect repeated picker or missing tool result"
        for _ in range(15):
            read_output(0.1)
        panel_gone("completion")
        result = asks()
        flow_messages = [entry for file in session_dir.rglob("*.jsonl") for entry in lines(file)
                         if entry.get("type") == "custom_message" and entry.get("customType") == "vstack-flow"
                         and entry.get("display") is not False]
        save(out / "flow-messages.json", flow_messages)
        assert not flow_messages, "Unsolicited Flow message after question or completion"
        if args.case not in ("cancel", "offline", "abort"):
            completion = next(m for m in reversed(messages()) if m.get("role") == "assistant")
            completion_text = "".join(c.get("text", "") for c in completion.get("content", []) if isinstance(c, dict))
            assert "FLOW_QUESTIONS_FIXTURE_COMPLETE" in completion_text, "Missing terminal completion"
            assert receipt["live"]["url"] not in completion_text, "Completion repeats the Flow link"
        save(out / "tool-results.json", result)
        panel_phrases = ["vstack.flow-panel", receipt["live"]["url"]]
        for file in session_dir.rglob("*.jsonl"):
            assert all(phrase not in file.read_text() for phrase in panel_phrases), "Flow panel leaked into persisted history"
        assert all(phrase not in json.dumps(requests) for phrase in panel_phrases), "Flow panel leaked into model requests"
        assert not handler_errors, handler_errors
        assert inventory_error is None, inventory_error
        if args.case != "abort":
            assert len(result) == (2 if stock or args.case in ("tui", "retry", "later-round") else 1), result
        opened = json.loads((out / "open.json").read_text())
        state = published_state(opened)
        stage = published_stage(state, opened)
        save(out / "persisted-state.json", state)
        later = json.loads((out / "later-publication.json").read_text()) if args.case == "later-round" else None
        assert len(stage["rounds"]) == (2 if later else 1), state
        expected_ids = [q["id"] for q in receipt["ask"]["questions"]]
        if later:
            expected_ids.append(later["ask"]["questions"][0]["id"])
        assert [q["id"] for q in stage["questions"]] == expected_ids, stage
        answers = recorded_answers(stage)
        if native:
            pick = receipt["refs"]["pick"]
            expected_answer = {"status": "answered", "picks": ["A"]}
            assert set(answers) == {pick} and answers[pick]["response"] == expected_answer, answers
            answer_receipt = json.loads((out / "answers-receipt.json").read_text())
            assert state["flow"]["id"] == answer_receipt["flow"] and state["revision"] == answer_receipt["revision"]
            if args.case == "native":
                with urlopen(receipt["live"]["url"] + "content", timeout=5) as response:
                    content = json.load(response)
                save(out / "answered-live-content.json", content)
                assert content["revision"] == state["revision"]
                assert {q["id"]: q["answer"]["response"] for q in content["questions"]
                        if q["stage"] == receipt["stage"] and "response" in q["answer"]} == {pick: expected_answer}
        elif args.case in ("tui", "retry", "later-round"):
            with urlopen(receipt["live"]["url"].rstrip("/") + "/content", timeout=10) as response:
                content = json.load(response)
            save(out / "answered-live-content.json", content)
            results = published_stage(content, receipt)["results"]
            assert [result["title"] for result in results] == ["Disposable picker fixture", "Note on all answers"], results
            note = results[1]
            assert note["shape"] == "document" and [
                block["prose"] for section in note["doc"]["sections"] for block in section["blocks"]
            ] == ["fixture-submit-note"], note
            assert set(answers) == set(expected_ids), answers
            pick, words = (answers[receipt["refs"][ref]] for ref in ("pick", "words"))
            assert pick["response"]["picks"] == ["A", "B"], pick
            assert pick["response"]["text"] == "fixture-option-note", pick
            assert words["response"]["text"] == "fixture-custom-concern", words
            assert words["reading"]["outcome"] == "concern", words
            if later:
                assert answers[later["refs"]["later"]]["response"]["picks"] == ["A"], answers
        else:
            assert [r["id"] for r in stage["results"]] == [receipt["refs"]["fixture"]], stage
            assert not answers, "Picker delivery must not record Flow answers"
            assert state["revision"] == receipt["revision"]
            if args.case == "timeout":
                assert result[0]["details"].get("timedOut") is True, result
            elif args.case == "ratchet":
                assert "FIRST_APPROVAL" in json.dumps(result)
            elif read_fault:
                failures = failures_path.read_text().splitlines()
                assert len(failures) > direct_failures and all("ask-status --session " in call for call in failures), failures
            elif args.case != "abort":
                assert result[0].get("isError"), result
        calls = [c for m in messages() if m.get("role") == "assistant"
                 for c in m.get("content", []) if isinstance(c, dict) and c.get("type") == "toolCall"]
        ask_calls = [c for c in calls if c.get("name") == "ask"]
        save(out / "ask-calls.json", ask_calls)
        if args.case == "ratchet" or args.case == "eval":
            assert not ask_calls, "A separate ordinary ask ran"
        if eval_case:
            eval_calls = [c["arguments"] for c in calls if c.get("name") == "eval"]
            forms = [fixture_ask(receipt)] if read_fault else [renamed_ask(receipt), fixture_ask(receipt)]
            assert eval_calls == [eval_ask(form)["args"] for form in forms], eval_calls
            save(out / "eval-calls.json", eval_calls)
        calls_by_id = {c["id"]: c for c in ask_calls}
        for index, outcome in enumerate(r for r in result if r["toolName"] == "ask"):
            original = calls_by_id[outcome["toolCallId"]]
            expected = (renamed_ask(receipt) if (native or args.case == "tui") and index == 0
                        else fixture_ask(later if later and index == 1 else receipt))
            assert original["arguments"] == expected, "Ask HTML differs from the expected receipt form"
        if args.case == "retry":
            assert result[0].get("isError") and not result[-1].get("isError"), result
        publications = [c for c in calls if c.get("name") == "bash" and
                        str(out / "contribution.json") in c.get("arguments", {}).get("command", "")]
        assert len(publications) == 1, "Retry must not republish the question round"
        session_id = (out / "child-session-id.txt").read_text()
        bound = flow_read("bound")
        binding = bound["binding"]
        assert (binding["session"], binding["agent"], binding["flow"], binding["stage"]) == (
            session_id, "main", opened["flow"], opened["stage"]), binding
        save(out / "binding.json", bound)
        export_flow(state, bound)
        assertions = ["fresh inventory omits flow_ask", "live content matches the committed question identities",
                      "Flow panel text absent from session entries and model requests", "no automatic Flow message or completion link"]
        if args.case != "ratchet" and args.case != "eval":
            assertions.append("ordinary ask sends the receipt's ask.html unchanged")
        if args.case == "tui" or native:
            assertions.append("the renamed control is refused without opening the picker or Flow panel")
        if native:
            assertions.append("one explicit native Submit records only Alpha through a separate CLI contribution")
            if args.case == "native-offline":
                assertions.append("the actual unavailable-host error appears while the native form remains usable")
            else:
                assertions.append("the live panel and advisory lease identify the first asked question")
                if following:
                    assertions.append("selected-session changes, form opening, and the actual panel click move only the existing same-tab page")
                    assertions.append("closing the form clears the lease without moving the page")
        elif args.case == "abort":
            assertions.append("Ctrl+C closes the picker and removes the Flow panel")
        elif args.case == "offline":
            assertions.append("actual host error appears in the Flow panel beside the picker and cancellation grants no consent")
        elif read_fault:
            assertions.append("the unchanged receipt passed the live and ask-status checks before fault injection")
            assertions.append("direct and Eval native forms show the actual read error and each clears its panel and presence")
        elif args.case == "eval":
            assertions.append("Eval refuses the renamed control without a dialog, panel, or presence")
            assertions.append("Eval opens the unchanged receipt with a first-question link and clears panel and presence at settlement")
        elif args.case == "ratchet":
            assertions.append("the fresh approval shows the native gate and Stage link, then clears its panel and presence")
            assertions.append("reused approval opens neither a gate nor a Flow panel, and no ordinary ask runs")
        else:
            assertions.append("Flow panel URL is on screen while the picker is open, with no dismissal step")
            if args.tern and args.case != "timeout":
                assertions.append("native Flow panel link click opens the exact live URL")
        if args.tern:
            assertions.append("Flow panel is gone once the picker closes")
        if args.case in ("tui", "retry", "later-round"):
            assertions.append("picks, option note, and Other words recorded as answers; submit note recorded once as a Document Result")
        if args.case == "retry":
            assertions.append("F5 retry shows a fresh Flow panel and preserves the question identities without republication")
        if args.case == "later-round":
            assertions.append("a new authored round gets a fresh Flow panel and separate answer while preserving earlier history")
        if args.case == "timeout":
            assertions.append("configured timeout remains non-consent")
        assert "click_error" not in summary, summary.get("click_error")
        summary.update(ok=True, flow=opened["flow"],
                       session_id=session_id, stub_requests=len(requests), live=receipt["live"], assertions=assertions,
                       human_consent=False)
    except Exception as error:
        summary["error"] = repr(error)
    finally:
        follow_ready.set()
        refusal_observed.set()
        direct_close_observed.set()
        identity_file = out / "child-session-id.txt"
        if (out / "open.json").exists():
            try:
                opened = json.loads((out / "open.json").read_text())
                state = published_state(opened)
                bound = flow_read("bound")
                save(out / "persisted-state-final.json", state)
                save(out / "binding.json", bound)
                save(out / "tool-results-final.json", asks())
                if not (out / "export").exists():
                    export_flow(state, bound)
            except Exception as error:
                summary.update(ok=False, export_error=repr(error))
        cleanup = {"ok": False, "port": port, "stopped_processes": [], "errors": []}
        summary["cleanup"] = cleanup

        def cleanup_step(label, action):
            try:
                action()
                return True
            except Exception as error:
                cleanup["errors"].append(f"{label}: {error!r}")
                return False

        def stop_child():
            if child.poll() is not None:
                return
            if not args.tern:
                child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)

        def stop_host():
            stop = ["bun", str(cli), "host", "stop", "--home", str(home)]
            if identity_file.exists():
                stop += ["--session", identity_file.read_text(), "--agent", "main"]
            host = json.loads(command(stop, "stop owned Flow host"))["host"]
            cleanup["host_stop"] = host
            if host["state"] != "stopped":
                raise RuntimeError(f"Flow host stop did not report stopped: {host}")

        cleanup_step("stop accepting provider requests", server.shutdown)
        if master is not None:
            cleanup_step("close PTY", lambda: os.close(master))
        if owned_window:
            cleanup_step("quit owned Tern window", lambda: ctl("quit"))
        if child is not None:
            if args.tern and child.poll() is None:
                cleanup_step("quit owned Tern", lambda: ctl("quit"))
            cleanup_step("stop native child", stop_child)
        cleanup_step("join provider requests", server.server_close)
        if tern_log:
            cleanup_step("close Tern log", tern_log.close)
        if competing:
            cleanup_step("stop competing listener", competing.shutdown)
            cleanup_step("close competing listener", competing.server_close)
        # Closing the picker can queue a detached `picker clear`, which can start another host.
        if cleanup_step("stop host clients", lambda: stop_host_clients(home, port, cleanup["stopped_processes"])):
            cleanup_step("authenticate and stop owned Flow host", stop_host)
        if owned_window:
            cleanup_step("stop owned Tern daemon", stop_window)
        cleanup_step("verify Flow shutdown", lambda: verify_host_stopped(home, port, cleanup))
        if stock and not cleanup["errors"]:
            cleanup_step("remove disposable HOME and fixture data", lambda: (shutil.rmtree(outside), shutil.rmtree(data)))
        cleanup["ok"] = not cleanup["errors"]
        if not cleanup["ok"]:
            summary.update(ok=False, cleanup_error="; ".join(cleanup["errors"]))
        save(out / "summary.json", summary)
        print(json.dumps(summary, indent=2))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
