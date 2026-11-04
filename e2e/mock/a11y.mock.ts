import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { forceTheme, mockApi, type Persona } from './api';
import { MIGRATED } from './routes';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

interface Violation { id: string; nodes: { html: string; failureSummary?: string }[] }

async function axe(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  const violations = await page.evaluate(async () => {
    const runner = (window as unknown as { axe: { run: (o: object) => Promise<{ violations: Violation[] }> } }).axe;
    return (await runner.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations;
  });
  return violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => `${n.html.slice(0, 140)} | ${(n.failureSummary ?? '').slice(0, 200)}`).join(' || ')}`);
}

const cases: { name: string; persona: Persona; color: string }[] = [{ name: 'green brand', persona: 'hr', color: '#14532d' }, { name: 'yellow brand', persona: 'employee', color: '#ffd700' }];

for (const theme of ['light', 'dark'] as const) {
  for (const c of cases) {
    for (const path of MIGRATED) {
      test(`axe with real contrast: ${path}, ${theme}, ${c.name}`, async ({ page }) => {
        await forceTheme(page, theme);
        await mockApi(page, { persona: c.persona, primaryColor: c.color });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await axe(page)).toEqual([]);
      });
    }
    test(`axe: sign-in, ${theme}, ${c.name}`, async ({ page }) => {
      await forceTheme(page, theme);
      await mockApi(page, { signedIn: false, primaryColor: c.color });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }
}
