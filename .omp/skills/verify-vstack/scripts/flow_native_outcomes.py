import json
from urllib.request import urlopen

from flow_native_answers import answer_responses, decode_user_answers, question, submitted_values


REQUIRED = {"html": '<form><fieldset><legend>Required fixture field</legend>'
            '<input type="text" name="required-fixture" required></fieldset></form>'}
REQUIRED_TIMEOUT = "The ask timed out before the user answered its required fields; no answer was given."
TIMEOUT_VALUES = "No answer before the timeout; submitted the form's current values:\n"
INTERRUPTED = "Ask interrupted by message. Answers the user gave before it:\n"
CANCELLED = "Ask tool was cancelled by the user"
CONTINUE = "Continue the disposable question fixture."
STEER = "Set this fixture decision aside and continue without an answer."
CASES = ("abort", "cancel", "empty", "interrupted", "later-round", "required-timeout", "retry", "timeout")


def result_text(raw):
    return raw["content"][0]["text"] if raw and raw.get("content") else ""


def non_consent(raw, *, submitted_empty=False, headless=False):
    text = result_text(raw)
    if raw and raw.get("isError"):
        return ("cancelled", {}) if text == CANCELLED else (None, {})
    if raw and (raw.get("details") or {}).get("timedOut"):
        if text == REQUIRED_TIMEOUT:
            return "timed-out", {}
        assert text.startswith(TIMEOUT_VALUES), raw
        return "timed-out", json.JSONDecoder().raw_decode(text[len(TIMEOUT_VALUES):])[0]
    if headless:
        return "headless", raw["values"]
    if submitted_empty:
        assert decode_user_answers(raw) == {}, raw
        return "empty", {}
    return None, {}


class NativeOutcomes:
    def __init__(self, case, out, save, flow_call, state, stage):
        self.case, self.out, self.save, self.flow_call = case, out, save, flow_call
        self.state, self.stage = state, stage
        self.next_form = None

    def submit(self, name, items=None):
        path = self.out / f"{name}.json"
        if items is not None:
            self.save(path, {"version": 1, "items": items})
        result = self.flow_call("submit", str(path))
        self.save(self.out / f"{name}-receipt.json", result)
        return result

    def observe(self, name, receipt, before=None, *, evidence=None):
        shown = self.state(receipt)
        assert shown["revision"] == receipt["revision"] and shown["open"], shown
        with urlopen(receipt["live"]["url"].rstrip("/") + "/content", timeout=5) as response:
            live = json.load(response)
        assert live["flow"]["id"] == receipt["flow"] and live["revision"] == shown["revision"], live
        stage = self.stage(shown, receipt)
        live_stage = self.stage(live, receipt)
        assert stage["state"] == live_stage["state"] == "in-progress", (stage, live_stage)
        assert stage["open_questions"] == live_stage["open_questions"], (stage, live_stage)
        questions = stage["questions"]
        live_questions = [q for q in live["questions"] if q["stage"] == receipt["stage"]]
        fields = ("id", "q", "open", "again", "asked_again_by", "answer")
        assert [[q.get(k) for k in fields] for q in questions] == [
            [q.get(k) for k in fields] for q in live_questions], (questions, live_questions)
        if before is not None:
            assert stage["rounds"] == before["rounds"], stage
        if evidence is not None:
            evidence_id, raw = evidence
            assert any(r["id"] == evidence_id for r in stage["results"]), stage
            result = next(r for r in live_stage["results"] if r["id"] == evidence_id)
            assert json.loads(result["doc"]["sections"][0]["blocks"][1]["code"]) == raw, result
        cli_blockers = {b["id"] for b in shown["progress"]["blockers"] if b["state"] == "open"}
        live_blockers = {b["id"] for b in live["progress"]["blockers"] if "resolved" not in b}
        assert cli_blockers == live_blockers, (cli_blockers, live_blockers)
        self.save(self.out / f"{name}-show.json", shown)
        self.save(self.out / f"{name}-content.json", live)
        return stage

    def record(self, name, receipt, expected, *, raw, status, values):
        items = []
        for asked in receipt["ask"]["questions"]:
            ident = asked["id"]
            response = {"status": status}
            returned = values.get(ident, [])
            returned = [returned] if isinstance(returned, str) else returned
            picks = [chr(ord("A") + i) for i, option in enumerate(asked["options"]) if option["label"] in returned]
            if picks:
                response["picks"] = picks
            items.append({"kind": "answer", "question": ident, "response": response})
        assert {item["question"]: item["response"] for item in items} == expected, items
        items.append(self.evidence("Observed non-consent", "These values did not come from a submission that settled the decision.", raw))
        recorded = self.submit(name, items)
        stage = self.observe(name, {**receipt, "revision": recorded["revision"]},
                             evidence=(recorded["refs"]["raw-outcome"], raw))
        for found in stage["questions"]:
            assert found["open"] and found["answer"]["response"] == expected[found["id"]], found
            assert found["answer"]["state"] not in ("picked", "resolved"), found
        return stage

    @staticmethod
    def evidence(title, context, raw):
        return {"kind": "result", "ref": "raw-outcome", "shape": "document", "title": title, "sections": [
            {"heading": "Outcome", "blocks": [{"prose": context}, {"code": json.dumps(raw, indent=2)}]}]}

    def leave_open(self, name, receipt, first, context, raw):
        recorded = self.submit(name, [self.evidence("Native ask did not settle", context, raw),
                                      {"kind": "blocker", "ref": "unsettled", "text": context}])
        stage = self.observe(name, {**receipt, "revision": recorded["revision"]}, first,
                             evidence=(recorded["refs"]["raw-outcome"], raw))
        assert recorded["refs"]["unsettled"], recorded
        assert all(q["open"] and "response" not in q["answer"] for q in stage["questions"]), stage

    def later(self, receipt, earlier):
        prior = earlier["questions"][0]
        new = question("later", "Which later fixture path should the form record?", ["Continue", "Stop"])
        new["again"] = prior["id"]
        later = self.submit("later-publication", [{"kind": "round", "questions": [new]}])
        new_id = later["refs"]["later"]
        stage = self.observe("later-publication", later)
        previous, current = stage["questions"]
        assert later["stage"] == receipt["stage"] and later["flow"] == receipt["flow"], later
        assert len(stage["rounds"]) == 2 and stage["rounds"][0] == earlier["rounds"][0], stage
        assert current["id"] == new_id != prior["id"] and current["open"], current
        assert previous["answer"] == prior["answer"] and previous["q"] == prior["q"], previous
        assert current["q"] == previous["q"] and current["again"] == previous["id"], current
        assert previous["asked_again_by"] == [new_id] and not previous["open"], previous
        return later

    def answer(self, receipt, raw, picked, expected_value):
        self.save(self.out / "later-tool-result.json", raw)
        ident = receipt["ask"]["questions"][0]["id"]
        expected = {ident: {"status": "answered", "picks": [picked]}}
        assert answer_responses(receipt, raw, True) == expected, raw
        assert submitted_values(raw, True) == {ident: expected_value}, raw
        recorded = self.submit("later-answer", [{"kind": "answer", "question": ident, "response": expected[ident]}])
        stage = self.observe("later-answer", {**receipt, "revision": recorded["revision"]})
        final = next(q for q in stage["questions"] if q["id"] == ident)
        assert not final["open"] and final["answer"]["response"] == expected[ident], final
        return stage

    def public_only(self, native, items):
        def round_for(name):
            self.flow_call("open", "--skill", "implement", "--title", f"Public recording fixture: {name}")
            return self.submit(name, items)

        required = round_for("required-timeout-public")
        status, values = non_consent(native)
        self.record("required-timeout-recorded", required, {required["refs"]["pick"]: {"status": "timed-out"}},
                    raw=native, status=status, values=values)

        headless = round_for("synthetic-headless-public")
        ident = headless["refs"]["pick"]
        synthetic = {"fixture": "synthetic headless recommendation, not a native result", "values": {ident: "A. Alpha"}}
        self.save(self.out / "synthetic-headless-result.json", synthetic)
        status, values = non_consent(synthetic, headless=True)
        self.record("synthetic-headless-recorded", headless, {ident: {"status": "headless", "picks": ["A"]}},
                    raw=synthetic, status=status, values=values)

        missing = round_for("synthetic-missing-public")
        first = self.observe("synthetic-missing-before", missing)
        assert non_consent(None) == (None, {})
        self.leave_open("synthetic-missing-recorded", missing, first,
                        "Synthetic missing-result fixture. No native result was available to classify.", None)
        return ["unbound timeout recorded through a separate public Flow fixture",
                "synthetic headless value remains non-consent in CLI and live content",
                "synthetic missing result leaves a blocker and no answer"]

    def drive(self, receipt, ui):
        first = self.observe("before-outcome", receipt) if receipt else None
        label = "Required fixture field" if receipt is None else receipt["ask"]["questions"][0]["question"]
        ui.active("active", label, receipt)
        if self.case in ("cancel", "later-round"):
            ui.action("Cancel")
        elif self.case == "empty":
            ui.action("Submit")
        elif self.case == "interrupted":
            ui.pick("B. Beta")
            ui.capture("changed-draft")
            ui.message(STEER)
        elif self.case in ("abort", "retry"):
            ui.abort()
        raw = ui.result(1)
        ui.settled("settled", receipt)
        self.save(self.out / "observed-outcome.json", raw)
        status, values = non_consent(raw, submitted_empty=self.case == "empty")
        if self.case == "required-timeout":
            assert result_text(raw) == REQUIRED_TIMEOUT and status == "timed-out" and values == {}, raw
            return ["unbound required-field timeout returned no answer"]
        assert all("response" not in q["answer"] for q in first["questions"]), first
        ident = receipt["refs"]["pick"]
        if self.case == "retry":
            assert raw.get("isError") and status is None, raw
            self.observe("lost-delivery", receipt, first)
            repeat = self.submit("contribution")
            assert repeat["repeated"] is True, repeat
            assert all(repeat[k] == receipt[k] for k in ("ask", "flow", "stage", "revision", "refs")), repeat
            self.observe("repeated", repeat, first)
            self.next_form = repeat
            ui.message(CONTINUE)
            ui.active("retry-active", label, repeat)
            ui.pick("B. Beta")
            ui.action("Submit")
            final = ui.result(2)
            ui.settled("retry-settled", repeat)
            evidence = self.submit("failed-delivery-evidence", [self.evidence(
                "Earlier native attempt failed", "The first turn stopped before any response was recorded. The next call reused the receipt.", raw)])
            before_answer = self.observe("failed-delivery-evidence", {**receipt, "revision": evidence["revision"]}, first,
                                         evidence=(evidence["refs"]["raw-outcome"], raw))
            assert all(q["open"] and "response" not in q["answer"] for q in before_answer["questions"]), before_answer
            self.answer(repeat, final, "B", "B. Beta")
            return ["failed delivery retained; unchanged receipt retried once with one published round"]
        if self.case == "interrupted":
            assert raw.get("isError") and status is None and result_text(raw).startswith(INTERRUPTED), raw
            data = json.JSONDecoder().raw_decode(result_text(raw)[len(INTERRUPTED):])[0]
            assert data == {ident: "B. Beta"}, raw
            self.leave_open("interrupted", receipt, first,
                            "A composer message closed the native form. Its changed draft is not a submitted answer.", raw)
            return ["composer interrupted a changed draft; CLI and live content keep the Stage and question open"]
        if self.case == "abort":
            assert raw.get("isError") and status is None, raw
            self.leave_open("aborted", receipt, first, "The turn stopped before the native form supplied an answer.", raw)
            return ["turn abort clears the form and panel without recording an answer"]
        if self.case == "timeout":
            assert values == {ident: "A. Alpha"}, raw
            expected = {ident: {"status": "timed-out", "picks": ["A"]}}
        else:
            assert values == {}, raw
            expected = {ident: {"status": "empty" if self.case == "empty" else "cancelled"}}
        earlier = self.record("outcome", receipt, expected, raw=raw, status=status, values=values)
        if self.case != "later-round":
            return [f"actual {self.case} leaves the decision open in CLI and live content"]
        later = self.later(receipt, earlier)
        self.next_form = later
        ui.message(CONTINUE)
        ui.active("later-active", later["ask"]["questions"][0]["question"], later)
        ui.pick("A. Continue")
        ui.action("Submit")
        final = ui.result(2)
        ui.settled("later-settled", later)
        settled = self.answer(later, final, "A", "A. Continue")
        assert settled["questions"][0]["answer"] == earlier["questions"][0]["answer"], settled
        return ["native Cancel recorded non-consent; a linked, separately submitted native re-ask preserves the original attempt"]
