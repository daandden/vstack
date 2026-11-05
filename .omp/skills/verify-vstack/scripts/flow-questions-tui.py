#!/usr/bin/env python3
"""Drive a UI-only Flow popup, ordinary ask, and separate answer recording in native omp."""
import argparse
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import secrets
import select
import shlex
import shutil
import socket
import struct
import subprocess
import tempfile
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--omp-tools", required=True, help="omp-tools checkout or installed plugin link")
    parser.add_argument("--run", required=True, help="new Verify run, with no data directory yet")
    parser.add_argument("--case", choices=["tui", "timeout", "cancel", "retry", "offline", "abort", "ratchet"], default="tui")
    parser.add_argument("--tern", action="store_true", help="drive a separate real Tern renderer and capture native link clicks")
    parser.add_argument("--dismiss", choices=["enter", "escape"], default="enter")
    args = parser.parse_args()
    checkout, tools, run = (Path(p).resolve() for p in (args.checkout, args.omp_tools, args.run))
    for root, name in [(checkout / "plugin", "vstack"), (tools, "omp-tools")]:
        if json.loads((root / "package.json").read_text())["name"] != name:
            parser.error(f"{root} does not name {name}")
    for binary in ["omp", "bun", "git"]:
        if not shutil.which(binary):
            parser.error(f"missing prerequisite: {binary}")
    if args.tern:
        for binary in ["tern", "cwebp"]:
            if not shutil.which(binary):
                parser.error(f"missing prerequisite: {binary}")
    out = run / ("flow-questions-" + args.case)
    out.mkdir(parents=True, exist_ok=False)
    data = run / "data"
    data.mkdir(exist_ok=False)
    while True:
        outside = Path(tempfile.gettempdir()).resolve() / ("vstack-verify-" + secrets.token_hex(3))
        try:
            outside.mkdir()
            break
        except FileExistsError:
            continue
    if outside.is_relative_to(Path.home().resolve()):
        raise RuntimeError("OS temp directory is inside the real home; use TMPDIR outside it")
    (data / "outside").symlink_to(outside, target_is_directory=True)
    home, project = outside / "home", outside / "proj"
    (home / ".omp/agent").mkdir(parents=True)
    project.mkdir()
    (data / "home").symlink_to(home, target_is_directory=True)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": str(home), "TERM": "xterm-256color"}
    with socket.socket() as free:
        free.bind(("127.0.0.1", 0))
        env["VSTACK_FLOW_PORT"] = str(free.getsockname()[1])
    cli = checkout / "plugin/skills/flow-page/scripts/flow-page.ts"
    competing = None
    command_log = []

    def flow_folder(flow):
        for state in home.glob(".vstack/tmp/*/flow/*/data/state.json"):
            if json.loads(state.read_text()).get("flow", {}).get("id") == flow:
                return state.parent.parent
        raise RuntimeError(f"No stored Flow {flow} in the owned home")

    def command(argv, label):
        result = subprocess.run(argv, cwd=project, env=env, capture_output=True, text=True, timeout=45)
        command_log.append({"argv": argv, "cwd": str(project), "exit": result.returncode,
                            "stdout": result.stdout, "stderr": result.stderr})
        save(out / "commands.json", command_log)
        if result.returncode:
            raise RuntimeError(f"{label} failed: {result.stderr}")
        return result.stdout

    command(["omp", "plugin", "link", str(checkout / "plugin")], "link vstack")
    command(["omp", "plugin", "link", str(tools)], "link omp-tools")
    save(out / "identity.json", {"checkout": str(checkout), "omp_tools": str(tools),
         "home": str(home), "project": str(project), "env": env,
         "omp": str(Path(shutil.which("omp")).resolve()),
         "bun": str(Path(shutil.which("bun")).resolve()),
         "plugins": command(["omp", "plugin", "list"], "list plugins")})
    contribution = {"version": 1, "items": [
        {"kind": "result", "shape": "document", "title": "Disposable picker fixture",
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
    if args.case == "ratchet":
        contribution["items"][1]["questions"] = [{
            "ref": "approval", "title": "Approve fixture inputs?",
            "description": "The complete input set is one disposable case with id fixture. This is UI proof, not tuning approval.",
            "needs": [{"need": "Review the complete disposable input set.", "kind": "prose"}],
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
        return [m for m in messages() if m.get("role") == "toolResult" and
                m.get("toolName") == ("eval" if args.case == "ratchet" else "ask")]

    q = shlex.quote
    identity = '--session "$PI_SESSION_ID" --agent main'
    open_command = (f'bun {q(str(cli))} open --skill implement --title "Disposable Flow questions proof" '
                    f'--home "$HOME" {identity} > {q(str(out / "open.json"))} && '
                    f'printf "%s" "$PI_SESSION_ID" > {q(str(out / "child-session-id.txt"))}')
    publish_command = (f'bun {q(str(cli))} submit {q(str(out / "contribution.json"))} '
                       f'--home "$HOME" {identity} > {q(str(out / "publication.json"))}')
    phase, requests, handler_errors = 0, [], []
    inventory_error = None
    receipt = None

    def published_state():
        return json.loads((flow_folder(receipt["flow"]) / "data/state.json").read_text())

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
        required_context = ["Disposable picker fixture", "Fixture evidence, not a real user decision."]
        if args.case != "ratchet":
            required_context += ["Full authored context retained on Flow.", "Compare fixture tradeoffs.", "Use Alpha.", "Use Beta."]
        for context in required_context:
            assert context in authored, context
        save(out / "live-identity.json", {"url": url, "status": status, "content_url": content_url,
             "content_status": content_status, "flow": receipt["flow"],
             "revision": receipt["revision"], "question_ids": [x["id"] for x in receipt["ask"]["questions"]]})
        if args.case == "offline":
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
        if args.case == "ratchet":
            (project / "cases.jsonl").write_text('{"id":"fixture"}\n')
            (project / "harness.ts").write_text("\n")
            (project / "prompt.md").write_text("Disposable approval proof prompt.\n")
            approval = f'await r.approve("inputs", question={receipt["ask"]["questions"][0]["question"]!r}, preview="Review this question on the Flow page.")'
            code = ('import json\nr = ratchet("popup-fixture")\n'
                    'await r.init(cases=["cases.jsonl"], harness=["harness.ts"], change=["prompt.md"])\n'
                    f'print("FIRST_APPROVAL", json.dumps({approval}))\n'
                    f'print("REUSED_APPROVAL", json.dumps({approval}))')
            return {"tool": "eval", "args": {"language": "py", "code": code, "timeout": 120}}
        return {"tool": "ask", "args": receipt["ask"]}
    done = threading.Event()

    class Model(BaseHTTPRequestHandler):
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
                routing = not body.get("tools") and str(last_user.get("content", "")).startswith("Compress into one routing hint")
                if routing:
                    reply = {"text": "Use this tool when its description matches the task."}
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
                    reply = {"tool": "bash", "args": {"command": publish_command}}
                    phase = 2
                elif phase == 2:
                    reply = live_question()
                    phase = 3
                elif phase == 3:
                    result = asks()
                    assert result, "No ordinary ask tool result"
                    raw = result[-1].get("details", {})
                    committed = published_state()
                    save(out / "committed-before-answers.json", committed)
                    assert not committed["answers"], "Ask delivery must not author Flow answers"
                    if args.case == "ratchet":
                        save(out / "ratchet-results.json", result)
                        assert not result[-1].get("isError"), result[-1]
                        output = "\n".join(part.get("text", "") for part in result[-1]["content"])
                        outcomes = {line.split(" ", 1)[0]: json.loads(line.split(" ", 1)[1])
                                    for line in output.splitlines() if line.startswith(("FIRST_APPROVAL ", "REUSED_APPROVAL "))}
                        assert outcomes["FIRST_APPROVAL"] == {"approved": True}, outcomes
                        assert outcomes["REUSED_APPROVAL"] == {"approved": True, "already": True}, outcomes
                        save(out / "ratchet-outcomes.json", outcomes)
                        reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                        done.set()
                    elif args.case in ("tui", "retry"):
                        assert not result[-1].get("isError"), result[-1]
                        answers = raw["results"]
                        assert [a["id"] for a in answers] == [a["id"] for a in receipt["ask"]["questions"]]
                        assert answers[0]["selectedOptions"] == ["A. Alpha", "B. Beta"], raw
                        assert "fixture-option-note" in answers[0].get("note", ""), raw
                        assert answers[1].get("customInput") == "fixture-custom-concern", raw
                        assert raw.get("submitNote") == "fixture-submit-note", raw
                        normalized = {"version": 1, "items": [
                            {"kind": "answer", "question": answers[0]["id"], "response": {
                                "status": "answered", "picks": ["A", "B"], "text": answers[0]["note"]}},
                            {"kind": "answer", "question": answers[1]["id"], "response": {
                                "status": "answered", "text": answers[1]["customInput"] + "\n" + raw["submitNote"]},
                             "reading": {"outcome": "concern", "unresolved": "Scripted fixture concern remains unresolved."}}]}
                        save(out / "normalized-answers.json", normalized)
                        reply = {"tool": "bash", "args": {"command":
                            f'bun {q(str(cli))} submit {q(str(out / "normalized-answers.json"))} --home "$HOME" {identity} > {q(str(out / "answers-receipt.json"))}'}}
                        phase = 4
                    else:
                        assert args.case == "timeout", "Cancellation unexpectedly resumed the model"
                        assert all(item.get("timedOut") is True for item in raw["results"]), raw
                        reply = {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}
                        done.set()
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
    argv = ["omp", "--no-title", "--model", "stub/stub-model", "--session-dir", str(session_dir),
            "Run the disposable Flow questions fixture through the scripted provider."]
    save(out / "launch.json", {"argv": argv, "cwd": str(project), "case": args.case})
    master = None
    tern_control = None
    tern_log = None
    if args.tern:
        with socket.socket() as free:
            free.bind(("127.0.0.1", 0))
            tern_control = str(free.getsockname()[1])
        tern_env = {**os.environ, "TERN_CONFIG_DIR": str(out / "tern-config")}
        tern_log = (out / "tern.log").open("w")
        child = subprocess.Popen(["tern", "serve", "--control", tern_control, "--out", str(out), str(project)],
                                 env=tern_env, stdout=tern_log, stderr=tern_log)

        def ctl(*words):
            result = subprocess.run(["tern", "ctl", "--control", tern_control, *words],
                                    capture_output=True, text=True, timeout=30)
            if result.returncode:
                raise RuntimeError(f"tern ctl {words}: {result.stdout} {result.stderr}")
            value = json.loads(result.stdout)
            if not value.get("ok"):
                raise RuntimeError(f"tern ctl {words}: {value}")
            return value

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
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 55, 180, 0, 0))
        child = subprocess.Popen(argv, cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave,
                                 start_new_session=True, preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
        os.close(slave)
    with (data / "pids").open("a") as log:
        log.write(f"{child.pid} {'tern' if args.tern else 'omp'} flow-questions {args.case}\n")
    captured = bytearray()
    inputs, started = [], time.monotonic()

    def send(label, value):
        inputs.append({"at_seconds": time.monotonic() - started, "label": label, "bytes_hex": value.hex(),
                       "output_byte_offset": len(captured)})
        save(out / "inputs.json", inputs)
        if args.tern:
            keys = {b"\r": "Enter", b"\x1b": "Escape", b"\x1b[15~": "F5", b" ": "Space", b"\x03": "Ctrl+c"}
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
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if text in plain(captured[after:]):
                return
            if inventory_error:
                raise AssertionError(inventory_error)
            failed = next((m for m in asks() if m.get("isError")), None)
            if failed and args.case not in ("cancel", "retry"):
                raise RuntimeError(f"ordinary ask failed before the picker: {failed}")
            read_output(0.1)
            if child.poll() is not None:
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

    summary = {"ok": False, "case": args.case}
    try:
        wait_for_text("Enter or Esc: continue to the questions")
        popup_text = plain(captured)
        if args.case == "offline":
            unavailable = json.loads((out / "offline-bound.json").read_text())
            assert unavailable["live"]["error"] in popup_text
        else:
            assert receipt["live"]["url"] in popup_text
        assert not asks(), "Picker returned before popup dismissal"
        assert ("Add note" if args.tern else "n add note") not in popup_text, "Picker opened before popup dismissal"
        if args.tern:
            popup_tree = ctl("tree")
            save(out / "popup.tree.json", popup_tree)
            save(out / "popup.state.json", ctl("state"))
            shot = ctl("shot", "popup")
            subprocess.run(["cwebp", "-lossless", shot["png"], "-o", str(out / "popup.webp")], check=True,
                           capture_output=True)
            if args.case != "offline":
                save(out / "before-click.system.json", ctl("system"))
                link = next(node for node in ctl("tree", ".sf-overlay a")["nodes"]
                            if node.get("tag") == "a" and node.get("text") == receipt["live"]["url"])
                x, y, _, _ = link["rect"]
                save(out / "click-target.json", ctl("pick", str(x + 8), str(y + 8)))
                ctl("click", str(x + 8), str(y + 8))
                time.sleep(0.3)
                save(out / "after-click.system.json", ctl("system"))
                save(out / "after-click.state.json", ctl("state"))
                save(out / "after-click.tree.json", ctl("tree"))
                destination = ctl("tree", ".kit-web-url")
                save(out / "click-destination.json", destination)
                assert any(node.get("value") == receipt["live"]["url"] for node in destination["nodes"]), "Native click opened no matching live URL"
                shot = ctl("shot", "clicked-link")
                subprocess.run(["cwebp", "-lossless", shot["png"], "-o", str(out / "clicked-link.webp")], check=True,
                               capture_output=True)
                ctl("close")
        if args.case == "abort":
            before_abort = len(captured)
            send("cancel the whole turn while the popup is open", b"\x03")
            for _ in range(20):
                read_output(0.1)
            assert ("Add note" if args.tern else "n add note") not in plain(captured[before_abort:]), "Cancelled turn opened a picker"
            if args.tern:
                after_abort = ctl("tree", ".sf-overlay")
                save(out / "after-abort.tree.json", after_abort)
                assert after_abort["count"] == 0, "Turn cancellation left the popup open"
            done.set()
        else:
            send("dismiss Flow popup with " + args.dismiss, b"\r" if args.dismiss == "enter" else b"\x1b")
            wait_for_text("n add note")
            save(out / "before-picker.json", {"popup_url": receipt["live"]["url"], "dismiss": args.dismiss,
                 "picker_after_dismissal": True, "output_bytes": len(captured)})
            if args.tern:
                save(out / "picker.tree.json", ctl("tree"))
                shot = ctl("shot", "picker")
                subprocess.run(["cwebp", "-lossless", shot["png"], "-o", str(out / "picker.webp")], check=True,
                               capture_output=True)
        if args.case == "ratchet":
            send("pick native Ratchet approval", b"\r")
            time.sleep(0.2)
            send("submit native Ratchet approval", b"\r")
        if args.case in ("cancel", "retry", "offline"):
            send("Escape cancels the actual ordinary ask picker", b"\x1b")
            deadline = time.monotonic() + 20
            while not asks() and time.monotonic() < deadline:
                read_output(0.1)
            assert asks() and asks()[-1].get("isError"), "Escape did not produce an aborted ask result"
            cancelled = published_state()
            save(out / "cancelled-state.json", cancelled)
            assert not cancelled["answers"], "Cancellation must not record consent"
            if args.case in ("cancel", "offline"):
                done.set()
            else:
                for _ in range(10):
                    read_output(0.1)
                before_retry = len(captured)
                send("F5 native retry of the aborted turn", b"\x1b[15~")
                wait_for_text("Enter or Esc: continue to the questions", after=before_retry)
                send("dismiss fresh retry popup with Escape", b"\x1b")
                wait_for_text("n add note", after=before_retry)
        if args.case in ("tui", "retry"):
            send("open Alpha option note", b"n")
            wait_for_text("Note for")
            send("type option note", b"fixture-option-note")
            time.sleep(0.15)
            send("save option note", b"\r")
            time.sleep(0.2)
            send("pick Alpha", b" ")
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
            send("submit real picker", b"\r")
        deadline = time.monotonic() + 90
        while not done.is_set() and time.monotonic() < deadline:
            read_output(0.1)
            if child.poll() is not None:
                raise RuntimeError("omp exited before fixture completion")
        assert done.is_set(), "provider never reached completion; inspect repeated picker or missing tool result"
        for _ in range(15):
            read_output(0.1)
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
        popup_phrases = ["Questions are on the Flow page:", "Enter or Esc: continue to the questions", receipt["live"]["url"]]
        for file in session_dir.rglob("*.jsonl"):
            assert all(phrase not in file.read_text() for phrase in popup_phrases), "Popup leaked into persisted history"
        assert all(phrase not in json.dumps(requests) for phrase in popup_phrases), "Popup leaked into model requests"
        assert not handler_errors, handler_errors
        assert inventory_error is None, inventory_error
        if args.case != "abort":
            assert len(result) == (2 if args.case == "retry" else 1), result
        opened = json.loads((out / "open.json").read_text())
        folder = flow_folder(opened["flow"])
        state = published_state()
        save(out / "persisted-state.json", state)
        assert len(state["rounds"]) == 1 and len(state["questions"]) == len(receipt["ask"]["questions"]), state
        assert len(state["results"]) == 1 and state["results"][0]["title"] == "Disposable picker fixture", state
        if args.case in ("tui", "retry"):
            assert len(state["answers"]) == 2, state
            assert state["answers"][0]["response"]["picks"] == ["A", "B"], state
            assert "fixture-option-note" in state["answers"][0]["response"]["text"]
            assert "fixture-custom-concern" in state["answers"][1]["response"]["text"]
            assert "fixture-submit-note" in state["answers"][1]["response"]["text"]
            assert state["answers"][1]["reading"]["outcome"] == "concern"
        else:
            assert not state["answers"], "Cancellation and timeout must not become Flow answers"
            assert state["revision"] == receipt["revision"]
            if args.case == "timeout":
                assert all(item.get("timedOut") is True for item in result[0]["details"]["results"]), result
            elif args.case == "ratchet":
                assert "FIRST_APPROVAL" in json.dumps(result)
            elif args.case != "abort":
                assert result[0].get("isError"), result
        calls = [c for m in messages() if m.get("role") == "assistant"
                 for c in m.get("content", []) if isinstance(c, dict) and c.get("type") == "toolCall"]
        ask_calls = [c for c in calls if c.get("name") == "ask"]
        save(out / "ask-calls.json", ask_calls)
        calls_by_id = {c["id"]: c for c in ask_calls}
        for outcome in ([] if args.case in ("ratchet", "abort") else result):
            original = calls_by_id[outcome["toolCallId"]]
            assert original["arguments"] == receipt["ask"], "Retry changed the original question identities"
        if args.case == "retry":
            assert result[0].get("isError") and not result[-1].get("isError"), result
        publications = [c for c in calls if c.get("name") == "bash" and
                        str(out / "contribution.json") in c.get("arguments", {}).get("command", "")]
        assert len(publications) == 1, "Retry must not republish the question round"
        bindings = [json.loads(file.read_text()) for file in home.glob(".vstack/tmp/*/flow/.bindings/*.json")]
        session_id = (out / "child-session-id.txt").read_text()
        assert any(b["session"] == session_id and b["agent"] == "main" and b["flow"] == opened["flow"] for b in bindings), bindings
        save(out / "bindings.json", bindings)
        shutil.copytree(folder, out / "export")
        assertions = ["fresh inventory omits flow_ask", "live content matches the committed question identities",
                      "popup text absent from session entries and model requests", "no automatic Flow message or completion link"]
        if args.case != "ratchet":
            assertions.append("ordinary ask retains the receipt's original question identities")
        if args.case == "abort":
            assertions.append("Ctrl+C removes the popup and opens no picker")
        elif args.case == "offline":
            assertions.append("actual host error appears before dismissal and picker cancellation grants no consent")
        else:
            assertions.append("popup URL precedes the original picker after user dismissal")
            if args.tern:
                assertions.append("native popup link click opens the exact live URL")
        if args.case in ("tui", "retry"):
            assertions.append("explicit picks, option note, Other words and submit note recorded separately through CLI")
        if args.case == "retry":
            assertions.append("F5 retry shows a fresh popup and preserves the question identities without republication")
        if args.case == "timeout":
            assertions.append("configured timeout remains non-consent")
        if args.case == "ratchet":
            assertions.append("native Ratchet approval is reused without a second gate")
        summary.update(ok=True, flow=opened["flow"], folder=str(folder),
                       session_id=session_id, stub_requests=len(requests), live=receipt["live"], assertions=assertions)
    except Exception as error:
        summary["error"] = repr(error)
    finally:
        identity_file = out / "child-session-id.txt"
        if (out / "open.json").exists():
            try:
                opened = json.loads((out / "open.json").read_text())
                folder = flow_folder(opened["flow"])
                save(out / "persisted-state-final.json", json.loads((folder / "data/state.json").read_text()))
                save(out / "tool-results-final.json", asks())
                if not (out / "export").exists():
                    shutil.copytree(folder, out / "export")
            except Exception as error:
                summary.update(ok=False, export_error=repr(error))
        if competing:
            competing.shutdown()
            competing.server_close()
        if master is not None:
            os.close(master)
        if args.tern:
            try:
                ctl("quit")
            except Exception as error:
                summary.update(ok=False, tern_cleanup_error=repr(error))
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        server.shutdown()
        if tern_log:
            tern_log.close()
        server.server_close()
        try:
            stop = ["bun", str(cli), "host", "stop", "--home", str(home)]
            identity_file = out / "child-session-id.txt"
            if identity_file.exists():
                stop += ["--session", identity_file.read_text(), "--agent", "main"]
            command(stop, "stop owned Flow host")
        except Exception as error:
            summary.update(ok=False, cleanup_error=repr(error))
        save(out / "summary.json", summary)
        print(json.dumps(summary, indent=2))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
