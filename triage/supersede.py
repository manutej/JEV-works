#!/usr/bin/env python3
"""Deterministic supersession: has this output's content already been recorded?

P21 established that Jev cannot answer this — asked as a question it never
exceeded p=0.78 and reached the ends on 26% of items. But it does not need a
model at all. An output is superseded when the *distinctive* things in it — the
numbers, paths, identifiers, error names — already appear in a durable file.
That is a containment check: free, exact, and with no mid band to launder.

Deliberately token-level rather than line-level. A measurement written into
NETER.md as prose shares almost no whole lines with the shell output that
produced it, but it shares every number.

Usage: supersede.py items.json DURABLE_GLOB [DURABLE_GLOB ...] > items-with-coverage.json
"""
import json, re, sys, pathlib

# What counts as distinctive: things you could not reconstruct by guessing.
TOKEN_PATTERNS = [
    re.compile(r'\d+\.\d+'),                      # 245.9, 0.042
    re.compile(r'\b\d{2,}\b'),                    # 119, 24299 (skip 0-9 as noise)
    re.compile(r'/[\w.\-/]{6,}'),                 # /Users/manu/... paths
    re.compile(r'\b[a-z]+[A-Z]\w+'),              # camelCase identifiers
    re.compile(r'\b[a-z]{3,}_[a-z_]{3,}\b'),      # snake_case identifiers
    re.compile(r'\b[A-Z]{2,}[A-Z_]*\b'),          # ERR_MODULE_NOT_FOUND, HTTP
    re.compile(r'\b\w+\.(?:ts|md|json|py|html|jsonl|mdx|yaml)\b'),  # filenames
]

STOP = {'https', 'const', 'import', 'export', 'return', 'function', 'true', 'false', 'null'}


def distinctive(text: str) -> set[str]:
    out: set[str] = set()
    for pat in TOKEN_PATTERNS:
        for m in pat.findall(text):
            t = m.strip('.,:;()[]{}"\'')
            if len(t) >= 3 and t.lower() not in STOP:
                out.add(t)
    return out


def main() -> None:
    items = json.loads(pathlib.Path(sys.argv[1]).read_text())

    corpus_parts: list[str] = []
    files_read = 0
    for pattern in sys.argv[2:]:
        paths = (
            sorted(pathlib.Path('/').glob(pattern.lstrip('/'))) if '*' in pattern
            else [pathlib.Path(pattern)]
        )
        for p in paths:
            try:
                corpus_parts.append(p.read_text(errors='replace'))
                files_read += 1
            except OSError:
                continue

    corpus = '\n'.join(corpus_parts)
    corpus_tokens = distinctive(corpus)
    print(f"[durable corpus: {files_read} files, {len(corpus):,} chars, "
          f"{len(corpus_tokens):,} distinctive tokens]", file=sys.stderr)

    covered_hist: list[float] = []
    for item in items:
        toks = distinctive(item.get('text', ''))
        if not toks:
            item['supersededCoverage'] = 0.0
            item['distinctiveTokens'] = 0
        else:
            hit = len(toks & corpus_tokens)
            item['supersededCoverage'] = round(hit / len(toks), 4)
            item['distinctiveTokens'] = len(toks)
        covered_hist.append(item['supersededCoverage'])

    covered_hist.sort()
    q = lambda f: covered_hist[int((len(covered_hist) - 1) * f)]
    print(f"[coverage: min {q(0):.2f} · p25 {q(.25):.2f} · median {q(.5):.2f} "
          f"· p75 {q(.75):.2f} · max {q(1):.2f}]", file=sys.stderr)
    print(f"[fully recorded (>=0.9): {sum(1 for c in covered_hist if c >= 0.9)} items · "
          f"orphaned (<0.3): {sum(1 for c in covered_hist if c < 0.3)} items]", file=sys.stderr)

    json.dump(items, sys.stdout, indent=1)


if __name__ == '__main__':
    main()
