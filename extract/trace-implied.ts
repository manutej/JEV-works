/**
 * trace-implied.ts — implied labels from an authoring trace (jev-elder/hub/wiring/trace-schema.json).
 *
 *   node --experimental-strip-types extract/trace-implied.ts <trace.jsonl> [--coverage out.md] [--routing 0.2.0]
 *
 * Reads the events of one artifact (a course, a deck, an HTML page), groups them by unit, and turns
 * what the author did NEXT into a label for a question the pack would have been asked on the EARLIER
 * state. Every rule is a named proxy; the names match trace-schema.json `actions_to_labels` and a test
 * keeps them in step. Output: an array of label rows (label_source "implied") on stdout, ready for
 *   node hub/wiring/label-store.mjs add -
 * Identity: the row's id is hash16('authoring:' + trace_id + '#' + unit + '@' + seq), the same string
 * ask.mjs hashes for the input trace.mjs emits, so implied rows and model rows join on it.
 * Nothing here calls a model. Word thresholds are declared, not fitted (PREREG lists them).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

type Event = { schema_version: string; trace_id: string; kind: 'course' | 'deck' | 'page'; unit: string; seq: number; ts: string; stage: string; actor: string; action: string; state: Record<string, unknown>; metrics?: Record<string, number>; note?: string | null };
type Proxy = { name: string; pack: string; q_key: string; label_value: unknown; rule: string };
export type Row = Record<string, unknown>;

export const PIN = 'jev-1.13.0';
export const SHORT_SLIDE_WORDS = 40; // declared threshold (trace-schema.json shipped_short); not fitted
const ROW_ID: Record<Event['kind'], string> = { course: 'r6.authoring.section', deck: 'r7.authoring.slide', page: 'r8.authoring.page' };
const PACK: Record<Event['kind'], string> = { course: 'works.kit.bank-course-qa', deck: 'works.kit.authoring-slide', page: 'works.kit.authoring-html-page' };

export const hash16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const itemId = (e: Event) => `${e.trace_id}#${e.unit}@${e.seq}`;

/** The proxies, as code. Each returns the earlier event the label attaches to, or null. */
export const PROXIES: Record<string, { pack: string; q_key: string; rule: string; apply: (evs: Event[]) => Array<{ at: Event; by: Event; label_value: unknown }> }> = {
  split_after: { pack: PACK.course, q_key: 'teachesOneThing', rule: 'a later event on the same unit has action split',
    apply: (evs) => laterAction(evs, ['split'], false) },
  added_example_after: { pack: PACK.course, q_key: 'hasConcreteExample', rule: 'a later event on the same unit has action added_example',
    apply: (evs) => laterAction(evs, ['added_example'], false) },
  shortened_after: { pack: PACK.deck, q_key: 'readableAtAGlance', rule: 'a later event on the same unit has action shortened or split',
    apply: (evs) => laterAction(evs, ['shortened', 'split'], false) },
  shipped_short: { pack: PACK.deck, q_key: 'readableAtAGlance', rule: `the unit's last event is shipped and its metrics.words ≤ ${SHORT_SLIDE_WORDS} (threshold declared here, not fitted)`,
    apply: (evs) => { const l = evs[evs.length - 1]; return l.action === 'shipped' && typeof l.metrics?.words === 'number' && l.metrics.words <= SHORT_SLIDE_WORDS ? [{ at: l, by: l, label_value: true }] : []; } },
  added_exercise_after: { pack: PACK.page, q_key: 'hasExercise', rule: 'a later event on the same unit has action added_exercise',
    apply: (evs) => laterAction(evs, ['added_exercise'], false) },
  shipped_with_exercise: { pack: PACK.page, q_key: 'hasExercise', rule: "the unit's last event is shipped and metrics.exercises ≥ 1",
    apply: (evs) => { const l = evs[evs.length - 1]; return l.action === 'shipped' && (l.metrics?.exercises ?? 0) >= 1 ? [{ at: l, by: l, label_value: true }] : []; } },
  broken_up_after: { pack: PACK.page, q_key: 'wallOfText', rule: 'a later event on the same unit has action added_figure, added_code or split, and metrics at the earlier event had bullets = figures = code_samples = headings = 0',
    apply: (evs) => laterAction(evs, ['added_figure', 'added_code', 'split'], true).filter(({ at }) => ['bullets', 'figures', 'code_samples', 'headings'].every((k) => (at.metrics?.[k] ?? 0) === 0)) },
  shipped_as_is: { pack: '*', q_key: '*', rule: "aggregate: the unit's last event is shipped and no revise-stage event follows the last model answer; stored as an aggregate label, never counted toward a question",
    apply: (evs) => { const l = evs[evs.length - 1]; const prev = evs[evs.length - 2]; return l.action === 'shipped' && (!prev || prev.stage !== 'revise') ? [{ at: l, by: l, label_value: 'ship' }] : []; } },
  sent_back: { pack: '*', q_key: '*', rule: 'aggregate: a sent_back event exists on the unit',
    apply: (evs) => evs.filter((e) => e.action === 'sent_back').map((by) => ({ at: evs[Math.max(0, evs.indexOf(by) - 1)], by, label_value: 'revise' })) },
};

/** The label attaches to the event immediately before the first later event whose action is in `actions`. */
function laterAction(evs: Event[], actions: string[], label_value: unknown) {
  const out: Array<{ at: Event; by: Event; label_value: unknown }> = [];
  for (let i = 1; i < evs.length; i++) if (actions.includes(evs[i].action)) out.push({ at: evs[i - 1], by: evs[i], label_value });
  return out;
}

export function byUnit(events: Event[]) {
  const m = new Map<string, Event[]>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) { if (!m.has(e.unit)) m.set(e.unit, []); m.get(e.unit)!.push(e); }
  return m;
}

export function impliedRows(events: Event[], routing_version = '0.2.0'): Row[] {
  const rows: Row[] = [];
  for (const [, evs] of byUnit(events)) {
    const kind = evs[0].kind;
    for (const [name, p] of Object.entries(PROXIES)) {
      const pack = p.pack === '*' ? PACK[kind] : p.pack;
      if (p.pack !== '*' && p.pack !== PACK[kind]) continue;
      for (const { at, by, label_value } of p.apply(evs)) {
        rows.push({
          schema_version: '0.1.0', ts: at.ts, source: 'authoring', id: hash16('authoring:' + itemId(at)), threadId: null,
          from_class: null, subject_hash: null, action: null, labels: [], model: PIN, confidence: null, answers: null,
          routing_version, row_id: ROW_ID[kind], pack, q_key: p.q_key, aggregate: p.q_key === '*', primitive: null,
          model_answer: null, model_p: null, human_verdict: null, label_value, proxy: { name, rule: p.rule },
          label_source: 'implied', labeled_at: by.ts, labeled_by: `proxy:${name}`, note: `${itemId(at)} ← ${by.action}@${by.seq}`, split: null,
        });
      }
    }
  }
  return rows;
}

export function coverage(events: Event[], rows: Row[]) {
  const units = byUnit(events);
  const per: Record<string, number> = {};
  for (const r of rows) { const k = `${r.pack} · ${r.q_key}`; per[k] = (per[k] ?? 0) + 1; }
  const ts = events.map((e) => e.ts).sort();
  const lines = [
    `# Trace coverage`, ``, `- trace: ${events[0]?.trace_id ?? '?'} (${events[0]?.kind ?? '?'})`, `- events: ${events.length} · units: ${units.size} · window: ${ts[0] ?? '?'} → ${ts[ts.length - 1] ?? '?'}`,
    `- implied rows: ${rows.length} (aggregate rows ${rows.filter((r) => r.aggregate).length}, never counted toward a question)`, ``,
    `| pack · question | implied rows |`, `|---|---|`, ...Object.entries(per).sort().map(([k, n]) => `| ${k} | ${n} |`), ``,
    `| proxy | rows |`, `|---|---|`, ...Object.keys(PROXIES).map((n) => `| ${n} | ${rows.filter((r) => (r.proxy as { name: string })?.name === n).length} |`), ``,
    `Units with no implied label: ${[...units.keys()].filter((u) => !rows.some((r) => String(r.note).startsWith(events.find((e) => e.unit === u)!.trace_id + '#' + u + '@'))).join(', ') || 'none'}`,
  ];
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [, , file, ...args] = process.argv;
  if (!file) { console.error('usage: trace-implied.ts <trace.jsonl> [--coverage out.md] [--routing 0.2.0]'); process.exit(1); }
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Event);
  const routing = args.includes('--routing') ? args[args.indexOf('--routing') + 1] : '0.2.0';
  const rows = impliedRows(events, routing);
  if (args.includes('--coverage')) { const out = args[args.indexOf('--coverage') + 1]; writeFileSync(out, coverage(events, rows)); console.error(`coverage → ${out}`); }
  console.log(JSON.stringify(rows));
}
