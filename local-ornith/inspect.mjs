import { experimental_evaluate as evaluate } from 'ai';
import { FLEET_ROUTING } from './bank.mjs';
const { answers } = await evaluate({
  model: 'typesafe-ai/jev',
  state: { request: 'Run `git status` in this repo and show me the output.' },
  questions: { taskKind: FLEET_ROUTING.questions.taskKind },
  providerOptions: { gateway: { zeroDataRetention: true } },
});
console.log(JSON.stringify(answers.taskKind, null, 2));
