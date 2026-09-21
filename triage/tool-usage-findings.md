# Tool Usage Mining — Findings

Script: `/Users/manu/JEV-works/triage/mine-tool-usage.py` (reuses the tool_use/tool_result pairing approach from `profile-corpora.py`).

**Sample: 17 transcripts, 544 tool calls, 52 `.jsonl` files scanned total.**

Numbers are a moving snapshot: the currently-running session's own transcript keeps growing as its bash calls execute during mining, so a rerun a few minutes later shows slightly higher counts (17/544 vs 16/526 on an earlier pass).

**CETI corpus does not exist locally.** `/Users/manu/.claude/projects/-Users-manu-CETI/` contains zero `.jsonl` transcripts — only a `memory/` subdirectory. Of the 52 transcripts found on the machine, 30 (`-claude-plugins-marketplaces-thedotmack`) and 5 (`ornith-cc-test`) are pure text/thinking with no tool calls at all — verified by inspecting their block types directly. All 544 tool calls in this analysis come from 3 sessions rooted under `-Users-manu/` plus their subagent transcripts.

## 1. Tool frequency and mass

Top by call count and top by output tokens — same ranking in this corpus (no divergence in which tools top the list, but the *share* diverges):

| tool | calls | tokens |
|---|---|---|
| Bash | 381 | 125,374 |
| Read | 44 | 86,037 |
| Write | 41 | 1,484 |
| Edit | 17 | 616 |
| SendMessage | 17 | 1,322 |
| ToolSearch | 14 | 14 |
| Agent | 13 | 899 |
| WebFetch | 5 | 2,106 |
| WebSearch | 3 | 2,175 |
| Skill | 3 | 23 |
| AskUserQuestion | 2 | 229 |
| mcp__claude_ai_Vercel__get_auth_user | 1 | 25 |
| mcp__claude_ai_Vercel__list_teams | 1 | 72 |
| TaskList | 1 | 3 |
| Artifact | 1 | 175 |

Divergence: Bash is 70% of calls but only 58% of tokens; Read is 8% of calls but 40% of tokens. Mass concentrates in Read far more than call frequency would suggest.

## 2. MCP calls

Only 2 MCP calls in the entire corpus:

| tool | calls | tokens |
|---|---|---|
| mcp__claude_ai_Vercel__list_teams | 1 | 72 |
| mcp__claude_ai_Vercel__get_auth_user | 1 | 25 |

**`context7` does not appear anywhere in this corpus, in any casing or server-name variant.** Confirmed by scanning all tool names for the substring "context7" case-insensitively — zero matches.

## 3. Repetition (near-identical outputs)

Grouped by (tool, hash of first 200 chars of output); groups with 3+ members:

| tool | count | total tokens | wasted tokens (total − 1 copy) |
|---|---|---|---|
| Read | 4 | 20,524 | 15,393 |
| Read | 3 | 4,809 | 3,206 |
| Read | 3 | 3,963 | 2,642 |
| Bash | 3 | 692 | 440 |
| Edit | 5 | 180 | 144 |
| Bash | 8 | 88 | 77 |
| Bash | 5 | 35 | 28 |
| ToolSearch | 9 | 9 | 8 |
| ToolSearch | 4 | 4 | 3 |

9 duplicate groups total. **~21,941 tokens wasted on repeats overall**, and Read dominates it — the top 3 Read groups alone account for ~21,241 of that (97%). One file being re-read 4 times accounts for 15,393 tokens by itself. Bash/Edit/ToolSearch duplicate groups are trivial (each under 500 tokens).

## 4. Output size distribution (top 8 tools by mass)

| tool | n | median tokens | p95 tokens |
|---|---|---|---|
| Bash | 381 | 102 | 1,162 |
| Read | 44 | 1,456 | 5,131 |
| WebSearch | 3 | 662 | 865 |
| WebFetch | 5 | 341 | 698 |
| Write | 41 | 35 | 46 |
| SendMessage | 17 | 77 | 85 |
| Agent | 13 | 69 | 72 |
| Edit | 17 | 36 | 40 |

Bash: typically tiny, occasionally huge — long tail (102 → 1,162). Read: reliably bulky, no big surprise between median and p95 (1,456 → 5,131) — consistently large rather than occasionally large. Write/SendMessage/Agent/Edit: consistently small with no meaningful tail.

## 5. Failure rate

Overall: **64 / 544 calls (11.8%)** contain error-like text (matched on: "Error", "error:", "not found", "failed", "denied", "ENOENT", "Traceback").

Top 5 tools by error count:

| tool | errors | calls | error rate |
|---|---|---|---|
| Bash | 43 | 381 | 11.3% |
| Read | 19 | 44 | 43.2% |
| WebFetch | 1 | 5 | 20.0% |
| mcp__claude_ai_Vercel__get_auth_user | 1 | 1 | 100.0% |

Only 4 tools had any matches (fewer than 5 tools registered errors at all). Caveat: Read's 43.2% rate is likely overstated — the regex matches the literal words "error"/"Error" appearing in normal source code that Read pulls back (e.g. try/except blocks, error-handling code), not necessarily failed reads. The Vercel entry is n=1, not statistically meaningful.
