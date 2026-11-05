import { test, expect } from '@playwright/test';
import { expectNavHidden, login, noErrors, openMenu, settled, type Persona } from './helpers';

// Every persona can open every page in their menu without an error, and sees only what their role allows.
const CASES: { who: Persona; sees: string[]; hidden: string[] }[] = [
  { who: 'analyst', sees: ['Dashboard', 'My profile', 'My attendance', 'Roster', 'Leave', 'Overtime', 'Field duty', 'Travel', 'Performance', 'Assets', 'Policies', 'Payslips'], hidden: ['Payroll', 'Settings', 'Attendance setup', 'Reports'] },
  { who: 'lab.manager', sees: ['Team attendance', 'Approvals', 'Overtime', 'Field duty', 'Performance', 'Reports'], hidden: ['Payroll', 'Attendance setup'] },
  { who: 'hr.head', sees: ['Employees', 'Recruitment', 'Onboarding & exit', 'Grievances & POSH', 'Performance', 'Settings', 'Reports'], hidden: [] },
  { who: 'payroll', sees: ['Payroll', 'Attendance setup'], hidden: ['Recruitment'] }, // locks attendance before a run
  { who: 'it', sees: ['Assets', 'Settings'], hidden: ['Payroll', 'Reports'] },
];

for (const c of CASES) {
  test(`${c.who}: menu matches the role and every page loads`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, c.who);
    const nav = await openMenu(page);
    for (const name of c.sees) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    await expectNavHidden(page, c.hidden);
    // Client-side navigation through the menu, as a user would.
    await openMenu(page);
    const hrefs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!).filter(Boolean));
    for (const href of hrefs) {
      await openMenu(page);
      await nav.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL((u) => u.pathname === href || u.pathname.startsWith(`${href.replace(/\/$/, '')}/`)); // e.g. /settings → /settings/general
      await expect(page.getByRole('heading', { level: 1 }).first(), `page ${href}`).toBeVisible();
      await settled(page);
      await noErrors(page);
    }
    expect(errors, 'uncaught page errors').toEqual([]);
  });
}
