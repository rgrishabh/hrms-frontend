// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { anyFlagOn, moduleEnabled } from './features';

describe('moduleEnabled', () => {
  it('maps a module key to its flag', () => {
    expect(moduleEnabled({ FEATURE_PAYSLIPS: true }, 'payroll.payslips')).toBe(true);
    expect(moduleEnabled({ FEATURE_PAYSLIPS: false }, 'payroll.payslips')).toBe(false);
  });
  it('treats loans as on when either loans or salary advance is on', () => {
    expect(moduleEnabled({ FEATURE_SALARY_ADVANCE: true }, 'advances_loans')).toBe(true);
  });
  it('hides an unknown key', () => { expect(moduleEnabled({ FEATURE_LEAVE: true }, 'nope')).toBe(false); });
});

describe('anyFlagOn', () => {
  it('is on with no flags', () => { expect(anyFlagOn({}, undefined)).toBe(true); });
  it('needs one true flag; a missing flag is off', () => {
    expect(anyFlagOn({}, ['FEATURE_POSH'])).toBe(false);
    expect(anyFlagOn({ FEATURE_GRIEVANCE: true }, ['FEATURE_POSH', 'FEATURE_GRIEVANCE'])).toBe(true);
  });
});
