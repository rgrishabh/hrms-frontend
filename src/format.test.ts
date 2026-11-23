import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, currencySymbol, fmtClock, fmtDate, fmtDateOfInstant, fmtMinutes, fmtMonth, localInputToIso, money, setLocalePrefs, todayLocal } from './format';

afterEach(() => { vi.useRealTimers(); setLocalePrefs({ locale: 'en-IN', currency: 'INR', dateFormat: 'DD/MM/YYYY', timezone: 'Asia/Kolkata' }); });

describe('format', () => {
  it('follows the installation locale and currency instead of a fixed India default', () => {
    expect(money(1234.5)).toBe('₹1,234.50');
    setLocalePrefs({ locale: 'en-US', currency: 'USD' });
    expect(money(1234.5)).toBe('$1,234.50');
    expect(currencySymbol()).toBe('$');
    expect(fmtMonth('2026-06-15')).toBe('June 2026');
  });
  it.each([['DD/MM/YYYY', '05/03/2026'], ['DD-MM-YYYY', '05-03-2026'], ['DD-MMM-YYYY', '05-Mar-2026'], ['YYYY-MM-DD', '2026-03-05']])('formats dates as %s', (dateFormat, out) => {
    setLocalePrefs({ dateFormat });
    expect(fmtDate('2026-03-05')).toBe(out);
  });
  it('shows a dash for no date', () => { expect(fmtDate(null)).toBe('—'); });
});

describe('dates in the organization timezone', () => {
  it('the date of an instant is the local date, not the UTC one', () => {
    expect(fmtDateOfInstant('2026-10-31T19:00:00Z')).toBe('01/11/2026');
    setLocalePrefs({ timezone: 'America/New_York' });
    expect(fmtDateOfInstant('2026-11-01T02:00:00Z')).toBe('31/10/2026');
    expect(fmtDateOfInstant(null)).toBe('—');
    expect(fmtDateOfInstant('')).toBe('—');
  });
  it('today follows the timezone across midnight', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z'));
    expect(todayLocal()).toBe('2026-11-01');
    setLocalePrefs({ timezone: 'UTC' });
    expect(todayLocal()).toBe('2026-10-31');
  });
  it('a clock time reads in the timezone asked for', () => {
    expect(fmtClock('Asia/Kolkata', new Date('2026-01-01T04:00:00Z')).toLowerCase().replace(/\s/g, ' ')).toBe('09:30 am');
    expect(fmtClock('UTC', new Date('2026-01-01T16:05:00Z')).toLowerCase().replace(/\s/g, ' ')).toBe('04:05 pm');
  });
  it('a typed local time becomes the right instant, in or out of daylight saving', () => {
    expect(localInputToIso('2026-03-01T09:30')).toBe('2026-03-01T04:00:00.000Z');
    setLocalePrefs({ timezone: 'America/New_York' });
    expect(localInputToIso('2026-01-15T09:30')).toBe('2026-01-15T14:30:00.000Z');
    expect(localInputToIso('2026-07-15T09:30')).toBe('2026-07-15T13:30:00.000Z');
  });
});

describe('small formats', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('minutes read as hours and two-digit minutes', () => {
    expect(fmtMinutes(125)).toBe('2h 05m');
    expect(fmtMinutes(0)).toBe('0h 00m');
    expect(fmtMinutes(null)).toBe('—');
  });
});
