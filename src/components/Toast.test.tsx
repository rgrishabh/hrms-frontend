import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { useToast, type ToastKind } from './Toast';

let toast: (text: string, kind?: ToastKind) => void;
function Capture() { toast = useToast(); return null; }

describe('Toast', () => {
  it('announces successes politely and errors assertively', () => {
    renderUi(<Capture />);
    act(() => { toast('Saved'); toast('Failed', 'error'); });
    expect(screen.getByRole('status').textContent).toContain('Saved');
    expect(screen.getByRole('alert').textContent).toContain('Failed');
  });
  it('removes itself after a while and an error lasts longer', () => {
    vi.useFakeTimers();
    try {
      renderUi(<Capture />);
      act(() => { toast('Saved'); toast('Failed', 'error'); });
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.queryByText('Saved')).toBeNull();
      expect(screen.queryByText('Failed')).not.toBeNull();
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.queryByText('Failed')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('can be dismissed', () => {
    renderUi(<Capture />);
    act(() => toast('Saved'));
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click());
    expect(screen.queryByText('Saved')).toBeNull();
  });
  it('has no axe violations', async () => {
    renderUi(<Capture />);
    act(() => toast('Saved'));
    await expectNoAxeViolations();
  });
});
