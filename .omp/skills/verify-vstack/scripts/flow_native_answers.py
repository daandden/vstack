import base64
import hashlib
import json
import re
import shlex
from threading import Event
import time
from urllib.request import urlopen


MIXED_WORDS = "A. Loc"
CONCERN_WORDS = "A. Alpha"
NOTE = "Fixture Note"
PASTE_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


def question(ref, title, labels, *, multi=False):
    return {"ref": ref, "title": title, "multi": multi,
            "description": f"Compare {labels[0]} and {labels[1]} for this disposable fixture.",
            "brief": {"unblocks": f"Record the submitted value for {ref}.",
                      "undo": f"Use a new session to submit a different value for {ref}.",
                      "ask_reason": "explicit-decision-required",
                      "evidence_checked": f"The authored fixture for {ref} provides {labels[0]} and {labels[1]}. The driver checks what the picker returns.",
                      "no_recommendation": f"The driver exercises {ref} without an initial selection."},
            "needs": [{"need": f"See the alternatives for {ref}.", "kind": "prose"}],
            "options": [{"label": label, "does": f"Use {label} for {ref}.",
                         "gains": [f"Change to {label} for {ref}."],
                         "costs": [f"Leave the other {ref} alternatives unused after choosing {label}."]}
                        for label in labels]}


def response(picks, text=None):
    return {"status": "answered", **({"picks": picks} if picks else {}),
            **({"text": text} if text is not None else {})}


def decode_user_answers(result):
    blocks = (result or {}).get("content") or []
    header = "User answers:\n"
    text = blocks[0].get("text", "") if blocks else ""
    if not text.startswith(header):
        return None
    try:
        values, _ = json.JSONDecoder().raw_decode(text[len(header):])
    except ValueError:
        return None
    return values if isinstance(values, dict) else None


def submitted_values(result, submitted):
    if not submitted or not result or result.get("isError") or (result.get("details") or {}).get("timedOut"):
        return None
    return decode_user_answers(result)


def click_point(rect):
    x, y, width, height = rect
    return str(x + min(8, width / 2)), str(y + min(8, height / 2))


def answer_responses(receipt, result, submitted, *, other=None):
    data = submitted_values(result, submitted)
    if not data:
        return {}
    responses = {}
    for question in receipt["ask"]["questions"]:
        ident = question["id"]
        values = data.get(ident, [])
        values = [values] if isinstance(values, str) else list(values) if isinstance(values, list) else []
        picks, words = [], []
        explicit_other = (other or {}).get(ident)
        if explicit_other:
            last_other_index = next((i for i in reversed(range(len(values))) if values[i] == explicit_other), None)
            if last_other_index is not None:
                del values[last_other_index]
        options = {option["label"]: chr(ord("A") + i) for i, option in enumerate(question["options"])}
        for value in values:
            if not isinstance(value, str):
                continue
            if value in options:
                if options[value] not in picks:
                    picks.append(options[value])
            elif value.strip():
                words.append(value)
        if explicit_other:
            words.append(explicit_other)
        if picks or words:
            responses[ident] = response(picks, "\n".join(words) if words else None)
    return responses


def check_matcher(receipt, observed, save):
    alpha, multi, concern = (receipt["refs"][ref] for ref in ("listed", "multi", "concern"))
    def result(data):
        return {**observed, "content": [{"type": "text", "text": "User answers:\n" + json.dumps(data)}]}
    fixtures = [
        ("deduplicated-list", result({multi: ["A. Local", "A. Local", "B. Shared"]}), True, {},
         {multi: response(["A", "B"])}),
        ("marked-other", result({alpha: "A. Alpha"}), True, {alpha: "A. Alpha"},
         {alpha: response([], "A. Alpha")}),
        ("picked-and-marked", result({multi: ["A. Local", "A. Local"]}), True, {multi: "A. Local"},
         {multi: response(["A"], "A. Local")}),
        ("exact-only-own-question", result({multi: ["A. Loc"], concern: "A. Alpha"}), True, {},
         {multi: response([], "A. Loc"), concern: response([], "A. Alpha")}),
        ("timed-out-default", {**result({alpha: "A. Alpha"}), "details": {"timedOut": True}}, True, {}, {}),
        ("interruption", {"isError": True, "content": [{"text": "Ask interrupted by message"}]}, False, {}, {}),
        ("cancelled", {"isError": True, "content": [{"text": "Ask tool was cancelled by the user"}]}, False, {}, {}),
        ("empty", result({alpha: ""}), True, {}, {}),
        ("headless-default", result({alpha: "A. Alpha"}), False, {}, {}),
        ("tool-error-with-values", {**result({alpha: "A. Alpha"}), "isError": True}, True, {}, {}),
        ("missing", None, False, {}, {}),
    ]
    outcomes = []
    for name, raw, submitted, other, expected in fixtures:
        outcome = answer_responses(receipt, raw, submitted, other=other)
        assert outcome == expected, (name, outcome, expected)
        outcomes.append({"fixture": name, "explicit_submit": submitted, "explicit_other": other, "responses": outcome})
    save(outcomes)


def option_note(result, question, project, out):
    note, = result["details"]["notes"]
    assert note["name"] == question and note["option"] == "A. Alpha" and note["value"] == "A. Alpha", note
    assert NOTE in note["text"] and re.search(r"\[Image #1(?:, [^\]]+)?\]", note["text"]), note
    image, = (block for block in result["content"] if block["type"] == "image")
    suffix = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[image["mimeType"]]
    name = f"returned-native-note.{suffix}"
    raw = base64.b64decode(image["data"], validate=True)
    (out / name).write_bytes(raw)
    captured = project / name
    captured.write_bytes(raw)
    return note["text"], raw, [
        {"kind": "attachment", "ref": "note-image", "type": "image", "path": str(captured),
         "caption": "Image returned with the Alpha Note", "origin": f"native ask {result['toolCallId']}, image #1"},
        {"kind": "result", "ref": "option-note", "shape": "document", "title": "Native selected-option Note",
         "sections": [{"heading": "A. Alpha", "blocks": [
             {"prose": f"[View question](#{question})"}, {"code": note["text"]}, {"figure": "note-image"}]}]},
    ]


def initial_questions():
    return [question("listed", "Which listed path should the form record?", ["Alpha", "Beta"]),
            question("multi", "Which two scopes should the form record?", ["Local", "Shared"], multi=True),
            question("concern", "Which approach addresses the concern?", ["Proceed", "Pause"])]


class NativeAnswers:
    def __init__(self, out, project, cli, identity, save, asks, stage, state):
        self.out, self.project, self.cli, self.identity = out, project, cli, identity
        self.save, self.asks, self.stage, self.state = save, asks, stage, state
        self.reading = {"outcome": "concern", "unresolved": "Whether either approach addresses the fixture concern."}
        self.expected = {}
        self.submits = (Event(), Event())
        self.second = None
        self.note = None

    def write(self, file, items):
        self.save(self.out / file, {"version": 1, "items": items})

    def read(self, file):
        return json.loads((self.out / file).read_text())

    def submit(self, file, receipt):
        return {"tool": "bash", "args": {"command": f"bun {shlex.quote(str(self.cli))} submit "
                f'{shlex.quote(str(self.out / file))} --home "$HOME" {self.identity}'
                f" > {shlex.quote(str(self.out / receipt))}"}}

    def live(self, receipt, file):
        with urlopen(receipt["live"]["url"].rstrip("/") + "/content", timeout=5) as result:
            content = json.load(result)
        self.save(self.out / file, content)
        assert content["flow"]["id"] == receipt["flow"] and content["revision"] == receipt["revision"], content
        return content

    def observe(self, receipt, index, expected_raw):
        submitted = self.submits[index].wait(timeout=2)
        assert submitted, "The controller did not explicitly Submit this native form"
        result = self.asks()[index]
        self.save(self.out / f"native-{index}-result.json", result)
        assert submitted_values(result, submitted) == expected_raw, result
        items = []
        for ident, answer in answer_responses(receipt, result, submitted).items():
            item = {"kind": "answer", "question": ident, "response": answer}
            if "picks" not in answer:
                assert ident == receipt["refs"]["concern"], answer
                item["reading"] = self.reading
            items.append(item)
        if index == 0:
            check_matcher(receipt, result, lambda rows: self.save(self.out / "synthetic-matcher-fixtures.json", rows))
            if (result.get("details") or {}).get("notes"):
                self.note = option_note(result, receipt["refs"]["listed"], self.project, self.out)
                items.extend(self.note[2])
        self.write(f"native-{index}-answers.json", items)
        return self.submit(f"native-{index}-answers.json", f"native-{index}-recorded.json")

    def readback(self, receipt, index):
        recorded = self.read(f"native-{index}-recorded.json")
        current = self.state(receipt)
        assert current["revision"] == recorded["revision"], current
        view = self.live({**receipt, "revision": recorded["revision"]}, f"native-{index}-recorded-content.json")
        self.save(self.out / f"native-{index}-show.json", current)
        from_cli = self.stage(current, receipt)["questions"]
        from_live = [q for q in view["questions"] if q["stage"] == receipt["stage"]]
        for questions in (from_cli, from_live):
            outcomes = {q["id"]: {k: v for k, v in q["answer"].items() if k in ("response", "reading")}
                        for q in questions if "response" in q["answer"]}
            assert outcomes == self.expected, {"observed": outcomes, "expected": self.expected}
        if index == 0:
            assert self.note is not None, "Native ask returned no selected-option Note and image"
            note, raw, _ = self.note
            attachment = recorded["refs"]["note-image"]
            result = recorded["refs"]["option-note"]
            cli_asset = next(a for a in current["attachments"] if a["id"] == attachment)
            live_note = next(r for r in self.stage(view, receipt)["results"] if r["id"] == result)
            qid = receipt["refs"]["listed"]
            blocks = live_note["doc"]["sections"][0]["blocks"]
            assert f"](#{qid})" in blocks[0]["prose"] and blocks[1]["code"] == note, live_note
            assert self.stage(current, receipt)["results"][-1]["attachments"] == [attachment], current
            url = receipt["live"]["url"].rstrip("/") + "/" + cli_asset["file"]
            with urlopen(url, timeout=5) as asset:
                got = asset.read()
            assert got == raw, "Flow served different bytes than the native ask result"
            self.save(self.out / "native-note-attachment.json", {"sha256": hashlib.sha256(got).hexdigest(),
                       "bytes": len(got), "attachment": attachment, "result": result, "question": qid, "url": url})
        return current, view

    def provider(self, phase, receipt, done):
        if phase == 3:
            ids = receipt["refs"]
            self.expected = {ids["listed"]: {"response": response(["A"])},
                             ids["multi"]: {"response": response(["A", "B"], MIXED_WORDS)},
                             ids["concern"]: {"response": response([], CONCERN_WORDS), "reading": self.reading}}
            return self.observe(receipt, 0, {ids["listed"]: "A. Alpha", ids["multi"]: ["A. Local", "B. Shared", MIXED_WORDS],
                                             ids["concern"]: CONCERN_WORDS}), 4
        if phase == 4:
            self.readback(receipt, 0)
            self.write("native-second-round.json", [{"kind": "round", "now": "The first form's answers are recorded.",
                "questions": [question("typed", "Which path should typed Other record?", ["Alpha", "Beta"])]}])
            return self.submit("native-second-round.json", "native-second-receipt.json"), 5
        if phase == 5:
            self.second = self.read("native-second-receipt.json")
            self.live(self.second, "native-second-content.json")
            return {"tool": "ask", "args": {"html": self.second["ask"]["html"]}}, 6
        if phase == 6:
            typed = self.second["refs"]["typed"]
            self.expected[typed] = {"response": response(["A"])}
            return self.observe(self.second, 1, {typed: "A. Alpha"}), 7
        if phase == 7:
            self.readback(self.second, 1)
        done.set()
        return {"text": "FLOW_QUESTIONS_FIXTURE_COMPLETE"}, 8

    def drive(self, ctl, click, wait, shot):
        form = '[data-role="omp.ask.card"]'

        def nodes(css):
            return ctl("tree", css)["nodes"]

        def visible(css, text):
            matches = [node for node in nodes(css) if node.get("text") == text
                       and node["rect"][2] > 0 and node["rect"][3] > 0]
            return matches[0] if len(matches) == 1 else None

        def action(text):
            node = wait(text, lambda: visible(form + " .sf-btn-label", text))
            click(text, node)

        def capture(name):
            self.save(self.out / f"{name}.tree.json", ctl("tree"))
            shot(name)

        option = form + ' [role="listbox"] [role="option"] .sf-item-label'

        def pick(text):
            previous_rect = None

            def stable_hittable_option():
                nonlocal previous_rect
                node = visible(option, text)
                if not node:
                    previous_rect = None
                    return None
                rect = node["rect"]
                unchanged = rect == previous_rect
                previous_rect = rect
                if not unchanged:
                    return None
                hit = ctl("pick", *click_point(rect))
                if hit.get("rect") == rect and "sf-item-label" in hit.get("path", "").split(">")[-1].split("."):
                    return node
                return None

            click(text, wait(f"stable, hittable option {text}", stable_hittable_option))

        def expand(title, first_option):
            node = wait(title, lambda: visible(option, first_option) or next(
                (row for row in nodes(form + ' [title="Answer this question"]') if title in row.get("text", "")), None))
            if node.get("text") != first_option:
                click(title, node)

        def other(words, *, advance=True):
            pick("Other…")
            wait("focused Other input", lambda: nodes(form + " .sf-input.focused"))
            ctl("type", json.dumps(words))
            time.sleep(0.25)
            if advance:
                ctl("key", "Enter")

        def submit(index):
            self.save(self.out / f"native-{index}-active-tree.json", ctl("tree", form))
            shot(f"native-{index}-active")
            action("Submit")
            self.submits[index].set()

        pick("A. Alpha")
        action("Note")
        wait("focused selected-option Note", lambda: nodes(form + " .sf-editor.focused"))
        ctl("type", json.dumps(NOTE))
        paste = self.project / "paste-fixture.png"
        paste.write_bytes(base64.b64decode(PASTE_IMAGE))
        ctl("clipboard", "flavor", "public.png", str(paste))
        ctl("key", "Meta+v")
        self.save(self.out / "native-note-editor.json", ctl("tree", form))
        shot("native-note-editor")
        action("Save")
        ctl("clipboard", "clear")
        expand("Which two scopes should the form record?", "A. Local")
        pick("A. Local")
        pick("B. Shared")
        other(MIXED_WORDS)
        expand("Which approach addresses the concern?", "A. Proceed")
        other(CONCERN_WORDS)
        submit(0)
        wait("second native form", lambda: self.second and visible(".sf-text", self.second["ask"]["questions"][0]["question"]))
        other("A. Alpha", advance=False)
        submit(1)

        def drive_history():
            def settled():
                return not nodes(form) and not nodes('[data-role="vstack.flow-panel"]')

            wait("second answered Flow record", lambda: (self.out / "native-1-show.json").exists() and settled())
            before = self.read("native-1-show.json")
            typed = self.second["refs"]["typed"]
            ctl("type", json.dumps("/tree"))
            ctl("key", "Enter")

            wait("native Session tree", lambda: visible(".sf-picker .t", "Session tree"))
            q_number = self.second["ask"]["questions"][0]["question"].split()[0]
            tree_entry = wait("second ask result in the native Session tree", lambda: next(
                (node for node in nodes(".sf-picker .sf-t-muted")
                 if node.get("text", "").startswith("[ask:") and f"<legend>{q_number}" in node["text"]), None))
            click("select second ask result in /tree", tree_entry)
            capture("native-history-selector")
            click("switch to the selected ask result", wait("Session tree Switch", lambda: visible(".sf-picker .lbl", "Switch")))
            wait("native history re-answer form", lambda: visible(form + " .sf-text", self.second["ask"]["questions"][0]["question"]))
            assert not nodes('[data-role="vstack.flow-panel"]'), "History re-answer opened an authoring panel"
            pick("B. Beta")
            capture("native-history-form")
            action("Submit")
            history = wait("new native history result", lambda: self.asks()[2] if len(self.asks()) == 3 else None)
            assert submitted_values(history, True) == {typed: "B. Beta"}, history
            self.save(self.out / "native-history-result.json", history)
            wait("history form closed", settled)
            capture("native-history-settled")
            after = self.state(self.second)
            self.save(self.out / "native-history-show.json", after)
            prior_content = self.read("native-1-recorded-content.json")
            after_content = self.live({**self.second, "revision": before["revision"]}, "native-history-content.json")
            assert after == before and after_content["questions"] == prior_content["questions"], after
            assert after_content["stages"] == prior_content["stages"], after_content
            note_asset = self.read("native-note-attachment.json")
            with urlopen(note_asset["url"], timeout=5) as result:
                assert result.read() == self.note[1], "Native history re-answer changed the Flow attachment"

        return drive_history
