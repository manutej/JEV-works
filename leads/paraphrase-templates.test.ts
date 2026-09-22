/**
 * The paraphrase corpus's defining property: no template can trigger any regex message pattern.
 * If this fails, a template leaks a keyword and the stress test is weaker than it claims.
 *
 *   /opt/homebrew/bin/node --test leads/paraphrase-templates.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_PATTERNS } from './baseline-patterns.ts';
import { NON_BUYER_TEMPLATES, PARAPHRASE_BUYER_TEMPLATES, SAMPLE_TEAMS } from './paraphrase-templates.ts';
import { CURRENT_SOLUTIONS, ICP_INDUSTRIES } from './word-pools.ts';

// Every slot value the generator can draw, so the check covers every message it can emit.
const renders = (templates: typeof PARAPHRASE_BUYER_TEMPLATES) =>
  templates.flatMap((t, i) =>
    SAMPLE_TEAMS.flatMap(team =>
      CURRENT_SOLUTIONS.flatMap(current => ICP_INDUSTRIES.map(industry => ({ i, text: t({ team, current, industry }) }))),
    ),
  );

for (const [kind, templates] of [['buyer', PARAPHRASE_BUYER_TEMPLATES], ['nonBuyer', NON_BUYER_TEMPLATES]] as const) {
  test(`every ${kind} template avoids every regex message pattern, for every slot value`, () => {
    const hits = renders(templates).flatMap(({ i, text }) =>
      Object.entries(MESSAGE_PATTERNS)
        .filter(([, re]) => re.test(text))
        .map(([name]) => `${kind}[${i}] matches ${name}: "${text.match(MESSAGE_PATTERNS[name as keyof typeof MESSAGE_PATTERNS])?.[0]}"`),
    );
    assert.deepEqual([...new Set(hits)], []);
  });
}

test('templates are long enough to pass the dedup minimum', () => {
  for (const { text } of [...renders(PARAPHRASE_BUYER_TEMPLATES), ...renders(NON_BUYER_TEMPLATES)]) {
    assert.ok((text.match(/[a-z0-9]+/gi) ?? []).length >= 8, text);
  }
});
