import { test, expect } from '@playwright/test';
import { signedIn } from './helpers';

const OFF_LINKS = ['Payroll', 'Payslips', 'Expenses', 'Travel', 'Recruitment', 'Performance', 'Assets', 'Policies', 'Documents', 'Overtime', 'Field duty'];
const OFF_PATHS = ['/payroll', '/payslips', '/expenses', '/travel', '/recruitment', '/performance', '/assets', '/policies', '/overtime', '/field-duty', '/loans', '/lifecycle', '/cases', '/accounting'];

test('flags off: no menu item, no route, no chunk and no API call for what is off', async ({ page, isMobile }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await signedIn(page, 'hr.head');
  if (!isMobile) {
    const nav = page.getByLabel('Main navigation');
    await expect(nav.getByRole('link', { name: 'Leave', exact: true })).toBeVisible();
    for (const label of OFF_LINKS) await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  for (const path of OFF_PATHS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(/not found|doesn.t exist|no longer/i);
  }
  expect(requested.filter((p) => /\/assets\/(Payroll|Expenses|Recruitment|Performance|Travel|Policies|Assets|Overtime|FieldDuty|Loans|Cases|Accounting)-/.test(p))).toEqual([]);
  expect(requested.filter((p) => /\/api\/v1\/(payroll|expenses|recruitment|performance|travel|policies|assets|overtime|field-duty|loans|cases|accounting)\b/.test(p))).toEqual([]);
});

test('flags off: the API agrees, the public config says so, and MFA is not offered', async ({ page, request }) => {
  const config = (await (await request.get('/api/v1/config/public')).json()) as { features: Record<string, boolean>; mfa: { available: boolean } };
  expect(config.features['FEATURE_PAYROLL']).toBe(false);
  expect(config.features['FEATURE_LEAVE']).toBe(true);
  expect(config.mfa.available).toBe(false);
  expect((await request.get('/api/v1/payroll/runs')).status()).toBe(404);
  await signedIn(page, 'analyst');
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await expect(page.getByText('Two-factor authentication')).toHaveCount(0);
});
