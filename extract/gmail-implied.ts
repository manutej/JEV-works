/**
 * gmail-implied.ts — implied labels for the secretary.gmail pack from Gmail thread METADATA.
 *
 *   node --experimental-strip-types extract/gmail-implied.ts <export.json> [--coverage coverage.md] [--inputs dir] [--as-of ISO]
 *
 * Input: a local read-only export (see extract/fixtures/gmail-export.sample.json for the shape): per
 * thread its id, label ids, first subject and snippet, and per-message sender / date / to-count. Never
 * bodies, never attachments. `self` lists the owner's addresses; `labels` maps label ids to names.
 * Output: label rows (label_source "implied") on stdout for `node hub/wiring/label-store.mjs add -`.
 * Every row carries a hashed thread id and a hashed subject; no sender, subject or snippet is copied.
 * With --inputs, one routing input per thread (r1.gmail.incoming state: from_class, subject, snippet,
 * labels, has_attachment, thread_len) is written for ask.mjs --record, so model rows join the implied
 * rows on the same hashed id. Those inputs carry subject and snippet and must stay out of git.
 *
 * Proxies (each a named rule; thresholds declared here, never fitted):
 *   replied_3d        needs_reply=true   the owner sent a message ≤ 3 days after a non-owner message
 *   silent_14d        needs_reply=false  last message is non-owner, ≥ 14 days old at as-of, no owner reply, not capped
 *   bulk_label        needs_reply=false  Cora/Newsletter, Cora/Promotion or Cora/Spam and no owner message
 *   cora_to_lane      lane=…             final Cora label → CETI lane by the table below (null = no label)
 *   payments_label    money_risk=true    Cora/Payments on the thread
 *   money_subject     money_risk=true    subject matches invoice|receipt|payment|overdue|remit|balance due|wire
 *   bulk_no_money     money_risk=false   bulk_label holds and the subject does not match money_subject
 *   owner_replied     act=draft_reply    replied_3d holds (a reply was warranted)
 *   labeled_untouched act=label          a Cora label, no owner message, not in INBOX (archived by the labeler)
 *   bulk_ignored      act=ignore         bulk_label holds and the thread is not in INBOX
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Msg = { sender: string; date: string; to: number };
type Thread = { threadId: string; query?: number; labelIds: string[]; subject: string; snippet: string; messages: Msg[]; preview_capped?: boolean };
type Export = { exported_at: string; self: string[]; labels: Record<string, string>; threads: Thread[]; queries?: unknown[] };
type Row = Record<string, unknown>;

export const PIN = 'jev-1.13.0';
export const REPLY_DAYS = 3, SILENT_DAYS = 14; // declared, not fitted
export const CORA_TO_LANE: Record<string, string | null> = {
  'Cora/Payments': 'collect', 'Cora/Calendar': 'deliver', 'Cora/Timely': 'deliver', 'Cora/Important Draft': 'deliver',
  'Cora/Important Info': 'remember', 'Cora/Important Context': 'remember', 'Cora/Keep In Inbox': 'remember',
  'Cora/Newsletter': 'noise', 'Cora/Promotion': 'noise', 'Cora/Spam': 'noise',
  'Cora/Action': null, 'Cora/Comments': null, 'Cora/Packages': null, 'Cora/Other': null, // ambiguous: no lane label
};
const MONEY = /\b(invoice|receipt|payment|overdue|remit|balance due|wire)\b/i;
const BULK = new Set(['Cora/Newsletter', 'Cora/Promotion', 'Cora/Spam']);
const VENDOR = /^(no-?reply|noreply|notifications?|mailer|billing|do-?not-?reply|newsletter|news|promo|info|support)@/i;

export const hash16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const norm = (s: string) => s.trim().toLowerCase().replace(/^(re|fwd?):\s*/i, '');
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;

export function fromClass(sender: string, self: Set<string>, known: Set<string>): 'self' | 'known' | 'vendor' | 'unknown' {
  const s = sender.trim().toLowerCase();
  if (self.has(s)) return 'self';
  if (VENDOR.test(s)) return 'vendor';
  return known.has(s) ? 'known' : 'unknown';
}

export function analyse(t: Thread, self: Set<string>, known: Set<string>, labels: Record<string, string>, asOf: string) {
  const names = t.labelIds.map((id) => labels[id] ?? id);
  const cora = names.filter((n) => n.startsWith('Cora/'));
  const msgs = [...t.messages].sort((a, b) => a.date.localeCompare(b.date));
  const ownerReplyWithin = msgs.some((m, i) => self.has(m.sender.toLowerCase()) && i > 0 && !self.has(msgs[i - 1].sender.toLowerCase()) && days(msgs[i - 1].date, m.date) <= REPLY_DAYS);
  const anyOwner = msgs.some((m) => self.has(m.sender.toLowerCase()));
  const last = msgs[msgs.length - 1];
  const lastNonOwnerOld = !!last && !self.has(last.sender.toLowerCase()) && !anyOwner && !t.preview_capped && days(last.date, asOf) >= SILENT_DAYS;
  const bulk = cora.some((c) => BULK.has(c)) && !anyOwner;
  const inInbox = names.includes('INBOX');
  const first = msgs[0];
  return { names, cora, ownerReplyWithin, anyOwner, lastNonOwnerOld, bulk, inInbox, money: MONEY.test(t.subject ?? ''), first_from_class: first ? fromClass(first.sender, self, known) : 'unknown', thread_len: msgs.length, capped: !!t.preview_capped };
}

export function impliedRows(exp: Export, { asOf = exp.exported_at, routing_version = '0.2.0' }: { asOf?: string; routing_version?: string } = {}) {
  const self = new Set(exp.self.map((s) => s.toLowerCase()));
  // known = anyone the owner has written to in this export (a reply from the owner exists in the thread)
  const known = new Set<string>();
  for (const t of exp.threads) if (t.messages.some((m) => self.has(m.sender.toLowerCase()))) for (const m of t.messages) if (!self.has(m.sender.toLowerCase())) known.add(m.sender.toLowerCase());
  const rows: Row[] = []; const inputs: Row[] = []; const per: Record<string, number> = {}; const skipped: Record<string, number> = {};
  const base = (t: Thread, a: ReturnType<typeof analyse>, q_key: string, label_value: unknown, name: string, rule: string, primitive: string) => ({
    schema_version: '0.1.0', ts: t.messages[0]?.date ?? asOf, source: 'gmail', id: hash16('gmail:' + t.threadId), threadId: hash16(t.threadId),
    from_class: a.first_from_class, subject_hash: hash16(norm(t.subject ?? '')), action: a.ownerReplyWithin ? 'replied' : a.cora.length && !a.inInbox ? 'labeled' : a.inInbox ? 'held' : 'unknown',
    labels: a.names.filter((n) => n.startsWith('Cora/') || ['INBOX', 'SENT', 'IMPORTANT', 'STARRED'].includes(n)), model: PIN, confidence: null, answers: null,
    routing_version, row_id: 'r1.gmail.incoming', pack: 'secretary.gmail', q_key, aggregate: false, primitive, model_answer: null, model_p: null,
    human_verdict: null, label_value, proxy: { name, rule }, label_source: 'implied', labeled_at: asOf, labeled_by: `proxy:${name}`, note: null, split: null,
  });
  for (const t of exp.threads) {
    const a = analyse(t, self, known, exp.labels, asOf);
    const add = (q: string, v: unknown, name: string, rule: string, prim: string) => { rows.push(base(t, a, q, v, name, rule, prim)); per[`${q} · ${name}`] = (per[`${q} · ${name}`] ?? 0) + 1; };
    if (a.ownerReplyWithin) add('needs_reply', true, 'replied_3d', `owner sent a message ≤ ${REPLY_DAYS} days after a non-owner message`, 'noul');
    else if (a.lastNonOwnerOld) add('needs_reply', false, 'silent_14d', `last message non-owner, ≥ ${SILENT_DAYS} days old, no owner reply, preview not capped`, 'noul');
    else if (a.bulk) add('needs_reply', false, 'bulk_label', 'Cora/Newsletter, Cora/Promotion or Cora/Spam and no owner message', 'noul');
    else skipped['needs_reply'] = (skipped['needs_reply'] ?? 0) + 1;
    const finalCora = a.cora[a.cora.length - 1]; const lane = finalCora ? CORA_TO_LANE[finalCora] : undefined;
    if (lane) add('lane', lane, 'cora_to_lane', `final Cora label ${finalCora} → ${lane} (declared table)`, 'choice'); else skipped['lane'] = (skipped['lane'] ?? 0) + 1;
    if (a.cora.includes('Cora/Payments')) add('money_risk', true, 'payments_label', 'Cora/Payments on the thread', 'noul');
    else if (a.money) add('money_risk', true, 'money_subject', 'subject matches invoice|receipt|payment|overdue|remit|balance due|wire', 'noul');
    else if (a.bulk) add('money_risk', false, 'bulk_no_money', 'bulk label and no money word in the subject', 'noul');
    else skipped['money_risk'] = (skipped['money_risk'] ?? 0) + 1;
    if (a.ownerReplyWithin) add('act', 'draft_reply', 'owner_replied', 'replied_3d holds: a reply was warranted', 'choice');
    else if (a.cora.length && !a.anyOwner && !a.inInbox && !a.bulk) add('act', 'label', 'labeled_untouched', 'a Cora label, no owner message, not in INBOX', 'choice');
    else if (a.bulk && !a.inInbox) add('act', 'ignore', 'bulk_ignored', 'bulk label and not in INBOX', 'choice');
    else skipped['act'] = (skipped['act'] ?? 0) + 1;
    inputs.push({ surface: 'gmail', direction: 'incoming', threadId: t.threadId, from_class: a.first_from_class, subject: t.subject ?? '', snippet: t.snippet ?? '', labels: a.names.filter((n) => n.startsWith('Cora/')), has_attachment: false, thread_len: a.thread_len });
  }
  const dates = exp.threads.flatMap((t) => t.messages.map((m) => m.date)).sort();
  const cov = [
    '# Gmail implied-label coverage', '', `- threads seen: ${exp.threads.length} · preview capped: ${exp.threads.filter((t) => t.preview_capped).length} · window: ${dates[0] ?? '?'} → ${dates[dates.length - 1] ?? '?'} · as-of ${asOf}`,
    `- rows produced: ${rows.length} · questions with no proxy: paper_missing (hand label only)`, '',
    '| question · proxy | rows |', '|---|---|', ...Object.entries(per).sort().map(([k, n]) => `| ${k} | ${n} |`), '',
    '| question | threads with no implied label |', '|---|---|', ...['needs_reply', 'lane', 'money_risk', 'act'].map((q) => `| ${q} | ${skipped[q] ?? 0} (${((100 * (skipped[q] ?? 0)) / Math.max(1, exp.threads.length)).toFixed(0)}%) |`), '',
    `Lane table (declared, edit in extract/gmail-implied.ts): ${Object.entries(CORA_TO_LANE).map(([k, v]) => `${k.replace('Cora/', '')}→${v ?? '∅'}`).join(', ')}`,
  ].join('\n') + '\n';
  return { rows, inputs, coverage: cov };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [, , file, ...args] = process.argv;
  if (!file) { console.error('usage: gmail-implied.ts <export.json> [--coverage coverage.md] [--inputs dir] [--as-of ISO]'); process.exit(1); }
  const exp = JSON.parse(readFileSync(file, 'utf8')) as Export;
  const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const { rows, inputs, coverage } = impliedRows(exp, { asOf: flag('--as-of') });
  const cov = flag('--coverage'); if (cov) { writeFileSync(cov, coverage); console.error(`coverage → ${cov}`); }
  const dir = flag('--inputs'); if (dir) { mkdirSync(dir, { recursive: true }); for (const i of inputs) writeFileSync(path.join(dir, `${hash16('gmail:' + String(i.threadId))}.json`), JSON.stringify(i, null, 2) + '\n'); console.error(`${inputs.length} inputs → ${dir} (subjects and snippets: keep out of git)`); }
  console.log(JSON.stringify(rows));
}
