/**
 * OC gate — the items each tree is run on. No model calls here.
 *
 *   hotpot-type      150 items from the E5 TEST split (the first 150 in E5's cap-hash order), state {question}.
 *                    Gold `type` (comparison = true) is carried for the OC-vs-correctness log only.
 *   leads-qualified  150 of the 600 DEV seed-42 records: the 150 smallest sha256("oc:42:lead:<id>"). State is
 *                    exactly the 7 fields the tree's `state` line names. `trueQualified` from truth-42.json is for
 *                    logging only. Holdout seeds 7 / 2718 / p6029 / 6011 are never opened here.
 *   doc-admit        all 18 states of question-bank/doc-relevance-states.json, {question, chunk}. Label-free.
 *
 *   /opt/homebrew/bin/node program/oc-data.ts     # print counts, label balance, privacy-scan hits
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildTargets, scanState } from './e5-data.ts';
import type { Slug } from './oc-tree.ts';

export const N_PER_TREE = { 'hotpot-type': 150, 'leads-qualified': 150, 'doc-admit': 18 } as const satisfies Record<Slug, number>;

export type OcItem = { id: string; state: Record<string, string | number>; label: boolean | null };

const root = new URL('../', import.meta.url).pathname;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

async function hotpot(): Promise<OcItem[]> {
  const { hotpot } = await buildTargets();
  return hotpot.test.slice(0, N_PER_TREE['hotpot-type']).map(i => ({ id: i.id, state: { question: String(i.state.question) }, label: i.label === 'comparison' }));
}

const LEAD_FIELDS = ['companyName', 'industry', 'employeeBand', 'country', 'contactTitle', 'inboundMessage', 'websiteBlurb'] as const;

async function leads(): Promise<OcItem[]> {
  const records: Record<string, unknown>[] = JSON.parse(await readFile(root + 'leads/corpus/leads-42.json', 'utf8'));
  const truth: Record<string, { trueQualified: boolean }> = JSON.parse(await readFile(root + 'leads/corpus/truth-42.json', 'utf8'));
  return records
    .map(r => [hash(`oc:42:lead:${r.id}`), r] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, N_PER_TREE['leads-qualified'])
    .map(([, r]) => {
      const id = String(r.id);
      if (!(id in truth)) throw new Error(`truth-42 has no ${id}`);
      return { id, state: Object.fromEntries(LEAD_FIELDS.map(f => [f, String(r[f] ?? '')])), label: truth[id].trueQualified };
    });
}

async function docs(): Promise<OcItem[]> {
  const states: { question: string; chunk: string }[] = JSON.parse(await readFile(root + 'question-bank/doc-relevance-states.json', 'utf8'));
  if (states.length !== N_PER_TREE['doc-admit']) throw new Error(`doc-relevance-states has ${states.length}, expected 18`);
  return states.map((s, k) => ({ id: `doc:${k}`, state: { question: s.question, chunk: s.chunk }, label: null }));
}

export async function loadItems(): Promise<Record<Slug, OcItem[]>> {
  return { 'hotpot-type': await hotpot(), 'leads-qualified': await leads(), 'doc-admit': await docs() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = await loadItems();
  for (const [slug, items] of Object.entries(all)) {
    const pos = items.filter(i => i.label === true).length;
    const hits = items.flatMap(i => scanState(i.state).map(h => `${i.id}:${h.kind}`));
    console.log(`${slug.padEnd(16)} n ${items.length}  label true ${items[0].label === null ? 'n/a' : pos}  unique ids ${new Set(items.map(i => i.id)).size}  privacy hits ${hits.length} ${hits.slice(0, 5).join(' ')}`);
  }
}
