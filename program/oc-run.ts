/**
 * OC gate — the run. Four collapses per item (tier "deep", k = 4), each a separate, stateless Jev call with
 * its own context_id, over three frozen question trees. Writes program/results/oc-<slug>.json (per item: every
 * raw p, per-collapse thresholded answers and composed nodes, context ids) and nothing else; scoring is
 * program/oc-analyze.ts, at zero calls.
 *
 * Refuses to start if a FROZEN hash does not match, or if any result file already exists (one run per tree).
 * Budget: 4 × 318 = 1,272 calls; hard cap 1,350 including retries. Concurrency 4, exponential back-off on 429/5xx.
 *
 *   cd /Users/manu/JEV-works && source ~/.zshrc >/dev/null 2>&1; /opt/homebrew/bin/node program/oc-run.ts
 */
import { experimental_evaluate as evaluate } from 'ai';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { RunLog } from '../lib/telemetry.ts';
import { pool } from './stats.ts';
import { loadItems, type OcItem } from './oc-data.ts';
import { COLLAPSES, SLUGS, THRESHOLD, askedNodes, collapsedEdges, loadTree, nodeText, resolve, toBool, verifyFrozen, type Collapse, type Slug, type Tree } from './oc-tree.ts';

export const resultPath = (slug: Slug) => new URL(`./results/oc-${slug}.json`, import.meta.url).pathname;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
const CALL_CAP = 1350;

export type CallRec = {
  collapse: Collapse;
  /** One fresh id per successful call; failed attempts keep theirs in `failedContextIds`. */
  context_id: string | null;
  failedContextIds: string[];
  /** Raw noul p per asked node, as returned (2dp). */
  p: Record<string, number> | null;
  answeredBy: string | null;
  ms: number | null;
  attempts: number;
  inputTokens: number | null;
  error?: string;
};

export type ItemRec = {
  id: string;
  state: Record<string, string | number>;
  label: boolean | null;
  calls: Record<Collapse, CallRec>;
  /** Per collapse: R, plus every M it determines (asked or composed). null when the call failed. */
  answers: Record<Collapse, { R: boolean; M: Record<string, boolean> } | null>;
};

export type TreeResult = {
  experiment: 'op-consist';
  slug: Slug;
  toqSha256: string;
  JEV_ID: string;
  threshold: number;
  collapses: Record<Collapse, { asked: string[]; collapsed_edges: string[] | 'all' }>;
  startedAt: string;
  finishedAt: string;
  /** Attempts spent on this tree, retries included. */
  callsUsed: number;
  items: ItemRec[];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const hashes = verifyFrozen(); // throws → abort before any call
  const existing = SLUGS.filter(s => existsSync(resultPath(s)));
  if (existing.length) {
    console.error(`result file(s) exist for ${existing.join(', ')} — one run per tree. Re-score with: node program/oc-analyze.ts`);
    process.exit(1);
  }
  if (!process.env.TYPESAFE_API_KEY) console.warn('TYPESAFE_API_KEY not set; lib/jev.ts will fall back to the gateway.');

  const trees = Object.fromEntries(SLUGS.map(s => [s, loadTree(s)])) as Record<Slug, Tree>;
  const items = await loadItems();
  const nItems = SLUGS.reduce((s, k) => s + items[k].length, 0);
  const planned = nItems * COLLAPSES.length;
  console.log(`\nOC gate plan: ${COLLAPSES.length} collapses × ${nItems} items (${SLUGS.map(s => `${s} ${items[s].length}`).join(', ')}) = ${planned} evaluations; cap ${CALL_CAP} incl. retries; concurrency ${CONCURRENCY}`);
  for (const s of SLUGS) console.log(`  ${s}: toq sha256 ${hashes[s].slice(0, 16)}… verified against FROZEN.sha256`);
  if (planned > CALL_CAP) throw new Error(`plan ${planned} exceeds cap ${CALL_CAP}`);

  const log = new RunLog('oc-consist');
  log.announce({
    model: JEV_ID,
    items: planned,
    questions: Object.fromEntries(SLUGS.flatMap(s => COLLAPSES.map(c => [`${s}/${c}`, `boolean × ${askedNodes(trees[s], c).length}`]))),
    stateShape: 'hotpot {question} ~25 tok · leads 7 fields ~120 tok · doc {question, chunk} ~300 tok',
    recombination: `noul p ≥ ${THRESHOLD} → true; compose by each tree's declared AND/OR rules; OC = all 4 root answers equal`,
    thresholdsFitted: false,
    maxRetries: MAX_ATTEMPTS - 1,
  });

  let callsUsed = 0;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function call(t: Tree, item: OcItem, c: Collapse): Promise<CallRec> {
    const text = nodeText(t);
    const asked = askedNodes(t, c);
    const questions = Object.fromEntries(asked.map(id => [id, { type: 'boolean', instructions: text[id] }]));
    const failedContextIds: string[] = [];
    const blank = { p: null, answeredBy: null, ms: null, inputTokens: null, context_id: null };
    for (let attempt = 1; ; attempt++) {
      if (callsUsed >= CALL_CAP) return { collapse: c, ...blank, failedContextIds, attempts: attempt - 1, error: 'call cap reached' };
      callsUsed++;
      const context_id = `ctx-${randomUUID()}`;
      const t0 = performance.now();
      try {
        const r = await evaluate({ model: JEV, state: item.state, questions: questions as never, maxRetries: 0 });
        const answers = r.answers as unknown as Record<string, { type: string; probability: number }>;
        const p = Object.fromEntries(asked.map(id => {
          const a = answers[id];
          if (a?.type !== 'boolean' || typeof a.probability !== 'number') throw new Error(`no boolean answer for ${id}`);
          return [id, a.probability];
        }));
        return {
          collapse: c, context_id, failedContextIds, p, answeredBy: answeredBy(r),
          ms: Math.round(performance.now() - t0), attempts: attempt, inputTokens: (r as any).usage?.inputTokens ?? null,
        };
      } catch (e: any) {
        failedContextIds.push(context_id);
        const msg = String(e?.message ?? e).slice(0, 300);
        const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed|rate/i.test(msg);
        if (!transient || attempt >= MAX_ATTEMPTS) return { collapse: c, ...blank, failedContextIds, attempts: attempt, error: msg };
        log.retry(`${item.id}/${c}`, msg.slice(0, 80));
        await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
      }
    }
  }

  for (const slug of SLUGS) {
    const t = trees[slug];
    const startedAt = new Date().toISOString();
    const jobs = items[slug].flatMap(item => COLLAPSES.map(c => ({ item, c })));
    const recs = await pool(jobs, CONCURRENCY, async ({ item, c }) => {
      const r = await call(t, item, c);
      if (r.error) log.fail(`${item.id}/${c}`, r.error);
      else log.item(`${item.id}/${c}`, { verdict: c, ms: r.ms ?? undefined, inputTokens: r.inputTokens ?? undefined, p: r.p });
      return r;
    });
    const out: ItemRec[] = items[slug].map((item, k) => {
      const calls = Object.fromEntries(COLLAPSES.map((c, j) => [c, recs[k * COLLAPSES.length + j]])) as Record<Collapse, CallRec>;
      const answers = Object.fromEntries(COLLAPSES.map(c => {
        const p = calls[c].p;
        return [c, p ? resolve(t, c, Object.fromEntries(Object.entries(p).map(([id, v]) => [id, toBool(v)]))) : null];
      })) as ItemRec['answers'];
      return { id: item.id, state: item.state, label: item.label, calls, answers };
    });
    const result: TreeResult = {
      experiment: 'op-consist', slug, toqSha256: t.sha256, JEV_ID, threshold: THRESHOLD,
      collapses: Object.fromEntries(COLLAPSES.map(c => [c, { asked: askedNodes(t, c), collapsed_edges: collapsedEdges(t, c) }])) as TreeResult['collapses'],
      startedAt, finishedAt: new Date().toISOString(), callsUsed: recs.reduce((n, r) => n + r.attempts, 0), items: out,
    };
    // Persist per tree, so a crash later never forces a second run of an earlier tree.
    await writeFile(resultPath(slug), JSON.stringify(result, null, 1));
    console.log(`  ${slug} → ${resultPath(slug)} (calls so far ${callsUsed})`);
  }
  log.done();
  console.log(`done: ${callsUsed} calls. Score with: /opt/homebrew/bin/node program/oc-analyze.ts`);
}
