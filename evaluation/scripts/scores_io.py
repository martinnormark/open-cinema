"""Write evaluation/background/scores.json with one run per line, so diffs stay one row per score."""
import json


def dump(scores, path):
    head = {k: v for k, v in scores.items() if k != "runs"}
    lines = ["{"]
    for k, v in head.items():
        body = json.dumps(v, indent=2, ensure_ascii=False).replace("\n", "\n  ")
        lines.append(f"  {json.dumps(k)}: {body},")
    lines.append('  "runs": {')
    runs = list(scores["runs"].items())
    for i, (name, r) in enumerate(runs):
        parts = [f'"A": [{",".join(map(str, r["A"]))}]', f'"B": [{",".join(map(str, r["B"]))}]', f'"gates": {json.dumps(r.get("gates", []))}', f'"notes": {json.dumps(r["notes"], ensure_ascii=False)}']
        lines.append(f"    {json.dumps(name)}: {{{', '.join(parts)}}}" + ("," if i < len(runs) - 1 else ""))
    lines += ["  }", "}"]
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
