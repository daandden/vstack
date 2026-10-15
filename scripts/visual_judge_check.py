import json
import os
import runpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def is_jev(model):
    return isinstance(model, str) and model.startswith("typesafe/jev")


def refuse(batch, model):
    batch.cancel()
    raise RuntimeError(f"visual_judge_check grades only TypeSafe jev answers, but judge_batch used {model or 'no model'}. Give omp TypeSafe credentials and set the judge role to typesafe/jev-latest.")


async def check(judge_batch, root=ROOT):
    file = json.load(open(f"{root}/visual-judge-cases.json"))
    skill = os.path.dirname(os.path.dirname(f"{root}/{file['rubric']}"))
    helper = runpy.run_path(f"{skill}/scripts/visual_judge.py")
    cases = file["diagram_cases"] + file["type_cases"]
    rubric, states, asks = helper["judge_request"](skill, [c["state"] for c in cases])
    kinds = list(rubric["diagrams"])

    settled, model = {}, None
    batch = judge_batch({c["id"]: state for c, state in zip(cases, states)}, asks, intent="Checking the visual judge")
    try:
        async for key, item in batch.drain_iter(600):
            settled[key] = item
            if model is None:
                model = batch.status().get("model")
                if model is not None and not is_jev(model):
                    refuse(batch, model)
        model = batch.status().get("model")
        if not is_jev(model):
            refuse(batch, model)
    finally:
        batch.close()
    failed = [f"{c['id']} ({getattr(settled.get(c['id']), 'error', None) or 'no answer'})" for c in cases if not getattr(settled.get(c["id"]), "answers", None)]
    if failed:
        raise RuntimeError(f"visual_judge_check got no answer for {len(failed)} case(s): {', '.join(failed)}")

    def top_types(answers, kind):
        probs = answers[f"{kind}_type"]["probabilities"]
        return sorted(probs, key=probs.get, reverse=True)[: rubric["types"]["top"]]

    misses = []
    for c in file["diagram_cases"]:
        answers = settled[c["id"]].answers
        for kind in kinds:
            p, threshold = answers[kind]["bool"], rubric["diagrams"][kind]["threshold"]
            if (p >= threshold) != c[kind]:
                misses.append((c["id"], f"{kind} diagram {p:.2f} against threshold {threshold}, expected {'yes' if c[kind] else 'no'}"))
    for c in file["type_cases"]:
        answers = settled[c["id"]].answers
        tops = [(kind, top_types(answers, kind)) for kind in kinds]
        ok = [c["expected"], *c["allowed"]]
        if not any(t in ok for _, top in tops for t in top):
            ranked = "; ".join(f"{kind}_type top {', '.join(top)}" for kind, top in tops)
            misses.append((c["id"], f"{ranked}, expected {' or '.join(ok)}"))

    for case_id, line in misses:
        print(f"MISS {case_id}: {line}")
    total = len(cases)
    print(f"{total - len({case_id for case_id, _ in misses})}/{total} cases pass ({len(file['diagram_cases'])} diagram, {len(file['type_cases'])} type); model {model}")
    return not misses
