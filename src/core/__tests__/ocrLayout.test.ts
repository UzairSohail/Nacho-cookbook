import { describe, expect, it } from 'vitest';

import { blockLines, linesToBlocks, ocrToText, orderBlocks, splitAtGaps, type OcrBlock, type OcrWord } from '../ocrLayout';
import { parseRecipeText } from '../recipeText';

/** A block whose lines stack 30 px apart from (left, top). */
function block(left: number, top: number, width: number, lines: string[]): OcrBlock {
  return {
    left,
    top,
    width,
    height: lines.length * 30,
    lines: lines.map((text, i) => ({ text, left, top: top + i * 30, width, height: 26 })),
  };
}

/**
 * A two-column cookbook page as text recognition returns it: a title across
 * the top, ingredients on the left, a wrapped method on the right, blocks out
 * of order.
 */
const PAGE: OcrBlock[] = [
  block(620, 300, 540, ['Method']),
  block(620, 360, 540, ['1. Preheat the oven to 180°C. Grease and line a', '20 cm square tin.']),
  block(40, 300, 500, ['Ingredients']),
  block(620, 440, 540, ['2. Melt the butter and chocolate together, then', 'stir in the sugar and eggs.', '3. Fold in the flour and bake for 25 minutes.']),
  block(40, 40, 1120, ['Fudgy brownies']),
  block(40, 360, 500, ['200 g dark chocolate', '150 g butter, chopped into', 'cubes', '1 cup caster sugar', '3eggs', '¾ cup plain flour']),
  block(40, 120, 1120, ['Serves 12']),
];

describe('orderBlocks', () => {
  it('reads full-width blocks first, then the left column, then the right', () => {
    const order = orderBlocks(PAGE).map((b) => b.lines[0].text);
    expect(order).toEqual([
      'Fudgy brownies',
      'Serves 12',
      'Ingredients',
      '200 g dark chocolate',
      'Method',
      '1. Preheat the oven to 180°C. Grease and line a',
      '2. Melt the butter and chocolate together, then',
    ]);
  });
});

describe('blockLines', () => {
  it('joins a wrapped ingredient but keeps one ingredient per line', () => {
    expect(blockLines(PAGE[5])).toEqual([
      '200 g dark chocolate',
      '150 g butter, chopped into cubes',
      '1 cup caster sugar',
      '3 eggs',
      '¾ cup plain flour',
    ]);
  });

  it('joins a wrapped method paragraph, splitting at step numbers', () => {
    expect(blockLines(PAGE[3])).toEqual([
      '2. Melt the butter and chocolate together, then stir in the sugar and eggs.',
      '3. Fold in the flour and bake for 25 minutes.',
    ]);
  });

  it('keeps a heading on its own line and mends a hyphenated word', () => {
    expect(blockLines(block(0, 0, 400, ['Method', 'Beat the butter until soft-', 'ened and pale, about five minutes in total.']))).toEqual([
      'Method',
      'Beat the butter until softened and pale, about five minutes in total.',
    ]);
  });
});

describe('ocrToText', () => {
  it('gives text the paste-text reader turns into a recipe', () => {
    const recipe = parseRecipeText(ocrToText(PAGE));
    expect(recipe.title).toBe('Fudgy brownies');
    expect(recipe.servings).toBe(12);
    expect(recipe.ingredients[0].items).toEqual([
      '200 g dark chocolate',
      '150 g butter, chopped into cubes',
      '1 cup caster sugar',
      '3 eggs',
      '¾ cup plain flour',
    ]);
    expect(recipe.instructions[0].steps).toEqual([
      'Preheat the oven to 180°C. Grease and line a 20 cm square tin.',
      'Melt the butter and chocolate together, then stir in the sugar and eggs.',
      'Fold in the flour and bake for 25 minutes.',
    ]);
  });

  it('copes with nothing recognised', () => {
    expect(ocrToText([])).toBe('');
  });
});

describe('rebuilding paragraphs from words (web)', () => {
  /** Words of one line, each 10 px per letter with a 10 px space, starting at x. */
  const words = (top: number, ...runs: Array<[number, string]>): OcrWord[] =>
    runs.flatMap(([x, text]) => {
      let left = x;
      return text.split(' ').map((w) => {
        const word = { text: w, left, top, width: w.length * 10, height: 24 };
        left += w.length * 10 + 10;
        return word;
      });
    });

  it('splits a line read across two columns', () => {
    const lines = splitAtGaps(words(0, [0, '1 cup yoghurt'], [400, '1. Preheat the oven']));
    expect(lines.map((l) => [l.text, l.left])).toEqual([
      ['1 cup yoghurt', 0],
      ['1. Preheat the oven', 400],
    ]);
  });

  it('groups close lines in the same column, and reads the columns in order', () => {
    const lines = [
      ...splitAtGaps(words(0, [0, 'Ingredients'], [400, 'Method'])),
      ...splitAtGaps(words(50, [0, '1 cup yoghurt'], [400, '1. Preheat the oven to 180°C and'])),
      ...splitAtGaps(words(78, [400, 'grease a tin.'])),
      ...splitAtGaps(words(120, [0, '3 eggs'], [400, '2. Whisk everything together.'])),
    ];
    expect(ocrToText(linesToBlocks(lines))).toBe(
      'Ingredients\n\n1 cup yoghurt\n\n3 eggs\n\nMethod\n\n1. Preheat the oven to 180°C and grease a tin.\n\n2. Whisk everything together.',
    );
  });
});
