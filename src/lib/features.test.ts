// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { anyFlagOn } from './features';

describe('anyFlagOn', () => {
  it('is on with no flags', () => { expect(anyFlagOn({}, undefined)).toBe(true); });
  it('needs one true flag; a missing flag is off', () => {
    expect(anyFlagOn({}, ['FEATURE_POSH'])).toBe(false);
    expect(anyFlagOn({ FEATURE_GRIEVANCE: true }, ['FEATURE_POSH', 'FEATURE_GRIEVANCE'])).toBe(true);
  });
});
