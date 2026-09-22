/**
 * HYDRATE — one context JSON becomes everything a new scenario needs, with no new code:
 *   toKitSpec    a kit spec (questions + items + decision) that kit/run.ts runs as-is
 *   toMetaPrompt an example-agnostic reviewer prompt (human or LLM) with the same questions and rules
 *   atomsAsItems every question of a context as an item, so the meta-type context can ask Jev about it
 * Pure: no I/O. The CLI (cli.ts) reads and writes files.
 */
import type { Item, Question, Spec } from '../spec.ts';
import type { Atom, Context, Module } from './meta-type.ts';

/** Strip the meta-type's annotations: the API receives exactly the documented question shape. */
export const toQuestion = ({ polarity, reads, escapeOption, note, ...q }: Atom): Question => q as Question;

export function moduleOf(c: Context, name: string): Module {
  const m = c.modules.find(x => x.name === name);
  if (!m) throw new Error(`context ${c.name} has no module "${name}" (modules: ${c.modules.map(x => x.name).join(', ')})`);
  return m;
}

/** Items must carry only the artifact's declared fields: the rest never reaches the API. */
export function toKitSpec(c: Context, moduleName: string, items: Item[], extra: Partial<Spec> = {}): Spec {
  const m = moduleOf(c, moduleName);
  const allowed = new Set(c.artifact.stateFields);
  const trimmed = items.map(it => {
    const s = it.state as Record<string, unknown>;
    const extraKeys = typeof s === 'object' && s ? Object.keys(s).filter(k => !allowed.has(k)) : [];
    if (extraKeys.length) throw new Error(`item ${it.id}: state has fields the context does not declare: ${extraKeys.join(', ')}`);
    return it;
  });
  return {
    name: `${c.name}.${m.name}`.replace(/[^a-z0-9-]+/g, '-'),
    description: `${c.description} Module: ${m.purpose}`,
    questions: Object.fromEntries(Object.entries(m.questions).map(([id, a]) => [id, toQuestion(a)])),
    decision: m.compose as unknown as Spec['decision'],
    ...extra,
    items: trimmed,
  };
}

const esc = (s: unknown) => String(typeof s === 'string' ? s : JSON.stringify(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function toMetaPrompt(c: Context): string {
  const modules = c.modules.map(m => {
    const qs = Object.entries(m.questions).map(([id, a]) => {
      const crit = a.criteria === undefined ? '' : ` criteria="${esc(a.criteria)}"`;
      return `    <question id="${id}" type="${a.type}" polarity="${a.polarity}" reads="${a.reads.join(',')}"${crit}>${esc(a.instructions)}</question>`;
    });
    const nfj = (m.notForJev ?? []).map(n => `    <for_code judgement="${esc(n.judgement)}">${esc(n.instead)}</for_code>`);
    return [`  <module name="${m.name}" purpose="${esc(m.purpose)}">`, ...qs,
      `    <compose positive="${esc(m.compose.positive)}">${esc(m.compose)}</compose>`, ...nfj, '  </module>'].join('\n');
  });
  return `<system>
You review one ${c.artifact.type} for the context "${c.name}": ${c.description}
Answer every question from this artifact alone. Never compare it with another artifact, never count,
never answer from what is typical. If the artifact cannot answer a question, say "unsure".
</system>
<artifact fields="${c.artifact.stateFields.join(',')}">{{artifact}}</artifact>
<modules>
${modules.join('\n')}
</modules>
<procedure>
1. Answer each question: a noul as yes / no / unsure with P(yes); a choice as one option; a score as a level.
2. Compose each module by its rules, in order; the first rule that holds decides, otherwise its default.
3. If you also hold a direct, gut verdict for a module, compare it with the composed one. Report any
   disagreement with both answers. Do not resolve it.
4. List every for_code judgement as a check for code to run. Do not answer it yourself.
</procedure>
<output>json {"answers": {id: answer}, "modules": {name: true|false|"escalate"}, "disagreements": [..], "for_code": [..]}</output>`;
}

/** Self-application: each question of a context, as an item the meta-type context can evaluate. */
export function atomsAsItems(c: Context): Item[] {
  return c.modules.flatMap(m =>
    Object.entries(m.questions).map(([id, a]) => ({
      id: `${m.name}.${id}`,
      state: { instructions: a.instructions, type: a.type, criteria: (a.criteria ?? null) as any, artifactType: c.artifact.type },
    })),
  );
}
