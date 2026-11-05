import { test, expect } from '@playwright/test';
import { acceptInvite, invited, linkFrom, signInWith, STRONG, totp, waitForMail, welcomed } from './helpers';

test('a wrong password says so, and repeated tries are told how long to wait', async ({ page }) => {
  const nobody = `nobody.${Date.now()}@example.test`;
  for (let i = 0; i < 5; i++) {
    await signInWith(page, nobody, 'wrong-password-that-is-long');
    await expect(page.getByRole('alert')).toContainText(/invalid|incorrect/i);
  }
  await signInWith(page, nobody, 'wrong-password-that-is-long');
  await expect(page.getByRole('alert')).toContainText(/\d+ (second|minute)/);
});

test('invitation, a refused weak password with its reason, sign-in, then forgot and reset', async ({ page }) => {
  const { email, since } = await invited(page.request, 'invite');
  const mail = await waitForMail(page.request, email, since, /setup#token=/);
  await page.goto(linkFrom(mail, '/setup'));
  // The token leaves the address bar as soon as it is read.
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.getByLabel(/^New password/).fill('passwordpassword');
  await page.getByLabel(/^Confirm/).fill('passwordpassword');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText(/leaked passwords|too repetitive/)).toBeVisible();
  await page.getByLabel(/^New password/).fill(STRONG);
  await page.getByLabel(/^Confirm/).fill(STRONG);
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await signInWith(page, email);
  await welcomed(page);

  await page.context().clearCookies();
  await page.goto('/');
  const asked = Date.now() - 1000;
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const reset = await waitForMail(page.request, email, asked, /reset-password#token=/);
  await page.goto(linkFrom(reset, '/reset-password'));
  const next = `${STRONG}-again`;
  await page.getByLabel(/^New password/).fill(next);
  await page.getByLabel(/^Confirm/).fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await signInWith(page, email, next);
  await welcomed(page);
});

test('changing a password rotates the CSRF token, and the next write still works', async ({ page }) => {
  const { email, since } = await invited(page.request, 'rotate');
  await acceptInvite(page, email, since);
  await signInWith(page, email);
  await welcomed(page);
  await page.goto('/account');
  const next = `${STRONG}-updated`;
  await page.getByLabel('Current password').fill(STRONG);
  await page.getByLabel(/^New password/).fill(next);
  await page.getByLabel(/^Confirm/).fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  // Same page, no reload: a stale token would answer 403 here.
  await page.getByRole('checkbox', { name: /Email me about/ }).click();
  await expect(page.getByText(/Email notifications (on|off)/)).toBeVisible();
});

test('two-factor by authenticator: enrol, a wrong code is refused, the right one signs in, then turn it off', async ({ page }) => {
  const { email, since } = await invited(page.request, 'totp');
  await acceptInvite(page, email, since);
  await signInWith(page, email);
  await welcomed(page);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByRole('button', { name: 'Use an authenticator app' }).click();
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Code from the app').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();
  await page.getByLabel('I have saved my recovery codes').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('On: Authenticator app')).toBeVisible();

  await page.context().clearCookies();
  await signInWith(page, email);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  await page.getByLabel(/^Code/).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('not valid');
  // A step already used at enrolment is refused, so take the next one.
  await page.getByLabel(/^Code/).fill(totp(secret, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Verify' }).click();
  await welcomed(page);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Turn off' }).click();
  await page.getByLabel(/^Password/).fill(STRONG);
  await page.getByLabel(/Code from your app/).fill(totp(secret, Date.now() + 60_000));
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Two-factor authentication is off')).toBeVisible();
});

test('two-factor by email: enrol with a mailed code, and sign in with the next one', async ({ page }) => {
  test.setTimeout(180_000);
  const { email, since } = await invited(page.request, 'emailcode');
  await acceptInvite(page, email, since);
  await signInWith(page, email);
  await welcomed(page);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByRole('button', { name: 'Use codes sent by email' }).click();
  const sent = Date.now() - 1000;
  await page.getByRole('button', { name: 'Send the code' }).click();
  const code = /(?:code is |\b)(\d{6})\b/.exec(await waitForMail(page.request, email, sent, /\b\d{6}\b.*(expires|works)/s))![1]!;
  await page.getByLabel('Code from the email').fill(code);
  await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();
  await page.getByLabel('I have saved my recovery codes').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('On: Email codes')).toBeVisible();

  await page.context().clearCookies();
  await signInWith(page, email);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  // One code a minute, and enrolment just sent one, so sign-in says so and asking again gives the wait from Retry-After.
  await expect(page.getByText(/sent a moment ago/)).toBeVisible();
  await page.getByRole('button', { name: 'Send another code' }).click();
  await expect(page.getByRole('status').filter({ hasText: /wait \d+ seconds/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send another code', exact: true })).toBeEnabled({ timeout: 70_000 });
  const asked = Date.now() - 1000;
  await page.getByRole('button', { name: 'Send another code', exact: true }).click();
  const next = /Your code is (\d{6})/.exec(await waitForMail(page.request, email, asked, /Your code is \d{6}/))![1]!;
  await page.getByLabel(/^Code/).fill(next);
  await page.getByRole('button', { name: 'Verify' }).click();
  await welcomed(page);
});

test('sessions: another browser shows up, ending it signs it out', async ({ page, browser, viewport }) => {
  const { email, since } = await invited(page.request, 'sessions');
  await acceptInvite(page, email, since);
  await signInWith(page, email);
  await welcomed(page);
  const other = await (await browser.newContext({ viewport, serviceWorkers: 'block' })).newPage();
  await signInWith(other, email);
  await welcomed(other);

  await page.goto('/account');
  const list = page.getByRole('list', { name: 'Signed-in sessions' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByText('This device')).toHaveCount(1);
  await list.getByRole('button', { name: /^Sign out/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await other.goto('/account');
  await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await other.context().close();
});

test('an expired session returns to sign-in and says why', async ({ page }) => {
  const { email, since } = await invited(page.request, 'idle');
  await acceptInvite(page, email, since);
  await signInWith(page, email);
  await welcomed(page);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  // As if the idle limit passed: the next request answers 401. Moving within the app, with no reload, makes one.
  await page.context().clearCookies();
  await page.evaluate(() => { history.pushState(null, '', '/account'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText(/Your session ended/)).toBeVisible();
});
