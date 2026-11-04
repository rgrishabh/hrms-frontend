import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { noErrors } from '../helpers';
import { ALL_FEATURES, forceTheme, mockApi } from './api';

const LAB = { ...ALL_FEATURES, FEATURE_LAB_COMPETENCY: true };
const fail = (title: string, status = 500) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status }) });

test('training alone never shows laboratory wording', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  for (const path of ['/competency', '/competency?tab=training', '/competency?tab=setup']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Training', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.page-header')).not.toContainText(/laborator|competenc/i);
    await expect(page.getByRole('tablist')).not.toContainText(/competenc|methods/i);
  }
  await expect(page.getByRole('tab', { name: 'Authorizations' })).toHaveCount(0);
});

test('revoke: asks for a reason, stays open on failure with the error, then succeeds', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let answer = fail('The record is locked');
  await page.route('**/api/v1/competency/training-records/t2/revoke', (r) => r.fulfill(answer));
  await page.goto('/competency?tab=training');
  await page.getByRole('row').filter({ hasText: 'Arjun Rao' }).getByRole('button', { name: 'Revoke' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revoke training record' });
  await expect(dialog.getByRole('button', { name: 'Revoke record' })).toBeDisabled();
  await dialog.getByRole('textbox').fill('Recorded against the wrong person');
  await dialog.getByRole('button', { name: 'Revoke record' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The record is locked');
  await expect(dialog.getByRole('textbox')).toHaveValue('Recorded against the wrong person');
  answer = { status: 200, contentType: 'application/json', body: '{"ok":true}' };
  await dialog.getByRole('button', { name: 'Revoke record' }).click();
  await expect(page.getByText('Record revoked')).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('record training: an empty employee is an inline error, and a course choice is a native select', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/competency?tab=training');
  await page.getByRole('button', { name: 'Record training' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record training' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('combobox', { name: /Employee/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: /Employee/ }).click();
  await dialog.getByRole('option', { name: /Arjun Rao/ }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/^Recorded; valid until/)).toBeVisible();
});

test('cancel a pending authorization from its detail, and the row opens by keyboard', async ({ page }) => {
  await mockApi(page, { persona: 'admin', features: LAB });
  let cancelled = false;
  await page.route('**/api/v1/competency/authorizations/a1/cancel', (r) => { cancelled = true; return r.fulfill({ json: { ok: true } }); });
  await page.goto('/competency?tab=authorizations');
  const first = page.getByRole('row').nth(1).getByRole('button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const detail = page.getByRole('dialog', { name: 'Technical authorization' });
  await detail.getByRole('button', { name: 'Cancel request' }).click();
  await page.getByRole('dialog', { name: 'Cancel authorization request' }).getByRole('button', { name: 'Cancel request' }).click();
  await expect(page.getByText('Request cancelled')).toBeVisible();
  expect(cancelled).toBe(true);
});

test('matrix: a grid on desktop, a per-person list on a phone', async ({ page }) => {
  await mockApi(page, { persona: 'admin', features: LAB });
  await page.goto('/competency?tab=matrix');
  await expect(page.getByRole('table', { name: 'Competence matrix' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Competence matrix' })).toContainText('Perform test: in force');
});

test('file a grievance: too short stays inline, then the respondent chosen is sent and the case opens', async ({ page }) => {
  await mockApi(page, { persona: 'employee' });
  let body: { respondentEmployeeId?: string } = {};
  await page.route('**/api/v1/cases', (r) => { if (r.request().method() !== 'POST') return r.fallback(); body = r.request().postDataJSON(); return r.fulfill({ json: { id: 'g1', reference: 'GR-0009' } }); });
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Raise a grievance' }).click();
  const form = page.getByRole('dialog', { name: 'Raise a grievance' });
  await form.getByLabel(/What happened/).fill('Too short');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByLabel(/What happened/)).toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel(/What happened/).fill('Pay was short by two days this month and nobody replied.');
  await form.getByRole('combobox', { name: /Person involved/ }).click();
  await form.getByRole('option', { name: /Arjun Rao/ }).click();
  await expect(form.getByRole('group', { name: /Person involved/ })).toContainText('Arjun Rao');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Filed as GR-0009')).toBeVisible();
  await expect(page).toHaveURL(/case=g1/);
  await expect(page.getByRole('dialog', { name: /GR-0001/ })).toBeVisible();
  expect(body.respondentEmployeeId).toBe('e3');
});

test('withdraw: a failure stays open with the reason kept', async ({ page }) => {
  await mockApi(page, { persona: 'employee' });
  await page.route('**/api/v1/cases/p3', (r) => r.fallback());
  await page.route('**/api/v1/cases/g3', (r) => r.fallback());
  await page.route('**/api/v1/cases/g1', (r) => r.fulfill({ json: { id: 'g1', kind: 'grievance', reference: 'GR-0001', category: 'pay', status: 'open', anonymous: false, role: 'complainant', version: 1, complainantName: 'Asha', incidentDate: null, description: 'Pay was short by two days.', lateReason: null, outcome: null, receivedAt: '2026-02-14T09:30:00+05:30', inquiryDue: null, reportDue: null, slaDue: '2026-11-20', assigneeName: null, allowedMoves: [], events: [] } }));
  await page.route('**/api/v1/cases/g1/withdraw', (r) => r.fulfill(fail('Could not withdraw')));
  await page.goto('/cases?case=g1');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  const dialog = page.getByRole('dialog', { name: 'Withdraw case' });
  await dialog.getByRole('textbox').fill('Sorted out directly');
  await dialog.getByRole('button', { name: 'Withdraw' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not withdraw');
  await expect(dialog.getByRole('textbox')).toHaveValue('Sorted out directly');
});

test('handler: a saved note clears, and closing after saving does not ask to discard', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/cases?tab=grievances');
  await page.getByRole('button', { name: 'GR-0001' }).click();
  const detail = page.getByRole('dialog', { name: /GR-0001/ });
  await detail.getByLabel('Add a note or update').fill('Spoke to payroll today.');
  await detail.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(detail.getByLabel('Add a note or update')).toHaveValue('');
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toHaveCount(0);
  await noErrors(page);
});

test('committee: remove buttons are named, and two presiding officers are refused inline', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/cases?tab=committee');
  await page.getByRole('button', { name: 'Edit membership' }).click();
  const form = page.getByRole('dialog', { name: 'Internal Committee membership' });
  await expect(form.getByRole('button', { name: 'Remove Ananya Iyer' })).toBeVisible();
  await form.getByLabel('Role of Ananya Iyer').selectOption('presiding_officer');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByText('Choose exactly one presiding officer')).toBeVisible();
  await form.getByLabel('Role of Ananya Iyer').selectOption('member');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
});

test('a failed annual report is shown, not hidden', async ({ page }) => {
  await mockApi(page, { persona: 'admin', fail: ['/cases/posh/annual-report'] });
  await page.goto('/cases?tab=committee');
  await expect(page.getByText('Something failed on the server')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Committee members' })).toBeVisible();
});

/* The lab-gated tabs: not in SCREENS, because the shared mock leaves the lab flag off. */
const LAB_SCREENS = [
  { name: 'competency-lab-mine', path: '/competency', persona: 'employee' as const },
  { name: 'competency-matrix', path: '/competency?tab=matrix', persona: 'admin' as const },
  { name: 'competency-authorizations', path: '/competency?tab=authorizations', persona: 'admin' as const },
  { name: 'competency-assessments', path: '/competency?tab=assessments', persona: 'admin' as const },
  { name: 'competency-methods', path: '/competency?tab=setup', persona: 'admin' as const },
];

const OUT = process.env.SCREENSHOT_DIR ?? 'test-results/screens';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const tooSmall = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main button, main a.btn, main select, main input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), main textarea, main [role="tab"]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || (r.width < 43.5 && !el.classList.contains('btn--link'))); })
  .map((el) => `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}"`));
const overflow = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('.table-scroll, .tabs-bar, .visually-hidden')).slice(0, 5).map((el) => `${el.tagName}.${el.className}`));

for (const s of LAB_SCREENS) {
  for (const width of [360, 390, 768]) {
    test(`lab: layout at ${width}: ${s.name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await mockApi(page, { persona: s.persona, features: LAB });
      await page.goto(s.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(await overflow(page)).toEqual([]);
      expect(await page.locator('.table-card, .table tbody tr').count()).toBeGreaterThan(0);
      if (width === 360) {
        expect(await tooSmall(page)).toEqual([]);
        await expect(page.locator('main table')).toHaveCount(0);
      }
    });
  }
  for (const theme of ['light', 'dark'] as const) {
    test(`lab: axe ${theme}: ${s.name}`, async ({ page }) => {
      await forceTheme(page, theme);
      await mockApi(page, { persona: s.persona, features: LAB });
      await page.goto(s.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(AXE);
      const found = await page.evaluate(async () => (await (window as unknown as { axe: { run: (o: object) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`));
      expect(found).toEqual([]);
    });
    for (const width of [360, 1440]) {
      test(`lab: screenshot ${s.name} ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
        await forceTheme(page, theme);
        await mockApi(page, { persona: s.persona, features: LAB });
        await page.goto(s.path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${OUT}/${s.name}-${width}-${theme}.png`, fullPage: width === 360 });
      });
    }
  }
}
