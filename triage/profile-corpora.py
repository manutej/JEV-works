#!/usr/bin/env python3
"""Map tool-output mass across every Claude Code transcript on this machine.

Answers the question that decides whether Jev-based pruning is worth running at
all on a given session: how much of its tool output is concentrated in tools
whose output is repetitive or regenerable (doc dumps, listings, searches) versus
tools whose output is a one-off measurement you cannot get back.

No API calls. Pure local accounting, so it is free to run over everything.

Usage: profile-corpora.py [--min-tokens N]
"""
import json, pathlib, collections, sys

ROOT = pathlib.Path.home() / '.claude' / 'projects'

# Tools whose outputs tend to be bulky AND regenerable — the population where a
# keep/drop pass can plausibly reclaim real mass.
PRUNABLE_SHAPES = {
    'prefix': ('mcp__context7', 'mcp__arxiv', 'mcp__claude_ai_Notion', 'mcp__perplexity',
               'mcp__claude_ai_Google_Drive', 'mcp__claude_ai_Gmail'),
    'exact': {'Glob', 'Grep', 'ToolSearch', 'WebSearch', 'WebFetch', 'Read', 'TaskList', 'LSP'},
}


def is_prunable(tool: str) -> bool:
    return tool.startswith(PRUNABLE_SHAPES['prefix']) or tool in PRUNABLE_SHAPES['exact']


def profile(path: pathlib.Path) -> dict | None:
    uses: dict[str, str] = {}
    per_tool: collections.Counter = collections.Counter()
    counts: collections.Counter = collections.Counter()
    total = 0

    try:
        fh = path.open()
    except OSError:
        return None

    with fh:
        for line in fh:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            content = (d.get('message') or {}).get('content')
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get('type') == 'tool_use':
                    uses[b.get('id') or ''] = b.get('name', '?')
                elif b.get('type') == 'tool_result':
                    tool = uses.get(b.get('tool_use_id') or '', 'unknown')
                    c = b.get('content')
                    if isinstance(c, list):
                        txt = '\n'.join(x.get('text', '') for x in c if isinstance(x, dict))
                    else:
                        txt = '' if c is None else str(c)
                    tok = max(1, len(txt) // 4)
                    per_tool[tool] += tok
                    counts[tool] += 1
                    total += tok

    if total == 0:
        return None

    prunable = sum(t for tool, t in per_tool.items() if is_prunable(tool))
    return {
        'session': path.stem[:8],
        'project': path.parent.name.replace('-Users-manu', '~') or '~',
        'calls': sum(counts.values()),
        'tokens': total,
        'prunableTokens': prunable,
        'prunableShare': prunable / total,
        'topTools': per_tool.most_common(3),
    }


def main() -> None:
    min_tokens = 2000
    if '--min-tokens' in sys.argv:
        min_tokens = int(sys.argv[sys.argv.index('--min-tokens') + 1])

    rows = [r for p in ROOT.rglob('*.jsonl') if (r := profile(p)) and r['tokens'] >= min_tokens]
    rows.sort(key=lambda r: -r['prunableTokens'])

    print(f"{len(rows)} sessions with >= {min_tokens:,} tokens of tool output\n")
    print(f"{'session':9} {'project':34} {'calls':>6} {'toolTok':>9} {'prunable':>9} {'share':>6}  top tool by mass")
    print('─' * 118)
    for r in rows[:22]:
        top = r['topTools'][0][0] if r['topTools'] else '—'
        print(f"{r['session']:9} {r['project'][:34]:34} {r['calls']:6} {r['tokens']:9,} "
              f"{r['prunableTokens']:9,} {r['prunableShare']:5.0%}  {top[:34]}")

    tot = sum(r['tokens'] for r in rows)
    pru = sum(r['prunableTokens'] for r in rows)
    print('─' * 118)
    print(f"{'ALL':9} {'':34} {sum(r['calls'] for r in rows):6} {tot:9,} {pru:9,} {pru/tot:5.0%}")

    agg: collections.Counter = collections.Counter()
    for p in ROOT.rglob('*.jsonl'):
        r = profile(p)
        if not r:
            continue
        for tool, tok in r['topTools']:
            agg[tool] += tok
    print('\nheaviest tools across everything (top-3 contributors per session):')
    for tool, tok in agg.most_common(12):
        mark = '  ← prunable shape' if is_prunable(tool) else ''
        print(f"  {tool[:44]:44} {tok:10,}{mark}")


if __name__ == '__main__':
    main()
