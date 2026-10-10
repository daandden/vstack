# Picks the visual kind for each question of one Grilling page round, with the jev judge.
# Run in omp's Python eval, where judge_batch is a global:
#   skill = "<grilling-page skill dir>"
#   exec(open(f"{skill}/scripts/visual_judge.py").read())
#   await judge_round(skill, "<state.jsonl>", "<round id>")
# It reads the round's question records from the state file and prints one line per question:
# its id, the label, the confidence, and what to make. Under the rubric's threshold, or on any judge error,
# the question gets no visual.

import json
import re


def question_state(rec):
    """The judge's view of one question record: what the page shows, without option letters."""
    state = {"title": rec["title"], "description": rec["description"]}
    if rec.get("example"):
        state["example"] = rec["example"]
    state["options"] = [{"label": re.sub(r"^[A-Z]\. ", "", o["label"]), "does": o["does"]} for o in rec["options"]]
    return state


async def judge_round(skill_dir, state_path, round_id):
    rubric = json.load(open(f"{skill_dir}/references/visual-judge.json"))
    latest, order = {}, []
    for line in open(state_path):
        if not line.strip():
            continue
        rec = json.loads(line)
        if rec.get("type") != "question":
            continue
        if rec["id"] not in latest:
            order.append(rec["id"])
        latest[rec["id"]] = rec
    questions = [latest[i] for i in order if latest[i]["round"] == round_id]
    if not questions:
        raise ValueError(f"round {round_id} has no question records in {state_path}")
    threshold = rubric["threshold"]
    criteria = {label: entry["criterion"] for label, entry in rubric["labels"].items()}
    settled, batch_error = {}, None
    try:
        batch = judge_batch(
            {q["id"]: question_state(q) for q in questions},
            {"visual": {"type": "choice", "instructions": rubric["instructions"], "criteria": criteria}},
            intent=f"Judging visuals for {round_id}",
        )
        try:
            async for key, item in batch.drain_iter(300):
                settled[key] = item
        finally:
            batch.close()
    except Exception as e:
        batch_error = e
    picks = {}
    for q in questions:
        item = settled.get(q["id"])
        answers = getattr(item, "answers", None) if item else None
        if not answers:
            label, why = "none", f"judge error: {getattr(item, 'error', None) or batch_error or 'no result'}"
        else:
            answer = answers["visual"]
            label, confidence = answer.get("choice"), answer.get("confidence", 0)
            why = f"confidence {confidence:.2f}"
            if label not in rubric["labels"] or confidence < threshold:
                why = f"{label} at {confidence:.2f}, under {threshold} or not a rubric label, so none"
                label = "none"
        picks[q["id"]] = label
        print(f"{q['id']} Q{q['q']}: {label} ({why}). {rubric['labels'][label]['make']}")
    return picks
