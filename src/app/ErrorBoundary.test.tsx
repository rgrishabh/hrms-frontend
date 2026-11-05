import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_SURFACE_ATTR } from '../contract';
import { expectNoAxeViolations } from '../test/axe';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ on }: { on: boolean }): null | never {
  if (on) throw new Error('boom');
  return null;
}

describe('ErrorBoundary', () => {
  it('Reload reloads the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<ErrorBoundary><Bomb on /></ErrorBoundary>);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it('contains a crash, marks an error surface and offers reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<ErrorBoundary><Bomb on /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert.hasAttribute(ERROR_SURFACE_ATTR)).toBe(true);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    await expectNoAxeViolations(container);
  });
  it('recovers when navigation changes the reset key', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Bomb on /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="/b"><Bomb on={false} /></ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
