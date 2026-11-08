import { describe, expect, it } from 'vitest';

import { readSharedText } from '../sharedText';

describe('readSharedText', () => {
  it('takes a bare address from Chrome as a page to import', () => {
    expect(readSharedText('https://www.recipetineats.com/lasagna/')).toEqual({
      kind: 'url',
      url: 'https://www.recipetineats.com/lasagna/',
    });
  });

  it('ignores a title or caption around the address', () => {
    expect(readSharedText('Lasagna | RecipeTin Eats\nhttps://www.recipetineats.com/lasagna/')).toEqual({
      kind: 'url',
      url: 'https://www.recipetineats.com/lasagna/',
    });
    expect(readSharedText('Try this one (https://example.com/pie).')).toEqual({ kind: 'url', url: 'https://example.com/pie' });
  });

  it("drops Chrome's highlighted-text link fragment", () => {
    expect(readSharedText('"Lemon slice" https://example.com/lemon-slice#:~:text=Lemon%20slice')).toEqual({
      kind: 'url',
      url: 'https://example.com/lemon-slice',
    });
  });

  it('treats shared recipe text as text to sort, keeping the page as its source', () => {
    const shared = [
      'Lemon slice',
      'Serves 12',
      '',
      'Ingredients',
      '250 g Marie biscuits, crushed',
      '1/2 cup condensed milk',
      '',
      'Method',
      '1. Mix the biscuits and condensed milk.',
      '2. Press into a tin and chill.',
      '',
      'https://example.com/lemon-slice',
    ].join('\n');
    const result = readSharedText(shared);
    expect(result).toEqual({
      kind: 'text',
      text: shared.replace('\n\nhttps://example.com/lemon-slice', ''),
      sourceUrl: 'https://example.com/lemon-slice',
    });
  });

  it('treats text without a link as text to sort', () => {
    expect(readSharedText('Pancakes\n1 cup flour\n1 egg\n1 cup milk\nMix and fry.')).toEqual({
      kind: 'text',
      text: 'Pancakes\n1 cup flour\n1 egg\n1 cup milk\nMix and fry.',
      sourceUrl: null,
    });
  });

  it('returns nothing for an empty share', () => {
    expect(readSharedText('')).toBeNull();
    expect(readSharedText('   \n ')).toBeNull();
    expect(readSharedText(undefined)).toBeNull();
  });
});
