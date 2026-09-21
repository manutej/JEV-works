#!/usr/bin/env python3
"""Find masked-modelling targets: fields that already exist and can serve as labels.

The premise: we have no hand-labelled data, but we have a great deal of data with
CATEGORICAL FIELDS ALREADY FILLED IN. Mask such a field, predict it from the rest
of the record, and score against the value you hid. That is a real classification
task with real labels and a closed answer space — no annotation required.

A field is a usable target when all four hold:
  1. CLOSED     — few distinct values relative to row count (enumerable options).
  2. POPULATED  — filled on most rows.
  3. BALANCED   — the majority class does not swallow everything, or the task is
                  trivially beaten by always guessing it.
  4. SEPARABLE  — some OTHER field carries enough text to judge from, and the
                  target is not a substring of it (that would make it a regex task).

Reports candidates ranked by how much signal they could actually settle.

Usage: find-targets.py [root ...]
"""
import csv, json, re, sys, collections, pathlib

MAX_CLASSES = 12          # beyond this it stops being a clean Choice
MIN_ROWS = 20
TEXT_MIN_CHARS = 25       # short text is this model's strength, not a disqualifier


def categorise(rows: list[dict], path: str, kind: str) -> list[dict]:
    if len(rows) < MIN_ROWS:
        return []
    cols = list({k for r in rows for k in r.keys()})
    out = []

    # which columns could serve as the INPUT text?
    text_cols = []
    for c in cols:
        vals = [str(r.get(c) or '') for r in rows]
        avg = sum(len(v) for v in vals) / max(1, len(vals))
        if avg < TEXT_MIN_CHARS:
            continue
        # A link column is long but unjudgeable — exclude it as an input.
        urlish = sum(1 for v in vals[:80] if v.startswith(('http://', 'https://', 'www.')))
        if urlish / max(1, min(80, len(vals))) > 0.5:
            continue
        if re.fullmatch(r'[\d\s.,+-]*', ''.join(vals[:40])):
            continue  # numeric column, not prose
        text_cols.append((c, round(avg)))
    text_cols.sort(key=lambda t: -t[1])

    for c in cols:
        vals = [str(r.get(c) or '').strip() for r in rows]
        filled = [v for v in vals if v]
        if len(filled) / len(vals) < 0.8:
            continue
        counts = collections.Counter(filled)
        n_classes = len(counts)
        if not (2 <= n_classes <= MAX_CLASSES):
            continue
        # skip anything that looks like a free-text or numeric column
        if any(len(v) > 60 for v in counts):
            continue
        majority = counts.most_common(1)[0][1] / len(filled)

        # separability: is the target value literally present in the input text?
        leak = 0
        probe = [c2 for c2, _ in text_cols if c2 != c][:2]
        if probe:
            for r in rows[:120]:
                tgt = str(r.get(c) or '').strip()
                if not tgt:
                    continue
                blob = ' '.join(str(r.get(p) or '') for p in probe).lower()
                if tgt.lower() and tgt.lower() in blob:
                    leak += 1
            leak /= max(1, min(120, len(rows)))

        out.append({
            'file': path,
            'kind': kind,
            'target': c,
            'rows': len(filled),
            'classes': n_classes,
            'values': [v for v, _ in counts.most_common(MAX_CLASSES)],
            'majorityShare': round(majority, 3),
            'inputCols': [c2 for c2, _ in text_cols if c2 != c][:3],
            'leakRate': round(leak, 3),
            # how much a result here could settle: instances x classes, penalised
            # by imbalance and by leakage
            'signal': round(len(filled) * (n_classes - 1) * (1 - majority) * (1 - leak), 1),
        })
    return out


def flatten(obj, prefix='', out=None):
    """One level of dotted flattening so nested metadata is visible."""
    out = {} if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f'{prefix}{k}'
            if isinstance(v, dict):
                flatten(v, key + '.', out)
            elif isinstance(v, list):
                out[key] = ' '.join(str(x) for x in v if not isinstance(x, (dict, list)))
            else:
                out[key] = v
    return out


def load(p: pathlib.Path) -> tuple[list[dict], str] | None:
    try:
        if p.suffix == '.jsonl':
            rows = []
            for line in p.open(errors='replace'):
                line = line.strip()
                if line:
                    try:
                        rows.append(flatten(json.loads(line)))
                    except json.JSONDecodeError:
                        pass
            return (rows, 'jsonl') if rows else None
        if p.suffix == '.json':
            d = json.loads(p.read_text(errors='replace'))
            if isinstance(d, list) and d and isinstance(d[0], dict):
                return ([flatten(x) for x in d], 'json')
            return None
        if p.suffix == '.csv':
            with p.open(newline='', errors='replace') as fh:
                return (list(csv.DictReader(fh)), 'csv')
    except Exception:
        return None
    return None


def main() -> None:
    roots = [pathlib.Path(a) for a in sys.argv[1:]] or [pathlib.Path.home()]
    skip = re.compile(r'/(node_modules|Library|\.git|\.cache|__pycache__|\.venv|site-packages)/')
    found: list[dict] = []
    scanned = 0

    for root in roots:
        for p in root.rglob('*'):
            if p.suffix not in {'.json', '.jsonl', '.csv'} or skip.search(str(p)):
                continue
            try:
                if p.stat().st_size > 40_000_000 or p.stat().st_size < 400:
                    continue
            except OSError:
                continue
            got = load(p)
            if not got:
                continue
            scanned += 1
            found.extend(categorise(got[0], str(p), got[1]))

    found.sort(key=lambda d: -d['signal'])
    print(f"scanned {scanned} tabular files · {len(found)} candidate targets\n")

    if not found:
        print("no usable masked-modelling targets found")
        return

    for d in found[:25]:
        short = d['file'].replace(str(pathlib.Path.home()), '~')
        print(f"signal {d['signal']:>9}  {short}")
        print(f"    target      {d['target']}  ({d['classes']} classes, {d['rows']} rows, "
              f"majority {d['majorityShare']:.0%}, leak {d['leakRate']:.0%})")
        print(f"    values      {d['values'][:8]}")
        print(f"    predict from {d['inputCols'] or '— NO TEXT FIELD, unusable'}")
        print()

    usable = [d for d in found if d['inputCols'] and d['leakRate'] < 0.5 and d['majorityShare'] < 0.9]
    print(f"{len(usable)} of {len(found)} survive all four tests "
          f"(closed, populated, balanced, separable with low leakage)")
    out = pathlib.Path(__file__).parent / 'targets.json'
    out.write_text(json.dumps(found, indent=1) + '\n')
    print(f"full list → {out}")


if __name__ == '__main__':
    main()
