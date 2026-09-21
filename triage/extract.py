#!/usr/bin/env python3
"""Extract tool calls + their outputs from a Claude Code session transcript.

Pairs each tool_result with the tool_use that produced it, because the right
disposition depends on what was called, not only on what came back.

Redacts anything that looks like a credential BEFORE the text can leave the
machine. A triage pass that leaks a token into an API request has failed no
matter how good its classification is.

Usage: extract.py SESSION.jsonl > items.json
"""
import json, re, sys, pathlib

SECRET_PATTERNS = [
    (re.compile(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+'), '<JWT_REDACTED>'),
    (re.compile(r'\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}'), '<KEY_REDACTED>'),
    (re.compile(r'\bvck_[A-Za-z0-9_-]{16,}'), '<VERCEL_KEY_REDACTED>'),
    (re.compile(r'(?i)\b(api[_-]?key|secret|password|bearer)\b\s*[:=]\s*\S+'), r'\1=<REDACTED>'),
    (re.compile(r'(?i)(OIDC_TOKEN|GATEWAY_API_KEY)\s*=\s*\S+'), r'\1=<REDACTED>'),
]


def redact(text: str) -> tuple[str, bool]:
    hit = False
    for pat, repl in SECRET_PATTERNS:
        text, n = pat.subn(repl, text)
        hit = hit or bool(n)
    return text, hit


def block_text(content) -> str:
    if isinstance(content, list):
        return '\n'.join(b.get('text', '') for b in content if isinstance(b, dict))
    return '' if content is None else str(content)


def main(path: str) -> None:
    uses: dict[str, dict] = {}
    items: list[dict] = []
    order = 0

    for line in pathlib.Path(path).open():
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
                uses[b.get('id') or ''] = {
                    'tool': b.get('name', '?'),
                    'input': json.dumps(b.get('input', {}))[:400],
                }

            elif b.get('type') == 'tool_result':
                use = uses.get(b.get('tool_use_id') or '', {})
                text = block_text(b.get('content'))
                text, had_secret = redact(text)
                order += 1
                items.append({
                    'n': order,
                    'tool': use.get('tool', 'unknown'),
                    'call': use.get('input', ''),
                    'chars': len(text),
                    'approxTokens': max(1, len(text) // 4),
                    'hadSecret': had_secret,
                    # Cap what we ship per item: the head and tail carry the
                    # signal; the middle of a long listing rarely changes the call.
                    'text': text if len(text) <= 4000 else text[:2600] + '\n…[middle elided]…\n' + text[-1200:],
                })

    json.dump(items, sys.stdout, indent=1)
    print(f"\n[extracted {len(items)} items, "
          f"{sum(i['approxTokens'] for i in items):,} approx tokens, "
          f"{sum(1 for i in items if i['hadSecret'])} redacted]",
          file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
