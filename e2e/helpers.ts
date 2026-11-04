import { expect, type Cookie, type Page } from '@playwright/test';

export const DOMAIN = process.env.E2E_DOMAIN ?? 'example.test';
export const PASSWORD = process.env.E2E_PASSWORD ?? '';
export type Persona = 'director' | 'hr.head' | 'hr.exec' | 'payroll' | 'finance' | 'lab.manager' | 'quality' | 'it' | 'analyst' | 'sampler';

// One sign-in per persona per run (the API allows few sign-ins per minute per IP); later tests reuse the session cookie.
const sessions = new Map<Persona, Cookie[]>();
const nav = (page: Page) => page.getByLabel('Main navigation');

export async function login(page: Page, who: Persona) {
  if (!PASSWORD) throw new Error('Set E2E_PASSWORD to the demo password (demo-credentials.txt)');
  const ctx = page.context();
  await ctx.clearCookies();
  const saved = sessions.get(who);
  if (saved) {
    await ctx.addCookies(saved);
    await page.goto('/');
    if (await nav(page).waitFor({ timeout: 5000 }).then(() => true, () => false)) return;
    await ctx.clearCookies();
  }
  await page.goto('/');
  await page.getByLabel('Work email').fill(`${who}@${DOMAIN}`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav(page)).toBeVisible();
  sessions.set(who, await ctx.cookies());
}

/** Click a sidebar link and wait for the page heading. */
export async function open(page: Page, link: string, heading = link) {
  await page.getByLabel('Main navigation').getByRole('link', { name: link, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/** No error banner (ErrorBox) on the page. Styled notices such as overdue reminders are not errors. */
export async function noErrors(page: Page) {
  await expect(page.locator('[role="alert"].alert.error')).toHaveCount(0);
}
