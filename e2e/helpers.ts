import { existsSync, readFileSync } from 'node:fs';
import { expect, type Cookie, type Page } from '@playwright/test';
import { ERROR_SURFACE_ATTR, INFLIGHT_ATTR, MAIN_TEST_ID } from '../src/contract';
import { NAV_LABELS, type NavLabel } from '../src/app/nav-labels';

const creds = existsSync('.e2e/creds.json') ? (JSON.parse(readFileSync('.e2e/creds.json', 'utf8')) as { password: string; adminPassword: string; domain: string }) : null;

export const DOMAIN = process.env.E2E_DOMAIN ?? creds?.domain ?? 'example.test';
export const PASSWORD = process.env.E2E_PASSWORD ?? creds?.password ?? '';
export const ADMIN_PASSWORD = creds?.adminPassword ?? '';
export type Persona = 'director' | 'hr.head' | 'hr.exec' | 'payroll' | 'finance' | 'lab.manager' | 'quality' | 'it' | 'analyst' | 'sampler';

// One sign-in per persona per run (the API allows few sign-ins per minute per IP); later tests reuse the session cookie.
const sessions = new Map<Persona, Cookie[]>();
const nav = (page: Page) => page.getByLabel('Main navigation');
const menuButton = (page: Page) => page.getByRole('button', { name: 'Open menu' });

/** Navigation lives in a drawer behind the menu button. Opens it if it is closed, and returns it. */
export async function openMenu(page: Page) {
  if (!(await nav(page).isVisible())) await menuButton(page).click();
  await expect(nav(page)).toBeVisible();
  return nav(page);
}

export async function login(page: Page, who: Persona) {
  if (!PASSWORD) throw new Error('Set E2E_PASSWORD to the demo password (demo-credentials.txt)');
  const ctx = page.context();
  await ctx.clearCookies();
  const saved = sessions.get(who);
  if (saved) {
    await ctx.addCookies(saved);
    await page.goto('/');
    if (await menuButton(page).waitFor({ timeout: 5000 }).then(() => true, () => false)) return;
    await ctx.clearCookies();
  }
  await page.goto('/');
  await page.getByLabel('Work email').fill(`${who}@${DOMAIN}`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(menuButton(page)).toBeVisible();
  sessions.set(who, await ctx.cookies());
}

const mainArea = (page: Page) => page.getByTestId(MAIN_TEST_ID);

/** The role switcher, when the user has more than one view. */
const viewSwitcher = (page: Page) => page.getByLabel('Switch view');

/** Click a navigation link, switching view first if the current view does not list it. */
export async function open(page: Page, link: NavLabel, heading: string = link) {
  await openMenu(page);
  const target = nav(page).getByRole('link', { name: link, exact: true });
  if (!(await target.count()) && (await viewSwitcher(page).count())) {
    const views = await viewSwitcher(page).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    for (const view of views) {
      await viewSwitcher(page).selectOption(view);
      if (await target.count()) break;
    }
  }
  await target.click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/**
 * Wait until the page has finished talking to the server. A positive assertion: the attribute must
 * exist and read 0, so removing it fails the test instead of skipping the wait.
 */
export async function settled(page: Page) {
  await expect(mainArea(page)).toHaveAttribute(INFLIGHT_ATTR, '0');
}

/**
 * No error surface on the page. The shell must be rendered first, otherwise a blank page or a
 * crashed app would count as having no errors. Every error component carries ERROR_SURFACE_ATTR, and
 * e2e/mock/contract.mock.ts proves this helper fails when a real error is on screen.
 */
export async function noErrors(page: Page) {
  await expect(mainArea(page)).toBeVisible();
  await settled(page);
  await expect(page.locator(`[${ERROR_SURFACE_ATTR}]`)).toHaveCount(0);
}

/** A hidden link only proves something if the label is a real one. */
export async function expectNavHidden(page: Page, labels: readonly string[]) {
  await openMenu(page);
  for (const label of labels) {
    expect(NAV_LABELS as readonly string[], `"${label}" is not a navigation label`).toContain(label);
    await expect(nav(page).getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(nav(page)).toHaveCount(0);
}
