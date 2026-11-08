import { describe, expect, it } from 'vitest';

import { stableUuid, uuid } from '../ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ids', () => {
  it('makes random v4 UUIDs', () => {
    const a = uuid();
    expect(a).toMatch(UUID);
    expect(a[14]).toBe('4');
    expect(uuid()).not.toBe(a);
  });

  it('makes the same UUID for the same parts and different ones otherwise', () => {
    const a = stableUuid('h1', 'plan', '2026-11-09', 'dinner');
    expect(a).toMatch(UUID);
    expect(stableUuid('h1', 'plan', '2026-11-09', 'dinner')).toBe(a);
    expect(stableUuid('h2', 'plan', '2026-11-09', 'dinner')).not.toBe(a);
    expect(stableUuid('h1', 'plan', '2026-11-09', 'lunch')).not.toBe(a);
    // Parts are separated, so shifting text between them changes the id.
    expect(stableUuid('ab', 'c')).not.toBe(stableUuid('a', 'bc'));
  });

  it('spreads out over many inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(stableUuid('household', String(i)));
    expect(seen.size).toBe(5000);
  });
});
