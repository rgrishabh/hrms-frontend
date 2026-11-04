import { test, expect } from '@playwright/test';
import { login, noErrors, type Persona } from './helpers';

// Every persona can open every page in their menu without an error, and sees only what their role allows.
const CASES: { who: Persona; sees: string[]; hidden: string[] }[] = [
  { who: 'analyst', sees: ['Dashboard', 'My attendance', 'Leave', 'Performance', 'Assets', 'Policies', 'Payslips'], hidden: ['Payroll', 'Settings', 'Attendance setup', 'Reports'] },
  { who: 'lab.manager', sees: ['Team attendance', 'Approvals', 'Performance', 'Reports'], hidden: ['Payroll', 'Attendance setup'] },
  { who: 'hr.head', sees: ['Employees', 'Recruitment', 'Onboarding & exit', 'Grievances & POSH', 'Performance', 'Settings', 'Reports'], hidden: [] },
  { who: 'payroll', sees: ['Payroll', 'Payslips', 'Attendance setup'], hidden: ['Recruitment setup'] }, // locks attendance before a run
  { who: 'it', sees: ['Assets', 'Settings'], hidden: ['Payroll', 'Reports'] },
];

for (const c of CASES) {
  test(`${c.who}: menu matches the role and every page loads`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, c.who);
    const nav = page.getByLabel('Main navigation');
    for (const name of c.sees) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    for (const name of c.hidden) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
    // Client-side navigation through the menu, as a user would.
    const hrefs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!).filter(Boolean));
    for (const href of hrefs) {
      await nav.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL((u) => u.pathname === href || u.pathname.startsWith(`${href.replace(/\/$/, '')}/`)); // e.g. /settings → /settings/general
      await expect(page.getByRole('heading', { level: 1 }).first(), `page ${href}`).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await noErrors(page);
    }
    expect(errors, 'uncaught page errors').toEqual([]);
  });
}
