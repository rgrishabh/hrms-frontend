import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { ALL_FEATURES, mockApi } from './api';

const FEATURES = { ...ALL_FEATURES, FEATURE_ATTENDANCE_BIOMETRIC: true, FEATURE_ATTENDANCE_GEOFENCE: true };
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const problem = (status: number, title: string) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status }) });

async function axe(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  const found = await page.evaluate(async () => (await (window as unknown as { axe: { run: (o: object) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations);
  return found.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 160)}`);
}

// The shared suites run with the default feature set; these two tabs need flags it does not turn on.
for (const tab of ['devices', 'geofences']) {
  test.describe(`attendance setup ${tab}, flags on`, () => {
    test('phone: cards, no sideways scroll, 44px', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await mockApi(page, { persona: 'admin', features: FEATURES });
      await page.goto(`/attendance/admin?tab=${tab}`);
      await expect(page.locator('.table-card').first()).toBeVisible();
      await expect(page.locator('main table')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main button, main a.btn, main select, main input:not([type="checkbox"])')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map((el) => el.textContent));
      expect(small).toEqual([]);
    });
    for (const theme of ['light', 'dark']) {
      test(`axe, ${theme}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('hrms.theme', t), theme);
        await mockApi(page, { persona: 'admin', features: FEATURES });
        await page.goto(`/attendance/admin?tab=${tab}`);
        await expect(page.getByRole('table').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await axe(page)).toEqual([]);
      });
    }
    test('screenshot', async ({ page }) => {
      test.skip(!process.env.SCREENSHOT_DIR);
      for (const [width, theme] of [[360, 'light'], [360, 'dark'], [1440, 'light'], [1440, 'dark']] as const) {
        await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
        await page.addInitScript((t) => localStorage.setItem('hrms.theme', t), theme);
        await mockApi(page, { persona: 'admin', features: FEATURES });
        await page.goto(`/attendance/admin?tab=${tab}`);
        await page.waitForLoadState('networkidle');
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/attendance-setup-${tab}-flags-${width}-${theme}.png`, fullPage: width === 360 });
      }
    });
  });
}

test('roster at 360: a team reads one day at a time, and a day can be changed with a 44px target', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockApi(page, { persona: 'admin' });
  let put: { reason?: string } = {};
  await page.route('**/api/v1/attendance/roster-overrides', (r) => { put = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/attendance/roster');
  await expect(page.getByRole('table')).toHaveCount(0);
  const list = page.getByRole('list', { name: /Roster for/ });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  const button = list.getByRole('listitem').first().getByRole('button');
  await expect(button).toHaveAccessibleName(/Asha Rao, .*: (GEN|Off|Holiday|NIGHT-ROTATION-LONG)/);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  const dlg = page.getByRole('dialog', { name: /Asha Rao: / });
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg.getByText('Say why, in at least 3 characters').or(dlg.locator('[aria-invalid="true"]'))).toBeVisible();
  await dlg.getByLabel(/^Reason/).fill('Swap with a colleague');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Day changed')).toBeVisible();
  expect(put.reason).toBe('Swap with a colleague');
});

test('roster on desktop keeps table semantics, and read-only people get no buttons', async ({ page }) => {
  await mockApi(page, { persona: 'employee' });
  await page.goto('/attendance/roster');
  const rows = page.getByRole('table', { name: 'Roster' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Asha Rao');
  await expect(rows.first().getByRole('button')).toHaveCount(0);
});

test('team attendance: the name is a link, keyboard reaches the record, a recalculation reports', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/attendance/recalculate', (r) => r.fulfill({ json: { daysCalculated: 3, lockedDaysSkipped: 1 } }));
  await page.goto('/attendance/team');
  await page.getByRole('button', { name: 'Recalculate this day' }).click();
  await expect(page.getByText('Recalculated 3 day(s), 1 locked day(s) skipped')).toBeVisible();
  await page.getByRole('link', { name: 'Asha Rao' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/employees\/e1\?tab=attendance/);
});

test('devices: a failed disable stays open with the reason; a rotated key cannot be dismissed by accident', async ({ page }) => {
  await mockApi(page, { persona: 'admin', features: FEATURES });
  await page.route('**/api/v1/attendance/devices/d1', (r) => r.fulfill(problem(409, 'The device is mid-sync')));
  await page.route('**/api/v1/attendance/devices/d1/rotate-key', (r) => r.fulfill({ json: { apiKey: 'hrms_NEWKEY' } }));
  await page.goto('/attendance/admin?tab=devices');
  const row = page.getByRole('row').filter({ hasText: 'Main gate' });
  await row.getByRole('button', { name: 'Disable' }).click();
  const dlg = page.getByRole('dialog', { name: 'Disable device' });
  await dlg.getByRole('button', { name: 'Disable' }).click();
  await expect(dlg).toContainText('The device is mid-sync');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await row.getByRole('button', { name: 'Rotate key' }).click();
  await page.getByRole('dialog', { name: 'Rotate device key' }).getByRole('button', { name: 'Rotate key' }).click();
  const key = page.getByRole('dialog', { name: 'Device API key' });
  await expect(key).toContainText('hrms_');
  await page.keyboard.press('Escape');
  await expect(key).toBeVisible();
  await key.getByRole('button', { name: 'Done' }).click();
  await expect(key).toHaveCount(0);
});

test('geofence: range errors at the field, then saved; removal can be undone', async ({ page }) => {
  await mockApi(page, { persona: 'admin', features: FEATURES });
  const puts: { radiusMeters?: number }[] = [];
  await page.route('**/api/v1/attendance/geofences/*', (r) => {
    if (r.request().method() === 'PUT') puts.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto('/attendance/admin?tab=geofences');
  await page.getByRole('button', { name: 'Set area' }).first().click();
  const dlg = page.getByRole('dialog', { name: /^Geofence for / });
  await dlg.getByLabel(/^Latitude/).fill('95');
  await dlg.getByLabel(/^Longitude/).fill('73.85');
  await dlg.getByLabel(/^Radius/).fill('5');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg.getByText('Enter a latitude from -90 to 90')).toBeVisible();
  await expect(dlg.getByText('Enter whole metres from 10 to 100000')).toBeVisible();
  expect(puts).toHaveLength(0);
  await dlg.getByLabel(/^Latitude/).fill('18.52');
  await dlg.getByLabel(/^Radius/).fill('300');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Geofence saved')).toBeVisible();
  expect(puts[0]?.radiusMeters).toBe(300);
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page.getByRole('dialog', { name: 'Remove geofence' }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Geofence restored')).toBeVisible();
  expect(puts[1]?.radiusMeters).toBe(250);
});

test('roster pattern: clearing the cycle length keeps the days, and a bad length shows at the field', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/attendance/admin?tab=rosters');
  await page.getByRole('button', { name: 'New pattern' }).click();
  const dlg = page.getByRole('dialog', { name: 'New roster pattern' });
  await dlg.getByLabel('Day 7').selectOption({ label: 'GEN' });
  await dlg.getByLabel(/Days in the cycle/).fill('');
  await expect(dlg.getByLabel('Day 7')).toHaveValue('s1');
  await dlg.getByLabel(/Days in the cycle/).fill('60');
  await dlg.getByLabel(/^Code/).fill('X');
  await dlg.getByLabel(/^Name/).fill('New');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg.locator('[aria-invalid="true"]')).toHaveCount(1);
});

test('overtime: claim as compensatory off; a validation error, then success; a failed withdraw stays open', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/overtime/claims/ot1/withdraw', (r) => r.fulfill(problem(409, 'Already approved')));
  await page.goto('/overtime');
  const row = page.getByRole('table', { name: 'Overtime to claim' }).getByRole('row').filter({ has: page.locator('td:nth-child(5)', { hasText: '4h 05m' }) });
  await row.getByRole('button', { name: 'Claim' }).click();
  const form = page.getByRole('dialog', { name: /^Claim overtime — / });
  await expect(form.getByRole('radio', { name: /^Pay/ })).toBeDisabled();
  await expect(form.getByRole('radio', { name: /^Compensatory off/ })).toBeChecked();
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(form.getByLabel(/^Reason/)).toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel(/^Reason/).fill('Quarter close');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Overtime claimed; sent for approval')).toBeVisible();
  await page.getByRole('table', { name: 'My overtime claims' }).getByRole('row').filter({ hasText: 'Pending' }).getByRole('button', { name: 'Withdraw' }).click();
  const dlg = page.getByRole('dialog', { name: 'Withdraw overtime claim' });
  await dlg.getByRole('button', { name: 'Withdraw' }).click();
  await expect(dlg).toContainText('Already approved');
});

test('field duty: a white-label install never says sampling; request, report and record forms work', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/field-duty');
  await page.getByRole('button', { name: 'Request field duty' }).click();
  const form = page.getByRole('dialog', { name: 'Request field duty' });
  await expect(form).not.toContainText(/sampl/i);
  await expect(form.getByLabel('Purpose').locator('option')).not.toContainText(['Field sampling']);
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(form.getByLabel(/^Place/)).toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('main')).not.toContainText(/sampl/i);
  await page.getByRole('row').filter({ hasText: 'Asha Rao' }).or(page.getByRole('row').filter({ hasText: 'Pune' })).first().getByRole('button', { name: /report/i }).click();
  const report = page.getByRole('dialog', { name: /^Field duty report/ });
  await report.getByLabel('Outcome').selectOption('not_done');
  await report.getByLabel(/What was not done/).fill('');
  await report.getByRole('button', { name: 'Save report' }).click();
  await expect(report.getByLabel(/What was not done/)).toHaveAttribute('aria-invalid', 'true');
  await report.getByLabel(/What was not done/).fill('Client closed for the day');
  await report.getByRole('button', { name: 'Save report' }).click();
  await expect(page.getByText('Report saved')).toBeVisible();
  await page.getByRole('tab', { name: 'Everyone' }).click();
  await page.getByRole('button', { name: 'Record field duty' }).click();
  const record = page.getByRole('dialog', { name: 'Record field duty for an employee' });
  await expect(record.getByRole('combobox').first()).toBeVisible();
  await record.getByRole('button', { name: 'Cancel' }).click();
});
