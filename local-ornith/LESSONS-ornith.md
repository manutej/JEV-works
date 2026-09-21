# LESSONS-ornith.md — local-fleet specifics

Ornith/llama.cpp-specific findings. Anything that generalises beyond the local fleet
goes in `../LESSONS.md` instead (currently L23–L28 came from this work).

Newest first.

### O1 · llama-server speaks the Anthropic Messages API natively
`llama-server` 0.4.1 implements `POST /v1/messages` — real `content[]` blocks with
`thinking` + `text`, `stop_reason: tool_use` with proper `tool_use` blocks, and the full
`message_start`/`content_block_*`/`message_delta`/`message_stop` SSE sequence. Bogus routes
404, so the 200 is genuine. **No OpenAI→Anthropic translation layer is needed** to point an
Anthropic client at a local model.

### O2 · Claude Code emits hook output as a system-role message mid-conversation
Hook results (`SessionStart`, etc.) arrive as a `{role: "system"}` entry **inside** `messages`,
positioned after the user turn. Ornith's Jinja template raises
`System message must be at the beginning` and every request 500s. `~/ornith-lab/adapter.py`
hoists stray system-role messages into the top-level `system` field.
Any local model with a strict template hits this the moment a SessionStart hook exists.

### O3 · Concurrency ceiling is 4; the working number is 3
Measured, M3 Pro / 36 GB, 35B-A3B at 131k ctx, zero errors at every level:

| N | agg tok/s | per-req | median TTFT | slowest |
|---|---|---|---|---|
| 1 | 9.0 | 37.9 | 16.40s (cold) | 21.7s |
| 3 | 49.3 | 21.1 | 0.78s | 9.1s |
| 4 | **53.7** | 14.8 | 0.90s | 14.3s |
| 8 | 55.9 | 14.9 | **14.27s** | 28.1s |

Aggregate saturates at N=4 and is flat to N=8 (the 4→8 gain is inside run-to-run noise).
What breaks is latency, as requests queue behind the server's 4 slots. Above 4 you buy
latency, not work. One sweep only — per `../LESSONS.md` L8 this needs a repeat at another time.

### O4 · `ps` RSS is meaningless for llama.cpp
It reported **0.3–0.9 GB** for a 16 GB model, because weights are mmap'd. Any memory column
collected that way is measuring nothing. Use `/props`, the load-time logs, or system-wide
free memory instead.

### O5 · The 35B MoE is both faster and stronger than the dense 9B
36.9 tok/s vs 17.4 — only ~3B of 35B params are active per token. Prefer it for everything
except vision, which only `Ornith-1.5-9B` supports (it is the one with an `mmproj`).

### O6 · Long context is cheap here, because the architecture is hybrid
`full_attention_interval=4` — one layer in four is full attention, the rest carry constant-size
SSM state. 131k context costs a few GB, not tens. Do not size it from a dense-model intuition.

### O7 · Reasoning eats the token budget before the answer starts
Ornith streams `reasoning_content` first and `content` last. At `max_tokens: 768` an open-ended
task spent the entire budget reasoning and emitted **zero** answer tokens. Budget ≥1536 for
tool-loop work, and state the budget in the prompt so it stops.

### O8 · The MTP layers are dead weight today
`blk.N.nextn.*` tensors are present in the `-MTP` builds; llama.cpp logs them as
`unused tensor` and gives no speculative speedup.
