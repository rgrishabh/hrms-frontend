import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { ERROR_SURFACE_ATTR } from '../contract';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { ErrorState, InlineError } from './ErrorState';

const problem = (status: number, title = 'x') => new ApiError({ type: 'about:blank', title, status });

describe('ErrorState', () => {
  it('carries the e2e error surface attribute', () => {
    renderUi(<><ErrorState error={problem(500)} /><InlineError error="Nope" /></>);
    for (const el of screen.getAllByRole('alert')) expect(el.hasAttribute(ERROR_SURFACE_ATTR)).toBe(true);
  });
  it('offers retry on a server failure', async () => {
    const onRetry = vi.fn();
    renderUi(<ErrorState error={problem(500, 'Boom')} onRetry={onRetry} />);
    expect(screen.getByText('Boom')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('does not offer retry for a permission problem, and names it', () => {
    renderUi(<ErrorState error={problem(403)} onRetry={vi.fn()} />);
    expect(screen.getByText('You do not have access to this')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('says offline for a network failure', () => {
    renderUi(<ErrorState error={problem(0)} />);
    expect(screen.getByText('You appear to be offline')).toBeTruthy();
  });
  it('InlineError renders nothing without an error', () => {
    const { container } = renderUi(<InlineError error={null} />);
    expect(container.querySelector(`[${ERROR_SURFACE_ATTR}]`)).toBeNull();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<><ErrorState error={problem(500)} onRetry={vi.fn()} /><InlineError error="Nope" /></>);
    await expectNoAxeViolations(container);
  });
});
