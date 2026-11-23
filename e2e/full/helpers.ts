import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
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
  // A fixed bar paints over whatever scrolls beneath it, which axe counts as a target too small, wherever the page stands. Taken out of the flow for the check, as scrolling would free them.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const { position } = getComputedStyle(el);
      if ((position === 'fixed' || position === 'sticky') && !el.closest('[role="dialog"], .dialog-backdrop')) el.style.position = 'static';
    }
  });
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

const API = (path: string) => `/api/v1${path}`;

/** A signed-in API client for setting up a test. What is under test still goes through the screen. */
export async function apiAs(request: APIRequestContext, who: Person) {
  const r = await request.post(API('/auth/login'), { data: { email: emailOf(who), password: passwordOf(who) } });
  expect(r.ok(), `${who} signs in: ${await r.text()}`).toBeTruthy();
  const { csrfToken } = (await r.json()) as { csrfToken: string };
  return { headers: { 'x-csrf-token': csrfToken } };
}

let serial = 0;
/** Someone new, invited by the administrator, so a test can change their password or MFA without touching anyone else. */
export async function invited(request: APIRequestContext, label: string) {
  const email = `${label}.${Date.now().toString(36)}${serial++}@example.test`;
  const { headers } = await apiAs(request, 'admin');
  const since = Date.now() - 1000;
  const res = await request.post(API('/tenant/users'), { headers, data: { email, displayName: `E2E ${label}`, roles: ['employee'] } });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { id: string; inviteSent: boolean };
  expect(body.inviteSent).toBe(true);
  await request.post(API('/auth/logout'), { headers });
  return { email, id: body.id, since };
}

export const STRONG = 'correct-horse-battery-staple-41';

export function linkFrom(mail: string, path: string): string {
  const m = new RegExp(`${path}#token=([A-Za-z0-9_\\-.%]+)`).exec(mail);
  if (!m) throw new Error(`No ${path} link in:\n${mail.slice(0, 600)}`);
  return `${path}#token=${m[1]}`;
}

/** An invited person sets their password through the link in their email. */
export async function acceptInvite(page: Page, email: string, since: number, password = STRONG) {
  const mail = await waitForMail(page.request, email, since, /setup#token=/);
  await page.goto(linkFrom(mail, '/setup'));
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel(/^Confirm/).fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('heading', { name: 'Password set' })).toBeVisible();
}

export const welcomed = (page: Page) => expect(page.getByRole('heading', { level: 1, name: /Welcome/ })).toBeVisible();

export async function signInWith(page: Page, email: string, password = STRONG) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
