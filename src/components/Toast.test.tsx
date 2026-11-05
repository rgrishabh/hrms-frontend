import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { useToast, type ToastAction, type ToastKind } from './Toast';

let toast: (text: string, kind?: ToastKind, action?: ToastAction) => void;
function Capture() { toast = useToast(); return null; }

describe('Toast', () => {
  it('waits while hovered or focused, and starts again on leaving', () => {
    vi.useFakeTimers();
    try {
      renderUi(<Capture />);
      act(() => { toast('Saved'); });
      const item = screen.getByText('Saved').closest('.toast')!;
      fireEvent.mouseEnter(item);
      act(() => { vi.advanceTimersByTime(60000); });
      expect(screen.getByText('Saved')).toBeTruthy();
      fireEvent.mouseLeave(item);
      fireEvent.focus(item);
      act(() => { vi.advanceTimersByTime(60000); });
      expect(screen.getByText('Saved')).toBeTruthy();
      fireEvent.blur(item);
      act(() => { vi.advanceTimersByTime(4500); });
      expect(screen.queryByText('Saved')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('offers an undo that runs once and closes the toast', () => {
    const undo = vi.fn();
    renderUi(<Capture />);
    act(() => { toast('Marked done', 'ok', { label: 'Undo', onClick: undo }); });
    act(() => { screen.getByRole('button', { name: 'Undo' }).click(); });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Marked done')).toBeNull();
  });
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
