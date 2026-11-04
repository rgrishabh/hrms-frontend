import { test, expect } from '@playwright/test';
import { mockApi } from './api';
import { MIGRATED, UNMIGRATED } from './routes';

// Preview sends the same CSP as nginx. React's style prop goes through CSSOM, which `style-src 'self'`
// permits, so even pages with inline styles must produce no violations.
for (const path of [...MIGRATED, ...UNMIGRATED]) {
  test(`no CSP violation on ${path}`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => { console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`); }));
    await mockApi(page, { persona: 'hr' });
    const res = await page.goto(path);
    expect(res?.headers()['content-security-policy']).not.toContain('unsafe-inline');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });
}
