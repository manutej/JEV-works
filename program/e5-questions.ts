/**
 * E5 — the one Jev `choice` question per target, frozen in E5-PREREG.md before any call.
 *
 * Option descriptions are written only from each field's meaning (the dataset's own definition, or
 * the FAF data dictionary) and from FIT-half rows. They are short and literal (P18 / L37). The option
 * key Jev returns is mapped back to the dataset's own label value by `toLabel`.
 */
import type { TargetName } from './e5-data.ts';

export type Question = {
  instructions: string;
  criteria: Record<string, string>;
  /** Jev option key → the dataset's label value. */
  toLabel: Record<string, string>;
};

export const QUESTIONS: Record<TargetName, Question> = {
  hotpot: {
    instructions: 'HotpotQA labels each multi-hop question by the kind of reasoning it needs. Which type is this question?',
    criteria: {
      bridge: 'Bridge: first find an entity the question only describes, then answer a fact about that entity.',
      comparison: 'Comparison: the question names two entities and compares them on one property, or asks whether both share it.',
    },
    toLabel: { bridge: 'bridge', comparison: 'comparison' },
  },
  housing: {
    instructions: 'This row describes one house for sale: price, area, rooms, floors, parking, and yes/no amenities. What is its furnishing status?',
    criteria: {
      furnished: 'Furnished: the house comes with its furniture.',
      semi_furnished: 'Semi-furnished: the house comes with some furniture or fittings, not a full set.',
      unfurnished: 'Unfurnished: the house comes without furniture.',
    },
    toLabel: { furnished: 'furnished', semi_furnished: 'semi-furnished', unfurnished: 'unfurnished' },
  },
  faf: {
    instructions: 'This row is one 2022 US freight flow from the Freight Analysis Framework, codes decoded. What type of trade is it?',
    criteria: {
      domestic: 'Domestic: moved from a US origin to a US destination.',
      import: 'Import: moved from a foreign origin to a US destination.',
      export: 'Export: moved from a US origin to a foreign destination.',
    },
    toLabel: { domestic: '1', import: '2', export: '3' },
  },
};
