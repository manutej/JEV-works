#!/usr/bin/env python3
"""Mine tool-usage patterns across all Claude Code transcripts on this machine.

Reuses the tool_use/tool_result pairing approach from profile-corpora.py.
Answers: tool frequency vs mass, MCP call inventory, near-duplicate output
waste, output-size distribution, and failure rate.

Usage: mine-tool-usage.py
"""
import json, pathlib, collections, hashlib, statistics, re

ROOT = pathlib.Path.home() / '.claude' / 'projects'

ERROR_RE = re.compile(r'Error|error:|not found|failed|denied|ENOENT|Traceback', re.IGNORECASE)


def iter_calls():
    """Yield (tool_name, output_text, project) for every tool_use/tool_result pair
    across every transcript jsonl on the machine."""
    n_files = 0
    for path in ROOT.rglob('*.jsonl'):
        uses = {}
        found_any = False
        try:
            fh = path.open()
        except OSError:
            continue
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
                        found_any = True
                        yield tool, txt, path.parent.name
        if found_any:
            n_files += 1
    iter_calls.n_files = n_files


def main():
    calls = []  # (tool, text, project)
    for tool, txt, proj in iter_calls():
        calls.append((tool, txt, proj))
    n_files = getattr(iter_calls, 'n_files', 0)

    total_calls = len(calls)
    print(f"=== SAMPLE SIZE: {n_files} transcripts, {total_calls} tool calls ===\n")

    # 1. TOOL FREQUENCY AND MASS
    count_by_tool = collections.Counter()
    tokens_by_tool = collections.Counter()
    for tool, txt, _ in calls:
        tok = max(1, len(txt) // 4)
        count_by_tool[tool] += 1
        tokens_by_tool[tool] += tok

    print("--- 1. TOOL FREQUENCY (top 15 by call count) ---")
    print(f"{'tool':40} {'calls':>8} {'tokens':>10}")
    for tool, c in count_by_tool.most_common(15):
        print(f"{tool[:40]:40} {c:8,} {tokens_by_tool[tool]:10,}")

    print("\n--- 1. TOOL MASS (top 15 by total output tokens) ---")
    print(f"{'tool':40} {'tokens':>10} {'calls':>8}")
    for tool, t in tokens_by_tool.most_common(15):
        print(f"{tool[:40]:40} {t:10,} {count_by_tool[tool]:8,}")

    # 2. MCP CALLS
    print("\n--- 2. MCP TOOL CALLS ---")
    mcp_tools = [(t, c) for t, c in count_by_tool.items() if t.startswith('mcp__')]
    if not mcp_tools:
        print("  none found in corpus.")
    else:
        mcp_tools.sort(key=lambda x: -tokens_by_tool[x[0]])
        print(f"{'tool':50} {'calls':>8} {'tokens':>10}")
        for tool, c in mcp_tools:
            print(f"{tool[:50]:50} {c:8,} {tokens_by_tool[tool]:10,}")
    context7_hits = [t for t in count_by_tool if 'context7' in t.lower()]
    print(f"\n  context7 (any casing/variant) present: {'YES -> ' + str(context7_hits) if context7_hits else 'NO — does not appear anywhere in corpus'}")

    # 3. REPETITION / near-duplicate outputs
    print("\n--- 3. REPETITION (near-identical outputs, first 200 chars hashed) ---")
    groups = collections.defaultdict(list)  # (tool, hash) -> list of token counts
    for tool, txt, _ in calls:
        h = hashlib.md5(txt[:200].encode('utf-8', 'ignore')).hexdigest()
        tok = max(1, len(txt) // 4)
        groups[(tool, h)].append(tok)

    dup_groups = [(k, v) for k, v in groups.items() if len(v) >= 3]
    dup_groups.sort(key=lambda kv: -(sum(kv[1]) - max(kv[1])))
    total_wasted = 0
    print(f"{'tool':30} {'count':>6} {'total_tok':>10} {'wasted_tok':>10}")
    for (tool, h), toks in dup_groups[:20]:
        wasted = sum(toks) - max(toks)
        total_wasted += wasted
        print(f"{tool[:30]:30} {len(toks):6} {sum(toks):10,} {wasted:10,}")
    # sum wasted across ALL dup groups (not just top 20 printed)
    all_wasted = sum(sum(v) - max(v) for k, v in groups.items() if len(v) >= 3)
    print(f"\n  {len(dup_groups)} duplicate groups (3+ members) found overall")
    print(f"  total approx tokens wasted on repeats (all groups): {all_wasted:,}")

    # 4. OUTPUT SIZE DISTRIBUTION for top 8 tools by mass
    print("\n--- 4. OUTPUT SIZE DISTRIBUTION (top 8 tools by mass): median / p95 tokens ---")
    top8 = [t for t, _ in tokens_by_tool.most_common(8)]
    per_tool_sizes = collections.defaultdict(list)
    for tool, txt, _ in calls:
        if tool in top8:
            per_tool_sizes[tool].append(max(1, len(txt) // 4))
    print(f"{'tool':40} {'n':>6} {'median':>8} {'p95':>8}")
    for tool in top8:
        sizes = sorted(per_tool_sizes[tool])
        med = statistics.median(sizes)
        p95_idx = min(len(sizes) - 1, int(0.95 * len(sizes)))
        p95 = sizes[p95_idx]
        print(f"{tool[:40]:40} {len(sizes):6} {med:8,.0f} {p95:8,}")

    # 5. FAILURE RATE
    print("\n--- 5. FAILURE RATE ---")
    errors_by_tool = collections.Counter()
    for tool, txt, _ in calls:
        if ERROR_RE.search(txt):
            errors_by_tool[tool] += 1
    total_errors = sum(errors_by_tool.values())
    print(f"  overall: {total_errors:,} / {total_calls:,} calls look like errors ({total_errors/total_calls:.1%})")
    print(f"\n{'tool':40} {'errors':>8} {'calls':>8} {'err_rate':>9}")
    for tool, e in errors_by_tool.most_common(5):
        c = count_by_tool[tool]
        print(f"{tool[:40]:40} {e:8,} {c:8,} {e/c:8.1%}")


if __name__ == '__main__':
    main()
