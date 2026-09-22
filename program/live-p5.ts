// Live demo (2026-09-22): does top-p or entropy expose inputs with no right answer? (P5 vs P6). Run: node program/live-p5.ts
import { experimental_evaluate as evaluate } from 'ai';
import { JEV, answeredBy } from '../lib/jev.ts';
const q = { dept: { type: 'choice', instructions: 'Which support team should handle this customer message?',
  criteria: { billing: 'Charges, refunds, invoices, payment methods', technical: 'Bugs, errors, integrations not working', account: 'Login, password, profile, account settings', sales: 'Pricing questions, plans, buying more seats',
  ...(process.env.ESCAPE ? { none: 'Not a customer support request at all: empty, noise, or unrelated to our product' } : {}) } } } as const;
const cases: [string, string][] = [
  ['clean', 'I was charged twice for September, please refund one of them.'],
  ['clean', 'The Stripe integration throws a 500 error every time I sync.'],
  ['clean', "I can't log in, the password reset email never arrives."],
  ['clean', 'How much would 20 more seats on the Pro plan cost?'],
  ['garbage', ''],
  ['garbage', '🙂'],
  ['garbage', 'The mitochondria is the powerhouse of the cell.'],
  ['garbage', 'asdf qwer zxcv'],
];
const H = (p: Record<string, number>) => { const v = Object.values(p).filter(x => x > 0); return -v.reduce((a, x) => a + x * Math.log(x), 0) / Math.log(Object.keys(p).length); };
console.log('kind     choice      top-p  entropy  input');
for (const [kind, text] of cases) {
  const r = await evaluate({ model: JEV, state: { message: text }, questions: q, maxRetries: 2 });
  const a = r.answers.dept; const p = a.probabilities!;
  console.log(`${kind.padEnd(8)} ${a.choice.padEnd(10)}  ${Math.max(...Object.values(p)).toFixed(2)}   ${H(p).toFixed(2)}     ${JSON.stringify(text).slice(0, 48)}   [${answeredBy(r)}]`);
}
