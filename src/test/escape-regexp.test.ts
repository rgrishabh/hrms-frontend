import { describe, expect, it } from 'vitest';
import { escapeRegExp } from '../../e2e/escape-regexp';

describe('escapeRegExp', () => {
  it.each(['Analytical Chemist — ICP-MS (E2E abc)', 'C++ [senior]', 'a.b*c?d^e$f|g', '{1,2}', 'back\\slash', '\\d'])('matches %s literally and nothing else', (text) => {
    const re = new RegExp(`^${escapeRegExp(text)}$`);
    expect(re.test(text)).toBe(true);
    expect(re.test(`${text}x`)).toBe(false);
  });
  it('a dot is a dot, a backslash is not an escape', () => {
    expect(new RegExp(escapeRegExp('a.c')).test('abc')).toBe(false);
    expect(new RegExp(escapeRegExp('\\d')).test('1')).toBe(false);
  });
});
