import { describe, expect, it } from 'vitest';
import { loansPhrase } from './types';

describe('loansPhrase', () => {
  it('names one kind by itself, whichever word joins two', () => {
    expect(loansPhrase(['loan'], 'and')).toBe('loans');
    expect(loansPhrase(['salary_advance'], 'or')).toBe('salary advances');
  });
  it('joins both kinds with the word the sentence needs', () => {
    expect(loansPhrase(['salary_advance', 'loan'], 'and')).toBe('advances and loans');
    expect(loansPhrase(['salary_advance', 'loan'], 'or')).toBe('advances or loans');
  });
});
