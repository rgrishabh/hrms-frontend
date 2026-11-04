import { test, expect } from '@playwright/test';
import { forceTheme, mockApi } from './api';

const today = new Date().toISOString().slice(0, 10);
const TODAY = { linked: true, today, timezone: 'Asia/Kolkata', nextDirection: 'in', locationMode: 'off', channels: { web: true, mobile: false }, events: [], daily: null, selfieRequired: true };
const SCRATCH = process.env.SCREENSHOT_DIR ?? 'test-results/screens';

test.describe('camera selfie, real camera path under the production CSP', () => {
  test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

  test('three presses from the page to clocked in; the photo is a real image and the CSP stays quiet', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await mockApi(page);
    await page.route('**/api/v1/attendance/me/today', (r) => r.fulfill({ json: TODAY }));
    let upload = '';
    let punch: { selfieId?: string } = {};
    await page.route('**/api/v1/attendance/selfies', async (r) => { upload = r.request().headers()['content-type'] ?? ''; await r.fulfill({ status: 201, json: { id: 'selfie-1' } }); });
    await page.route('**/api/v1/attendance/punch', async (r) => { punch = r.request().postDataJSON(); await r.fulfill({ json: { duplicate: false, id: 'ev', direction: 'in', eventTime: new Date().toISOString() } }); });
    await page.goto('/attendance/me');
    await page.getByRole('button', { name: 'Clock in' }).click();
    const dialog = page.getByRole('dialog', { name: 'Take a selfie to clock in' });
    await expect(dialog.getByRole('button', { name: 'Take photo' })).toBeEnabled();
    await expect.poll(() => dialog.getByLabel('Camera preview').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Take photo' }).click();
    await expect.poll(() => dialog.getByAltText('Your photo').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Use photo and clock in' }).click();
    await expect(page.getByText(/Clocked in at/)).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(upload).toContain('multipart/form-data');
    expect(punch.selfieId).toBe('selfie-1');
    expect(violations).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`selfie sheet at 360, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await forceTheme(page, theme);
      await mockApi(page);
      await page.route('**/api/v1/attendance/me/today', (r) => r.fulfill({ json: TODAY }));
      await page.goto('/attendance/me');
      await page.getByRole('button', { name: 'Clock in' }).click();
      const dialog = page.getByRole('dialog', { name: 'Take a selfie to clock in' });
      await expect(dialog.getByRole('button', { name: 'Take photo' })).toBeEnabled();
      await expect.poll(async () => { const b = await dialog.boundingBox(); return [b?.width, b?.height]; }).toEqual([360, 780]);
      await page.screenshot({ path: `${SCRATCH}/selfie-360-${theme}.png` });
    });
  }
});

test('camera refused: says so, and offers the device photo picker', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/v1/attendance/me/today', (r) => r.fulfill({ json: TODAY }));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await page.goto('/attendance/me');
  await page.getByRole('button', { name: 'Clock in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Take a selfie to clock in' });
  await expect(dialog).toContainText('The camera is blocked for this site');
  await expect(dialog.getByText('Choose a photo')).toBeVisible();
});

test('refused outside the geofence on a phone: the reason stays on the card', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 780 }, geolocation: { latitude: 19.07, longitude: 72.87 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  await mockApi(page);
  await page.route('**/api/v1/attendance/me/today', (r) => r.fulfill({ json: { ...TODAY, selfieRequired: false, channels: { web: false, mobile: true }, locationMode: 'required' } }));
  let body: { latitude?: number; channel?: string } = {};
  await page.route('**/api/v1/attendance/punch', async (r) => { body = r.request().postDataJSON(); await r.fulfill({ status: 403, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Outside', status: 403, code: 'outside_geofence' }) }); });
  await page.goto('/attendance/me');
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByText('You are outside the area allowed for clock-in at your branch.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(body.channel).toBe('mobile');
  expect(body.latitude).toBe(19.07);
  await context.close();
});

test('bank change: 202 reads as sent for approval, with the pending change shown', async ({ page }) => {
  await mockApi(page, { persona: 'hr' });
  await page.route('**/api/v1/employees/e2/bank-account', async (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 202, json: { ok: true, pending: true, id: 'c1', approvalRequestId: 'a1' } }) : r.fulfill({ json: null })));
  await page.route('**/api/v1/employees/e2/bank-account/pending', (r) => r.fulfill({ json: { pending: { id: 'c1', accountHolder: 'Asha Rao', accountNumberMasked: 'XXXXXX4321', ifsc: 'SBIN0001234', bankName: null, requestedAt: new Date().toISOString(), requestedBy: 'Kavita Menon' } } }));
  await page.goto('/employees/e2');
  await page.getByRole('button', { name: 'Update' }).click();
  const form = page.getByRole('dialog', { name: 'Update bank details' });
  await form.getByLabel('Account holder').fill('Asha Rao');
  await form.getByLabel('Account number').fill('123456784321');
  await form.getByLabel('IFSC').fill('SBIN0001234');
  await form.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Bank change sent for approval')).toBeVisible();
  await expect(page.getByText('A change is waiting for approval')).toBeVisible();
});

test('off modules: a 404 route for a feature that is off shows the not-found page, not a crash', async ({ page }) => {
  await mockApi(page, { persona: 'admin', features: { FEATURE_LEAVE: true } });
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/not found/i);
});

test('not configured: 409 feature_not_configured explains itself', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/attendance/punch', (r) => r.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'x', status: 409, code: 'feature_not_configured', detail: "'attendance.web' is on but not set up yet" }) }));
  await page.route('**/api/v1/attendance/me/today', (r) => r.fulfill({ json: { ...TODAY, selfieRequired: false } }));
  await page.goto('/attendance/me');
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByText('This feature is switched on but not set up yet.', { exact: false })).toBeVisible();
});
