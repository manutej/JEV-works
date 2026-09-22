/**
 * E3 validity check — written AFTER the one holdout run, when the run's own overlap diagnostic
 * (assumption A2) reported 39/39 holdout texts present in the fit set.
 *
 * Adds a `validity` block to results/e3-blind.json. Every number the run wrote is left as it was; the
 * as-run headline is kept verbatim in `headlineAsRun`. The pre-registered hypothesis is not edited —
 * PROGRAM.md's reporting contract says a badly posed test is recorded as a finding, not rewritten.
 *
 *   /opt/homebrew/bin/node program/e3-validity.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, type Hook } from './formulas.ts';

const HOLDOUT_PATH = '/Users/manu/CETI/PISCES-MARKETING/assets/ceti-silver-hooks-approved.json';
const OUT = new URL('./results/e3-blind.json', import.meta.url).pathname;
const FIT_OUT = new URL('./results/e3-fit.json', import.meta.url).pathname;

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));

async function main() {
  const out = await readJson(OUT);
  if (!out.holdout) throw new Error('run the holdout first');
  const fit: Hook[] = await readJson(CORPUS_PATH);
  const holdout: Hook[] = await readJson(HOLDOUT_PATH);
  const fitById = new Map(fit.map(h => [h.id, h]));

  const sameId = holdout.filter(h => fitById.has(h.id));
  const sameText = sameId.filter(h => fitById.get(h.id)!.text === h.text);
  const sameLabel = sameId.filter(h => fitById.get(h.id)!.formula === h.formula);
  const statusCounts = (xs: Hook[]) => xs.reduce<Record<string, number>>((m, h) => ((m[h.status] = (m[h.status] ?? 0) + 1), m), {});

  // Jev's holdout answers against its own fit-run answers on the same items: a free determinism check.
  const fitPreds = new Map<string, string | null>((await readJson(FIT_OUT)).variants[out.frozen.variant].preds.map((p: any) => [p.id, p.choice]));
  const rows: Array<{ id: string; choice: string | null }> = out.holdout.rows;
  const sameChoice = rows.filter(r => fitPreds.get(r.id) === r.choice).length;

  // freeze stamped JEV_ID from its own process, which ran without TYPESAFE_API_KEY and so resolved to the
  // gateway id. freeze makes no model calls; the fit and holdout runs went through direct (e3-fit.json
  // `model`, and the holdout RunLog announce). Corrected here, with the wrong value kept.
  const fitModel: string = (await readJson(FIT_OUT)).model;
  if (out.model !== fitModel) {
    out.corrections ??= [];
    if (!out.corrections.some((c: any) => c.field === 'model'))
      out.corrections.push({
        field: 'model',
        recordedAtFreeze: out.model,
        corrected: fitModel,
        why: 'freeze ran without TYPESAFE_API_KEY so JEV_ID resolved to the gateway; freeze makes no calls. Fit runs record jev-latest (direct) and the holdout RunLog announced "model jev-latest (direct)" (p50 124 ms, consistent with direct).',
      });
    out.model = fitModel;
  }

  const valid = sameId.length === 0;
  out.headlineAsRun ??= out.headline;
  out.headline = valid
    ? out.headlineAsRun
    : `E3 VOID: holdout ⊂ fit set (${sameId.length}/${holdout.length}); as-run Jev ${pct(out.result.holdoutAccuracy)} vs keyword ${pct(out.baseline.holdoutAccuracy)} is in-sample`;
  if (out.headline.length >= 140) out.headline = out.headline.slice(0, 137) + '...';
  out.validity = {
    addedAfterRun: true,
    valid,
    verdict: valid ? 'valid' : 'VOID — not a blind test; the pre-registered hypothesis could not be tested with this data',
    because: {
      holdoutIdsInFitSet: `${sameId.length}/${holdout.length}`,
      identicalText: `${sameText.length}/${holdout.length}`,
      identicalLabel: `${sameLabel.length}/${holdout.length}`,
      holdoutStatus: statusCounts(holdout),
      fitStatus: statusCounts(fit),
      explanation:
        'ceti-silver-hooks-approved.json is exactly the status="approved" rows of ceti-silver-hooks.json. Both the v2 option descriptions and the E3 keyword rules were written by reading all 80 labelled fit items, so the "holdout" was seen during fitting by both systems.',
    },
    mechanicalOutcome: {
      falsified: out.falsified,
      falsifiedBecause: out.falsifiedBecause,
      reading:
        `The falsifier fired (keyword − Jev = ${(-out.delta.holdoutVsBaseline).toFixed(2)} ≥ 0.11) but on in-sample data: it shows hand-written regexes memorise 80 items harder than 9 option descriptions do, which says nothing about which transfers to unseen hooks.`,
    },
    byProducts: {
      jevRepeatability: `${sameChoice}/${rows.length} identical choices between the fit run and the holdout run on the same items (direct backend, same question)`,
      unfittedComparison:
        'The only fitting-free comparison on these items: E1 wording (v1) vs E1 unfitted keyword baseline — see results/e3-fit.json v1 and fit.baselines.e1Keyword.',
    },
    neededToTestE3: 'A labelled hook set disjoint from the 80 (by id and normalised text), checked blind — by hashing texts and printing only the overlap count — BEFORE the run.',
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.error(out.headline);
}

main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
