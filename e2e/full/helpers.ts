import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MAIN_TEST_ID } from '../../src/contract';
import { ADMIN_PASSWORD, DOMAIN, PASSWORD, settled } from '../helpers';

export type Person = 'admin' | 'director' | 'hr.head' | 'hr.exec' | 'payroll' | 'finance' | 'lab.manager' | 'quality' | 'it' | 'analyst' | 'sampler';

export const emailOf = (who: Person) => `${who}@${who === 'admin' ? 'example.test' : DOMAIN}`;
const passwordOf = (who: Person) => (who === 'admin' ? ADMIN_PASSWORD : PASSWORD);

/** Sign in through the form. Sessions are not reused between tests on purpose: signing in is part of what is under test. */
export async function signIn(page: Page, who: Person, password = passwordOf(who)) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(emailOf(who));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signedIn(page: Page, who: Person) {
  await signIn(page, who);
  await expect(page.getByTestId(MAIN_TEST_ID)).toBeVisible();
  await settled(page);
}

/** One sign-in per person per project, stored as cookies, for tests that are not about signing in. */
const stored = new Map<string, Awaited<ReturnType<BrowserContext['storageState']>>>();
export async function pageAs(browser: Browser, who: Person, options: Parameters<Browser['newContext']>[0] = {}): Promise<Page> {
  const key = `${who}:${options?.viewport?.width ?? 0}`;
  let state = stored.get(key);
  if (!state) {
    const ctx = await browser.newContext({ ...options, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await signedIn(page, who);
    state = await ctx.storageState();
    stored.set(key, state);
    await ctx.close();
  }
  const ctx = await browser.newContext({ ...options, storageState: state, serviceWorkers: 'block' });
  return ctx.newPage();
}

/** WCAG A and AA on what is on screen now. */
export async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const found = results.violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target.join(' ')} ${v.help}`);
  expect(found, `axe on ${label}`).toEqual([]);
}

export const mailUrl = () => `http://127.0.0.1:${process.env.E2E_MAIL_PORT ?? 4313}/`;
interface Mail { to: string[]; raw: string; at: number }

/** Waits for a message to this address that the test has not used, sent after `since`. */
export async function waitForMail(request: { get: (url: string) => Promise<{ json: () => Promise<unknown> }> }, to: string, since: number, match: RegExp): Promise<string> {
  const end = Date.now() + 45_000;
  while (Date.now() < end) {
    const all = (await (await request.get(mailUrl())).json()) as Mail[];
    const hit = all.filter((m) => m.at >= since && m.to.includes(to)).find((m) => match.test(decodeBody(m.raw)));
    if (hit) return decodeBody(hit.raw);
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`No mail to ${to} matching ${match}`);
}

/** Quoted-printable and base64 bodies, joined, so a test can look for a code or a link. */
function decodeBody(raw: string): string {
  const qp = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  const b64 = [...raw.matchAll(/\n\n([A-Za-z0-9+/=\n]{40,})/g)].map((m) => { try { return Buffer.from(m[1]!.replace(/\n/g, ''), 'base64').toString('utf8'); } catch { return ''; } }).join('\n');
  return `${qp}\n${b64}`;
}

export function totp(secret: string, at = Date.now()): string {
  return totpImpl(secret, at);
}

import { createHmac } from 'node:crypto';
function totpImpl(secret: string, at: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
