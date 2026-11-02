#!/usr/bin/env python3
"""Drive the real omp-tools picker with a stub fixture or the actual Session model."""
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
    sessions = run / "sessions"
    argv = ["omp", "--no-title", "--model", model, "--thinking", thinking,
            "--approval-mode", "yolo", "--no-rules", "--no-context-files",
            "--no-extensions", "-e", str(checkout / "plugin"), "-e", str(tools),
            "--config", str(config), "--session-dir", str(sessions),
            "--cwd", str(run), prompt.read_text()]
    save(run / "launch.json", {"argv": argv, "session_source": str(source), "model": model,
         "thinking": thinking, "checkout": str(checkout), "omp_tools": str(tools),
         "prompt_sha256": hashlib.sha256(prompt.read_bytes()).hexdigest(),
         "config_sha256": hashlib.sha256(config.read_bytes()).hexdigest(),
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

    def messages():
        return [r["message"] for f in sessions.rglob("*.jsonl") for r in lines(f) if r.get("type") == "message"]

    def send(label, value):
        inputs.append({"at_seconds": time.monotonic() - started, "label": label,
                       "bytes_hex": value.hex(), "output_byte_offset": len(captured)})
        save(run / "inputs.json", inputs)
        os.write(master, value)

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
            calls = [m for m in current if m.get("role") == "toolResult" and m.get("toolName") == "flow_ask"]
            save(run / "tool-results.json", calls)
            text = plain(captured)
            if not controlled and "n add note" in text:
                save(run / "before-picker.json", {"elapsed_seconds": time.monotonic() - started,
                     "link_text_offset": text.find("Flow page:"), "picker_text_offset": text.find("n add note"),
                     "output_bytes": len(captured)})
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
                summary["attempt_statuses"] = [m.get("details", {}).get("status") for m in calls]
                latest = calls[-1].get("details", {})
                if latest.get("status") == "unavailable":
                    summary["unavailable"] = latest
                else:
                    summary.pop("unavailable", None)
                presented = [m for m in calls if m.get("details", {}).get("status") in ("submitted", "cancelled", "chat")]
                if len(presented) > 1:
                    raise RuntimeError("A second picker returned; preserve both frontiers without inventing consent")
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
        summary.update(picker_observed=controlled, flow_ask_results=completed_calls,
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
    parser.add_argument("--omp-tools", required=True, help="omp-tools checkout or installed plugin link")
    parser.add_argument("--run", required=True, help="new Verify run, with no data directory yet")
    parser.add_argument("--case", choices=["tui", "timeout", "missing-picker", "non-tui", "cancelled", "empty"], default="tui")
    parser.add_argument("--prompt", help="Scenario file selects actual Session-model mode, without a stub provider")
    parser.add_argument("--config", help="Actual-model isolation overlay")
    parser.add_argument("--session-source", help="Persistent caller session for model and thinking discovery")
    parser.add_argument("--deadline-seconds", type=int, default=1800)
    args = parser.parse_args()
    if args.prompt:
        if not args.config or args.case not in ("cancelled", "timeout", "empty"):
            parser.error("--prompt requires --config and --case cancelled|timeout|empty")
        return actual_model(args)
    if args.case in ("cancelled", "empty"):
        parser.error("--case cancelled|empty requires an actual-model --prompt and --config")
    checkout, tools, run = (Path(p).resolve() for p in (args.checkout, args.omp_tools, args.run))
    for root, name in [(checkout / "plugin", "vstack"), (tools, "omp-tools")]:
        if json.loads((root / "package.json").read_text())["name"] != name:
            parser.error(f"{root} does not name {name}")
    for binary in ["omp", "bun", "git"]:
        if not shutil.which(binary):
            parser.error(f"missing prerequisite: {binary}")
    out = run / ("flow-ask-" + args.case)
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
    command_log = []

    def command(argv, label):
        result = subprocess.run(argv, cwd=project, env=env, capture_output=True, text=True, timeout=45)
        command_log.append({"argv": argv, "cwd": str(project), "exit": result.returncode,
                            "stdout": result.stdout, "stderr": result.stderr})
        save(out / "commands.json", command_log)
        if result.returncode:
            raise RuntimeError(f"{label} failed: {result.stderr}")
        return result.stdout

    command(["omp", "plugin", "link", str(checkout / "plugin")], "link vstack")
    if args.case != "missing-picker":
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
    save(out / "contribution.json", contribution)
    session_dir = out / "sessions"
    session_dir.mkdir()

    def messages():
        return [entry["message"] for file in session_dir.rglob("*.jsonl") for entry in lines(file)
                if entry.get("type") == "message"]

    def asks():
        return [m for m in messages() if m.get("role") == "toolResult" and m.get("toolName") == "flow_ask"]

    q = shlex.quote
    identity = '--session "$PI_SESSION_ID" --agent main'
    open_command = (f'bun {q(str(cli))} open --skill implement --title "Disposable flow_ask TUI proof" '
                    f'--home "$HOME" {identity} > {q(str(out / "open.json"))} && '
                    f'printf "%s" "$PI_SESSION_ID" > {q(str(out / "child-session-id.txt"))}')
    phase, requests, handler_errors = 0, [], []
    done = threading.Event()

    class Model(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            nonlocal phase
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
                    reply = {"tool": "bash", "args": {"command": open_command}}
                    phase += 1
                elif phase == 1 or (phase == 2 and args.case == "tui"):
                    reply = {"tool": "flow_ask", "args": {"contribution": contribution}}
                    phase += 1
                elif phase == 3 and args.case == "tui":
                    first = asks()[0]["details"]
                    assert first["status"] == "submitted", first
                    committed = json.loads((Path(first["receipt"]["page"]).parent / "data/state.json").read_text())
                    save(out / "committed-before-answers.json", committed)
                    assert not committed["answers"], "flow_ask must not author normalized answers"
                    raw = first["response"]["results"]
                    assert raw[0]["selectedOptions"] == ["A. Alpha", "B. Beta"], raw
                    assert "fixture-option-note" in raw[0].get("note", ""), raw
                    assert raw[1].get("customInput") == "fixture-custom-concern", raw
                    assert "fixture-submit-note" in raw[1].get("note", ""), raw
                    normalized = {"version": 1, "items": [
                        {"kind": "answer", "question": raw[0]["id"], "response": {
                            "status": "answered", "picks": ["A", "B"], "text": raw[0]["note"]}},
                        {"kind": "answer", "question": raw[1]["id"], "response": {
                            "status": "answered", "text": raw[1]["customInput"] + "\n" + raw[1]["note"]},
                         "reading": {"outcome": "concern", "unresolved": "Scripted fixture concern remains unresolved."}}]}
                    save(out / "normalized-answers.json", normalized)
                    reply = {"tool": "bash", "args": {"command":
                        f'bun {q(str(cli))} submit {q(str(out / "normalized-answers.json"))} --home "$HOME" {identity}'}}
                    phase += 1
                else:
                    reply = {"text": "FLOW_ASK_FIXTURE_COMPLETE"}
                    done.set()
                message = {"role": "assistant", "content": reply.get("text")}
                if "tool" in reply:
                    message["tool_calls"] = [{"index": 0, "id": f"fixture_{phase}", "type": "function",
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
    (home / ".omp/agent/config.yml").write_text(config)
    argv = ["omp", "--no-title", "--model", "stub/stub-model", "--session-dir", str(session_dir)]
    if args.case == "non-tui":
        argv += ["--mode", "rpc-ui"]
    else:
        argv += ["Run the disposable Flow picker fixture through the scripted provider."]
    save(out / "launch.json", {"argv": argv, "cwd": str(project), "case": args.case})
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 55, 180, 0, 0))
    child = subprocess.Popen(argv, cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave,
                             start_new_session=True, preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
    os.close(slave)
    with (data / "pids").open("a") as log:
        log.write(f"{child.pid} omp flow-ask {args.case}\n")
    captured = bytearray()
    inputs, started = [], time.monotonic()

    def send(label, value):
        inputs.append({"at_seconds": time.monotonic() - started, "label": label, "bytes_hex": value.hex(),
                       "output_byte_offset": len(captured)})
        save(out / "inputs.json", inputs)
        os.write(master, value)
        deadline = time.monotonic() + 0.15
        while time.monotonic() < deadline:
            read_output(0.03)

    def wait_for_text(text, after=0):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if text in plain(captured[after:]):
                return
            failed = next((m for m in asks() if m.get("isError") or m.get("details", {}).get("status") in ("failed", "unavailable")), None)
            if failed:
                raise RuntimeError(f"flow_ask failed before the picker: {failed}")
            read_output(0.1)
            if child.poll() is not None:
                raise RuntimeError(f"omp exited before {text!r}")
        raise RuntimeError(f"timed out waiting for {text!r}; inspect terminal.bin and session records")

    def read_output(timeout):
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
        if args.case == "non-tui":
            send("RPC prompt, not a TUI proof", (json.dumps({"id": "fixture", "type": "prompt", "message": "Run fixture."}) + "\n").encode())
        if args.case == "tui":
            wait_for_text("n add note")
            text = plain(captured)
            assert 0 <= text.index("Flow page:") < text.index("n add note"), "link did not precede custom picker"
            save(out / "before-picker.json", {"link_text_offset": text.index("Flow page:"),
                 "picker_text_offset": text.index("n add note"), "output_bytes": len(captured)})
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
        save(out / "tool-results.json", result)
        assert not handler_errors, handler_errors
        assert len(result) == (2 if args.case == "tui" else 1), result
        expected = ["submitted", "repeated"] if args.case == "tui" else ["submitted"] if args.case == "timeout" else ["unavailable"]
        assert [m["details"]["status"] for m in result] == expected, result
        opened = json.loads((out / "open.json").read_text())
        folder = Path(opened["page"]).parent
        state = json.loads((folder / "data/state.json").read_text())
        save(out / "persisted-state.json", state)
        if args.case in ("tui", "timeout"):
            receipt = result[0]["details"]["receipt"]
            link = receipt["live"]["url"] if receipt.get("live", {}).get("state") == "serving" else receipt["page"]
            shown = plain(captured)
            assert shown.index("Flow page: " + link) < shown.index("n add note"), "wrong or late Flow link"
            assert result[0]["details"]["response"]["kind"] == "submit"
            assert len(state["rounds"]) == 1 and len(state["questions"]) == 2, state
        if args.case == "tui":
            assert len(state["answers"]) == 2, state
            assert len(state["results"]) == 1 and state["results"][0]["title"] == "Disposable picker fixture", state
            assert state["questions"][0]["description"] == "Full authored context retained on Flow.", state
            assert state["answers"][0]["response"]["picks"] == ["A", "B"], state
            assert "fixture-option-note" in state["answers"][0]["response"]["text"]
            assert "fixture-custom-concern" in state["answers"][1]["response"]["text"]
            assert "fixture-submit-note" in state["answers"][1]["response"]["text"]
            assert state["answers"][1]["reading"]["outcome"] == "concern"
            assert result[0]["details"]["receipt"]["revision"] == result[1]["details"]["receipt"]["revision"]
        elif args.case == "timeout":
            assert not state["answers"], "timed-out defaults must not become Flow answers"
            assert all(item.get("timedOut") is True for item in result[0]["details"]["response"]["results"]), result
        else:
            assert not state["questions"] and not state["answers"], state
            assert "receipt" not in result[0]["details"] and "response" not in result[0]["details"], result
        bindings = [json.loads(file.read_text()) for file in home.glob(".vstack/tmp/*/flow/.bindings/*.json")]
        session_id = (out / "child-session-id.txt").read_text()
        assert any(b["session"] == session_id and b["agent"] == "main" and b["flow"] == opened["flow"] for b in bindings), bindings
        save(out / "bindings.json", bindings)
        shutil.copytree(folder, out / "export")
        summary.update(ok=True, flow=opened["flow"], page=opened["page"], statuses=expected,
                       session_id=session_id, stub_requests=len(requests), live=opened.get("live"),
                       assertions=["real plugin links", "isolated HOME and cwd outside real home", "child session binding",
                       "link before custom picker and keyboard notes" if args.case == "tui" else "timeout stays non-consent" if args.case == "timeout" else "refused without a question commit",
                       "raw host result", "persisted Flow state", "repeat has no second picker" if args.case == "tui" else "no native fallback"])
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
        server.shutdown()
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
