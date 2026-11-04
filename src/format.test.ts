import { afterEach, describe, expect, it } from 'vitest';
import { currencySymbol, fmtDate, fmtMonth, money, setLocalePrefs } from './format';

afterEach(() => setLocalePrefs({ locale: 'en-IN', currency: 'INR', dateFormat: 'DD/MM/YYYY', timezone: 'Asia/Kolkata' }));

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
