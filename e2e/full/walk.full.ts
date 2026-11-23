import { test, expect } from '@playwright/test';
import { expectNoAxeViolations, pageAs, type Person } from './helpers';
import { ERROR_SURFACE_ATTR, MAIN_TEST_ID } from '../../src/contract';
import { settled } from '../helpers';

/** Every screen, as a person it is meant for, against the real API: no error surface, no failed request, no crash, no axe violation. */
const SCREENS: [Person, string[]][] = [
  ['analyst', ['/', '/notifications', '/approvals', '/attendance/me', '/leave', '/attendance/roster', '/overtime', '/field-duty', '/payslips', '/expenses', '/travel', '/loans', '/employees', '/documents', '/policies', '/performance', '/competency', '/assets', '/lifecycle', '/cases', '/recruitment', '/profile', '/account']],
  ['lab.manager', ['/', '/approvals', '/leave?tab=team', '/attendance/team', '/overtime?tab=team', '/field-duty?tab=team', '/expenses?tab=team', '/travel?tab=team', '/loans?tab=team', '/employees', '/reports', '/performance', '/competency', '/recruitment']],
  ['hr.head', ['/', '/employees', '/leave?tab=all', '/attendance/team', '/attendance/admin', '/documents', '/policies', '/performance', '/competency', '/assets', '/lifecycle', '/cases', '/recruitment', '/reports', '/settings/organization', '/settings/general', '/settings/attendance', '/settings/security', '/settings/company', '/settings/retention', '/settings/data-rights']],
  ['payroll', ['/', '/payroll', '/payroll?tab=salaries', '/payroll?tab=components', '/payroll?tab=statutory', '/accounting', '/loans?tab=all', '/reports']],
  ['finance', ['/expenses?tab=finance', '/travel?tab=all', '/accounting']],
  ['admin', ['/', '/approvals?tab=stuck', '/settings/users', '/settings/roles', '/settings/jobs', '/settings/audit', '/settings/audit-chain', '/settings/installation', '/settings/company', '/settings/data-rights', '/account']],
];

for (const [who, paths] of SCREENS) {
  for (const path of paths) {
    test(`${who} on ${path}`, async ({ browser, viewport }) => {
      const page = await pageAs(browser, who, { viewport });
      const failed: string[] = [];
      const crashed: string[] = [];
      page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
      page.on('pageerror', (e) => crashed.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) crashed.push(m.text()); });
      await page.goto(path);
      await expect(page.getByTestId(MAIN_TEST_ID)).toBeVisible();
      await settled(page);
      await page.waitForTimeout(150);
      await settled(page);
      const surfaces = await page.locator(`[${ERROR_SURFACE_ATTR}]`).allInnerTexts();
      expect({ failed, crashed, surfaces }, `${who} ${path}`).toEqual({ failed: [], crashed: [], surfaces: [] });
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectNoAxeViolations(page, `${who} ${path}`);
      await page.context().close();
    });
  }
}
