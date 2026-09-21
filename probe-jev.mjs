import { experimental_evaluate as evaluate } from 'ai';
import { JEV } from './lib/jev.ts';

const { answers } = await evaluate({
  model: JEV,
  state: { text: 'run `ls -la` in the current directory and show the output' },
  questions: {
    selfContained: {
      type: 'boolean',
      instructions: 'Does the text contain everything needed to act, without exploring a codebase first?',
    },
  },
  providerOptions: { gateway: { zeroDataRetention: true } },
});
console.log(JSON.stringify(answers, null, 2));
