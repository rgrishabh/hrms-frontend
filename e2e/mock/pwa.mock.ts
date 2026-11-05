import { test, expect } from '@playwright/test';
import { mockApi } from './api';

test.use({ serviceWorkers: 'allow' });

test('the service worker caches the shell only, works offline, and never stores API data', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/leave');
  await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();

  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached).toContain('/');
  expect(cached.some((p) => p.startsWith('/assets/index-'))).toBe(true);
  expect(cached.filter((p) => /^\/(api|brand|branding|env\.js)/.test(p))).toEqual([]);

  await page.unroute('**/api/v1/**');
  await page.route('**/api/v1/**', (r) => r.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});

test('losing the connection while working shows a clear banner', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('You are offline.')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You are offline.')).toHaveCount(0);
});

test('a manifest is linked and describes the app', async ({ page, request }) => {
  await mockApi(page);
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json() as { display: string; icons: unknown[] };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});
