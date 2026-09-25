/**
 * Jev over TypeSafe's own API — an AI SDK evaluation model, so `evaluate()` call sites are unchanged.
 *
 * The gateway path needs a Vercel OIDC token that expires every ~12h. This path needs only
 * TYPESAFE_API_KEY, which does not. Wire shapes differ in one place: the SDK's `boolean` question
 * is TypeSafe's `noul`, and its answer comes back as `{ noul: p }` rather than `{ probability: p }`.
 *
 * TypeSafe also returns a `confidence` per choice/score answer that the SDK answer type has no
 * slot for. It is kept, not dropped: `providerMetadata.typesafe.confidence[questionId]`.
 *
 *   const { answers } = await evaluate({ model: jevDirect(), state, questions });
 */
import type {
  Experimental_EvaluationModelV4 as EvaluationModelV4,
  Experimental_EvaluationModelV4Answer as Answer,
  Experimental_EvaluationModelV4CallOptions as CallOptions,
  Experimental_EvaluationModelV4Question as Question,
} from '@ai-sdk/provider';
import { ENDPOINT, PIN } from '../.jev/jev-core.ts';

type WireAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; confidence?: number; probabilities?: Record<string, number> };

type WireResponse = {
  model: string;
  answers: Record<string, WireAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

const toWire = (q: Question) => (q.type === 'boolean' ? { ...q, type: 'noul' as const } : q);

/**
 * The API rounds probabilities to 2dp, so its `choice` can tie or lose to another option after rounding.
 * AI SDK core rejects an answer whose choice is not a highest-probability option
 * ("did not select a highest-probability option"). Keep the API's choice on a tie, else take the rounded argmax.
 */
function argmaxChoice(a: { choice: string; probabilities?: Record<string, number> }): string {
  const p = a.probabilities;
  if (!p || !(a.choice in p)) return a.choice;
  const max = Math.max(...Object.values(p));
  return p[a.choice] === max ? a.choice : Object.keys(p).find(k => p[k] === max)!;
}

function fromWire(a: WireAnswer): Answer {
  switch (a.type) {
    case 'noul':
      return { type: 'boolean', probability: a.noul };
    case 'choice':
      return { type: 'choice', choice: argmaxChoice(a), probabilities: a.probabilities };
    case 'score':
      return { type: 'score', score: a.score, probabilities: a.probabilities };
  }
}

/** Defaults to the contract pin. Pass another id only on purpose (e.g. `jev-latest` in program/drift.ts). */
export function jevDirect(
  modelId: string = PIN,
  apiKey = process.env.TYPESAFE_API_KEY,
): EvaluationModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'typesafe',
    modelId,
    supportedQuestionTypes: ['boolean', 'choice', 'score'],

    async doEvaluate({ state, questions, abortSignal, headers }: CallOptions) {
      if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set — export it (see ~/.zshrc) or use JEV_BACKEND=gateway');

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: abortSignal,
        headers: {
          ...Object.fromEntries(Object.entries(headers ?? {}).filter(([, v]) => v !== undefined)) as Record<string, string>,
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          state,
          questions: Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, toWire(q)])),
        }),
      });

      const text = await res.text();
      // The body is echoed on failure; it never contains the key, which only travels in the header.
      if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${text.slice(0, 500)}`);
      const body = JSON.parse(text) as WireResponse;

      const confidence = Object.fromEntries(
        Object.entries(body.answers)
          .filter(([, a]) => a.type !== 'noul' && a.confidence !== undefined)
          .map(([id, a]) => [id, (a as { confidence: number }).confidence]),
      );

      return {
        answers: Object.fromEntries(Object.entries(body.answers).map(([id, a]) => [id, fromWire(a)])),
        // Direct API rounds to 2dp; declaring it lets core tolerate distributions summing to 0.99/1.01.
        rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
        usage: { inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens },
        // Every override of the API's own choice is surfaced, never silent.
        warnings: Object.entries(body.answers)
          .filter(([, a]) => a.type === 'choice' && argmaxChoice(a) !== a.choice)
          .map(([id, a]) => ({
            type: 'other' as const,
            message: `typesafe: "${id}" choice "${(a as { choice: string }).choice}" is not the argmax of its 2dp-rounded probabilities; using "${argmaxChoice(a as { choice: string; probabilities?: Record<string, number> })}"`,
          })),
        providerMetadata: { typesafe: { confidence } },
        response: { modelId: body.model, timestamp: new Date(), body },
      };
    },
  };
}
