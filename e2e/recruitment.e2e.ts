import { test, expect, type Page } from '@playwright/test';
import { login, noErrors } from './helpers';

/** `datetime-local` value in the browser's (= this machine's) time zone. */
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const firstOption = async (page: Page, label: string) => {
  const sel = page.getByRole('dialog').last().getByLabel(label);
  await expect(sel.locator('option').nth(1)).toBeAttached();
  await sel.selectOption({ index: 1 });
};
const approve = async (page: Page, summary: string | RegExp) => {
  await page.goto('/approvals');
  const row = page.getByRole('row').filter({ hasText: summary });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved')).toBeVisible();
};

test('a requisition becomes a hire: request, approval, candidate, interview, offer, management sign-off, employee', async ({ page }) => {
  test.setTimeout(90_000);
  const run = Date.now().toString(36);
  const title = `Analytical Chemist — ICP-MS (E2E ${run})`;
  const first = 'Kavya'; const last = `Deshmukh ${run.toUpperCase()}`;
  const candidate = `${first} ${last}`;

  // 1. The laboratory manager requests the position.
  await login(page, 'lab.manager');
  await page.goto('/recruitment');
  await page.getByRole('button', { name: 'New requisition' }).click();
  const form = page.getByRole('dialog', { name: 'New job requisition' });
  await form.getByLabel('Position title').fill(title);
  await firstOption(page, 'Legal entity');
  await firstOption(page, 'Branch');
  await form.getByLabel('Justification').fill('Metals testing scope extension for NABL; current analysts are fully loaded');
  await form.getByRole('button', { name: 'Save draft' }).click();
  const req = page.getByRole('dialog', { name: new RegExp(`REQ-\\d+ — ${title.replace(/[()]/g, '\\$&')}`) });
  await req.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Sent for approval')).toBeVisible();

  // 2. HR approves it.
  await login(page, 'hr.head');
  await approve(page, title);

  // 3. The HR executive adds a candidate (with consent) and moves them to interview.
  await login(page, 'hr.exec');
  await page.goto('/recruitment?tab=requisitions');
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.getByRole('dialog', { name: 'Add candidate' }).getByRole('button', { name: 'New candidate' }).click();
  const cand = page.getByRole('dialog', { name: 'New candidate' });
  await cand.getByLabel('First name').fill(first);
  await cand.getByLabel('Last name').fill(last);
  await cand.getByRole('textbox', { name: 'Email', exact: true }).fill(`kavya.${run}@mail.example`);
  await cand.getByLabel('Qualification').fill('M.Sc. Analytical Chemistry');
  await cand.getByRole('checkbox').check();
  await cand.getByLabel('How consent was obtained').fill('Applied on the careers page; consent checkbox');
  await cand.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added to the pipeline')).toBeVisible();
  await page.getByRole('row').filter({ hasText: candidate }).getByRole('button', { name: candidate }).click();
  const appDlg = page.getByRole('dialog', { name: new RegExp(`^${candidate} — REQ-`) });
  for (const stage of ['Screening', 'Interview']) {
    await appDlg.getByRole('button', { name: `→ ${stage}` }).click();
    await page.getByRole('dialog', { name: `Move to ${stage}` }).getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText(`Moved to ${stage}`)).toBeVisible();
  }
  // The interview took place an hour ago, with the laboratory manager on the panel.
  await appDlg.getByRole('button', { name: 'Schedule interview' }).click();
  const sch = page.getByRole('dialog', { name: 'Schedule interview' });
  await sch.getByLabel('Date and time').fill(localInput(new Date(Date.now() - 3_600_000)));
  await sch.getByPlaceholder('Search people').fill('Meera');
  await sch.getByRole('option', { name: /Meera Nair/ }).click();
  await sch.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText('Interview scheduled; the panel was notified')).toBeVisible();

  // 4. The panel member gives feedback from "My interviews".
  await login(page, 'lab.manager');
  await page.goto('/recruitment?tab=interviews');
  await page.getByRole('row').filter({ hasText: candidate }).getByRole('button', { name: candidate }).click();
  await page.getByRole('button', { name: 'Give feedback' }).click();
  const fb = page.getByRole('dialog', { name: 'Feedback — round 1' });
  await fb.getByRole('button', { name: '4 of 5' }).click();
  await fb.getByLabel('Recommendation').selectOption('yes');
  await fb.getByLabel('Notes').fill('Clear grasp of ICP-MS interferences and QC; ran the practical within method limits.');
  await fb.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Feedback submitted')).toBeVisible();

  // 5. HR moves to offer and drafts it; an HR administrator can't approve their own offer.
  await login(page, 'hr.head');
  await page.goto('/recruitment?tab=requisitions');
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: title }).click();
  await page.getByRole('row').filter({ hasText: candidate }).getByRole('button', { name: candidate }).click();
  await appDlg.getByRole('button', { name: '→ Offer' }).click();
  await page.getByRole('dialog', { name: 'Move to Offer' }).getByRole('button', { name: 'Move' }).click();
  await appDlg.getByRole('button', { name: 'Draft offer' }).click();
  const offer = page.getByRole('dialog', { name: 'Draft offer' });
  await offer.getByLabel('Designation').fill('Analytical Chemist');
  await firstOption(page, 'Legal entity');
  await firstOption(page, 'Branch');
  await offer.getByLabel(/Annual CTC/).fill('540000');
  await offer.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/^Draft saved/)).toBeVisible();
  await appDlg.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Sent for approval')).toBeVisible();
  await page.goto('/approvals');
  await expect(page.getByRole('row').filter({ hasText: candidate })).toHaveCount(0);

  // 6. The laboratory director (hiring approver) signs off; the summary carries no pay.
  await login(page, 'director');
  await page.goto('/approvals');
  const offerRow = page.getByRole('row').filter({ hasText: `${candidate} — Analytical Chemist` });
  await expect(offerRow, 'the hiring approver sees the offer to approve').toHaveCount(1);
  await expect(offerRow).not.toContainText('540');
  await approve(page, `${candidate} — Analytical Chemist`);

  // 7. HR records the sent and accepted offer and hires: a pre-joining employee, requisition filled.
  await login(page, 'hr.head');
  await page.goto('/recruitment?tab=requisitions');
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: title }).click();
  await page.getByRole('row').filter({ hasText: candidate }).getByRole('button', { name: candidate }).click();
  await appDlg.getByRole('button', { name: 'Mark sent' }).click();
  await expect(page.getByText('Marked as sent')).toBeVisible();
  await appDlg.getByRole('button', { name: 'Accepted' }).click();
  await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
  await appDlg.getByRole('button', { name: 'Hire → create employee' }).click();
  const hire = page.getByRole('dialog', { name: 'Hire — create employee record' });
  await hire.getByLabel('Employee code').fill(`E2E-${run.toUpperCase()}`);
  await hire.getByRole('button', { name: 'Create employee' }).click();
  await expect(page.getByText('Employee created (pre-joining); the requisition is now filled and closed')).toBeVisible();
  await appDlg.getByRole('link', { name: 'Open employee' }).click();
  await expect(page.getByRole('heading', { level: 1, name: candidate })).toBeVisible();
  await expect(page.getByText('Pre joining').first()).toBeVisible();
  await noErrors(page);
});
