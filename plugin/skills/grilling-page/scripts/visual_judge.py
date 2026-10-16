import json
import os
import re


def question_state(rec):
    """The judge's view of one question record: what the page shows, without option letters."""
    state = {"title": rec["title"], "description": rec["description"]}
    if rec.get("today"):
        state["today"] = [{"text": f["text"], "source": f["source"]} for f in rec["today"]]
    if rec.get("terms"):
        state["terms"] = [{"term": t["term"], "text": t["text"]} for t in rec["terms"]]
    if rec.get("example"):
        state["example"] = rec["example"]
    state["options"] = [{"label": re.sub(r"^[A-Z]\. ", "", o["label"]), "does": o["does"]} for o in rec["options"]]
    return state


def guide_types(path):
    """diagram-design's visual-type guide rows: {type name: what it shows}."""
    rows = re.findall(r"^\| (.+?) \| \*\*(.+?)\*\* \| \[type-[\w-]+\.md\]", open(path).read(), re.M)
    if not rows:
        raise ValueError(f"no visual-type rows found in {path}")
    return {name: shows for shows, name in rows}


def judge_request(skill_dir, pages):
    """The rubric, one judge state per page question, and the questions that jev answers for each state.
    The visual-type guide goes in each state once, so the two type questions name the types only."""
    rubric = json.load(open(f"{skill_dir}/references/visual-judge.json"))
    types = guide_types(os.path.normpath(os.path.join(skill_dir, rubric["types"]["guide"])))
    asks = {}
    for kind, d in rubric["diagrams"].items():
        asks[kind] = {"type": "bool", "instructions": f"{rubric['instructions']} {d['question']}", "criteria": {"true": d["true"], "false": d["false"]}}
        asks[f"{kind}_type"] = {"type": "choice", "instructions": f"{rubric['types']['instructions']} The diagram shows {d['shows']}.", "criteria": dict.fromkeys(types)}
    return rubric, [{"question": page, "visual_types": types} for page in pages], asks


async def judge_round(skill_dir, state_path, round_id):
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
    rubric, states, asks = judge_request(skill_dir, [question_state(q) for q in questions])
    settled, batch_error = {}, None
    try:
        batch = judge_batch({q["id"]: state for q, state in zip(questions, states)}, asks, intent=f"Judging diagrams for {round_id}")
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
        picks[q["id"]] = {}
        for kind, d in rubric["diagrams"].items():
            head = f"{q['id']} Q{q['q']} {kind} diagram:"
            if not answers or kind not in answers or f"{kind}_type" not in answers:
                print(f"{head} none (judge error: {getattr(item, 'error', None) or batch_error or 'no answer'}).")
                continue
            p = answers[kind]["bool"]
            if p < d["threshold"]:
                print(f"{head} none ({p:.2f}, under {d['threshold']}).")
                continue
            probs = answers[f"{kind}_type"]["probabilities"]
            top = sorted(probs, key=probs.get, reverse=True)[: rubric["types"]["top"]]
            picks[q["id"]][kind] = top
            print(f"{head} draw it ({p:.2f}). It shows {d['shows']}. Types: {', '.join(f'{t} {probs[t]:.2f}' for t in top)}.")
    return picks
