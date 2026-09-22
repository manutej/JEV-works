/**
 * Ask every item's state all of the spec's questions: one Jev call per item (batched questions are
 * independent, P31), through lib/jev.ts so the backend, pin and answeredBy() are the lab's.
 */
import { experimental_evaluate as evaluate } from 'ai';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { jevDirect } from '../lib/jev-direct.ts';
import { RunLog } from '../lib/telemetry.ts';
import { toSdkQuestions, type Item, type Spec } from './spec.ts';
import { normEntropy } from './stats.ts';

/** One question's answer on one item, in a backend-neutral shape. */
export type Answer =
  | { type: 'noul'; p: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; entropy: number }
  | { type: 'score'; score: number; probabilities?: Record<string, number> };

export type Row = { id: string; answers?: Record<string, Answer>; answeredBy?: string; ms: number; error?: string };

async function pool<T, R>(xs: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    for (let i = next++; i < xs.length; i = next++) out[i] = await f(xs[i]);
  }));
  return out;
}

export async function askAll(spec: Spec, items: readonly Item[], opts: { concurrency?: number } = {}): Promise<{ rows: Row[]; model: string }> {
  const model = spec.model ? (process.env.JEV_BACKEND === 'gateway' ? spec.model : jevDirect(spec.model)) : JEV;
  const modelId = spec.model ? `${spec.model} (${process.env.JEV_BACKEND === 'gateway' ? 'gateway' : 'direct'})` : JEV_ID;
  const questions = toSdkQuestions(spec.questions);
  const log = new RunLog(`kit-${spec.name}`);
  log.announce({
    model: modelId,
    items: items.length,
    questions: Object.fromEntries(Object.entries(spec.questions).map(([id, q]) =>
      [id, q.type === 'choice' ? `choice(${Object.keys(q.criteria).length})` : q.type === 'score' ? `score(${q.criteria.length})` : 'noul'])),
    stateShape: typeof items[0]?.state === 'string' ? 'text' : 'json',
    recombination: 'none in the runner (kit/run.ts scores; decision rules live in kit/gate)',
    thresholdsFitted: false,
    maxRetries: 2,
  });
  const rows = await pool(items, opts.concurrency ?? 4, async (it): Promise<Row> => {
    const t = performance.now();
    try {
      const r = await evaluate({ model, state: it.state as never, questions, maxRetries: 2 });
      const answers: Record<string, Answer> = {};
      for (const [id, a] of Object.entries(r.answers as Record<string, Record<string, unknown>>)) {
        if (a.type === 'boolean') answers[id] = { type: 'noul', p: a.probability as number };
        else if (a.type === 'choice') {
          const probabilities = (a.probabilities ?? {}) as Record<string, number>;
          answers[id] = { type: 'choice', choice: a.choice as string, probabilities, entropy: normEntropy(probabilities) };
        } else answers[id] = { type: 'score', score: a.score as number, probabilities: a.probabilities as Record<string, number> | undefined };
      }
      const ms = performance.now() - t;
      log.item(it.id, { verdict: 'answered', ms, inputTokens: r.usage.inputTokens ?? 0 });
      return { id: it.id, answers, answeredBy: answeredBy(r), ms: Math.round(ms) };
    } catch (e) {
      log.fail(it.id, (e as Error).message);
      return { id: it.id, ms: Math.round(performance.now() - t), error: (e as Error).message.slice(0, 300) };
    }
  });
  log.done();
  return { rows, model: modelId };
}
