import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('an employee can turn SMS notifications off and on', async ({ page }) => {
  await login(page, 'sampler');
  await page.goto('/account');
  const box = page.getByRole('checkbox', { name: /Text me important notifications/ });
  await expect(box).toBeVisible();
  const was = await box.isChecked();   // on by default; a rerun may find it off
  await box.setChecked(!was);
  await expect(page.getByText(was ? 'SMS off' : 'SMS on')).toBeVisible();
  await page.reload();
  await expect(box).toBeChecked({ checked: !was });
  await box.setChecked(was);
  await expect(page.getByText(was ? 'SMS on' : 'SMS off')).toBeVisible();
  await noErrors(page);
});
