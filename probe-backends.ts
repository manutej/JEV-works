/**
 * Same questions through both backends, side by side. Needs the key and a live OIDC token.
 *
 *   source ~/.zshrc && node --env-file-if-exists=/Users/manu/jev-playground/.env.local probe-backends.ts
 */
import { experimental_evaluate as evaluate } from 'ai';
import { jevDirect } from './lib/jev-direct.ts';

const state = { text: "Charged twice for September. Second time this happened — I'm close to cancelling." };
const questions = {
  requestsRefund: { type: 'boolean', instructions: 'Is the customer asking for money back?' },
  churn: {
    type: 'boolean',
    instructions: 'Is this customer at risk of cancelling?',
    criteria: { true: 'They threaten to cancel or leave.', false: 'No signal they intend to leave.' },
  },
  dept: { type: 'choice', instructions: 'Which team handles this', criteria: { billing: 'payments', technical: 'bugs', sales: 'pricing' } },
  frustration: { type: 'score', instructions: 'How frustrated', criteria: ['calm', 'annoyed', 'angry'] },
} as const;

for (const [name, model] of [['direct', jevDirect()], ['gateway', 'typesafe-ai/jev']] as const) {
  const t = performance.now();
  try {
    const r = await evaluate({ model, state, questions, maxRetries: 0 });
    const a = r.answers;
    console.log(
      `${name.padEnd(8)} ${(performance.now() - t).toFixed(0).padStart(5)}ms  ${r.response.modelId}\n` +
        `  refund=${a.requestsRefund.probability} churn=${a.churn.probability} dept=${a.dept.choice} ` +
        `frustration=${a.frustration.score}` +
        (r.providerMetadata?.typesafe ? `  confidence=${JSON.stringify(r.providerMetadata.typesafe.confidence)}` : ''),
    );
  } catch (e) {
    console.log(`${name.padEnd(8)} FAILED: ${(e as Error).message.slice(0, 200)}`);
  }
}
