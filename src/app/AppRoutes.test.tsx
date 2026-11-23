import { Suspense } from 'react';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, renderPage } from '../test/page';
import { AppRoutes } from './AppRoutes';

const show = (perms: string[], flags: string[], route: string) => {
  mockPageApi(perms, flags, () => ({ items: [], page: 1, pageSize: 20, total: 0 }));
  renderPage(<Suspense fallback={<p>Loading page</p>}><AppRoutes /></Suspense>, route);
};

afterEach(() => { vi.restoreAllMocks(); });

describe('routes', () => {
  it('an address that does not exist is a 404 with a way home', async () => {
    show([], [], '/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to dashboard' }).getAttribute('href')).toBe('/');
  });
  it('a page behind a switched-off feature is a 404, not a refusal', async () => {
    show(['leave.self'], [], '/leave');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
  it('a page this person may not enter says so, with a way home', async () => {
    show([], ['FEATURE_LEAVE'], '/leave');
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toBeTruthy();
  });
  it('a page anyone may enter loads', async () => {
    show([], [], '/account');
    expect(await screen.findByRole('heading', { name: 'My account' })).toBeTruthy();
  });
  it('a sub-page of a section reaches the section', async () => {
    show(['settings.read'], [], '/settings/jobs');
    expect(await screen.findByRole('heading', { name: 'Settings center' })).toBeTruthy();
  });
});
