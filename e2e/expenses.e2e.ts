import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

// A 1×1 PNG: a real image, so the receipt passes the server's content check.
const RECEIPT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('an expense claim goes from the employee through manager and finance approval to payment', async ({ page }) => {
  const title = `Site visit — Hinjewadi STP (E2E ${Date.now().toString(36)})`;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // 1. The analyst creates a claim, adds a meal with a receipt and submits it.
  await login(page, 'analyst');
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'New claim' }).click();
  const form = page.getByRole('dialog', { name: 'New expense claim' });
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Business purpose').fill('Collected inlet and outlet samples for the monthly STP report');
  await form.getByRole('button', { name: 'Create and add items' }).click();
  const claim = page.getByRole('dialog', { name: title });
  await claim.getByRole('button', { name: 'Add expense' }).click();
  const item = page.getByRole('dialog', { name: 'Add expense' });
  await item.getByLabel('Category').selectOption({ label: 'Meals' });
  await item.getByLabel('Date').fill(yesterday);
  await item.getByLabel('Amount (₹)').fill('350');
  await item.getByLabel('Description').fill('Lunch at site');
  await item.getByLabel('Receipt (required)').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT });
  await item.getByRole('button', { name: 'Add' }).click();
  await expect(claim.getByRole('row').filter({ hasText: 'Lunch at site' })).toBeVisible();
  await claim.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('dialog', { name: 'Submit claim' }).getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Submitted for approval')).toBeVisible();
  await expect(claim).toContainText('Submitted');
  await claim.getByRole('button', { name: 'Close' }).click();

  // 2. The reporting manager approves, then a finance approver.
  for (const who of ['lab.manager', 'finance'] as const) {
    await login(page, who);
    await page.goto('/approvals');
    const req = page.getByRole('row').filter({ hasText: title });
    await expect(req).toHaveCount(1);
    await req.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Request (approved|pending)/)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(0);
  }

  // 3. Payroll prepares a payment batch; the dashboard shows claims waiting for reimbursement.
  await login(page, 'payroll');
  await page.goto('/');
  await expect(page.locator('[data-tile="expenses_to_pay"]')).toBeVisible();
  await page.locator('[data-tile="expenses_to_pay"]').click();
  await expect(page).toHaveURL(/\/expenses\?tab=finance/);
  await page.getByLabel(`Select ${title}`).check();
  await page.getByRole('button', { name: /Prepare batch/ }).click();
  await expect(page.getByText(/Batch prepared: ₹350(\.00)?\. Another finance user must approve it\./)).toBeVisible();
  const batch = page.getByRole('row').filter({ hasText: 'Prepared' }).filter({ hasText: '₹350' }).first();
  await expect(batch).toBeVisible();

  // 4. A second finance user approves it (maker–checker) and records the payment.
  await login(page, 'finance');
  await page.goto('/expenses?tab=finance');
  const prepared = page.getByRole('row').filter({ hasText: 'Prepared' }).filter({ hasText: 'Sneha Patil' }).filter({ hasText: '₹350' }).first();
  await prepared.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Batch approved')).toBeVisible();
  const approved = page.getByRole('row').filter({ hasText: 'Sneha Patil → Vikram Mehta' }).filter({ hasText: '₹350' }).first();
  await approved.getByRole('button', { name: 'Mark paid' }).click();
  const ref = `NEFT-E2E-${Date.now().toString(36).toUpperCase()}`;
  const pay = page.getByRole('dialog', { name: 'Record payment' });
  await pay.getByLabel('Payment reference').fill(ref);
  await pay.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByText('Payment recorded; employees notified')).toBeVisible();

  // 5. The employee sees the claim paid, with the payment reference.
  await login(page, 'analyst');
  await page.goto('/expenses');
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('Paid');
  await row.getByRole('button', { name: title }).click();
  await expect(page.getByRole('dialog', { name: title })).toContainText(`paid, ref ${ref}`);
  await noErrors(page);
});
