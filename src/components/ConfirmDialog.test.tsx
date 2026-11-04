import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('runs and closes on success', async () => {
    const onConfirm = vi.fn(async () => undefined); const onClose = vi.fn();
    renderUi(<ConfirmDialog title="Finalize" message="Sure?" confirmLabel="Finalize" onConfirm={onConfirm} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Finalize' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('stays open with the error and the typed comment when it fails', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => { throw new ApiError({ type: 'about:blank', title: 'Not allowed', status: 409 }); });
    renderUi(<ConfirmDialog title="Reject" message="Sure?" confirmLabel="Reject" danger requireComment onConfirm={onConfirm} onClose={onClose} />);
    const button = screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Comment (required)'), 'because');
    await userEvent.click(button);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Not allowed');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Comment (required)').value).toBe('because');
  });
  it('needs the exact word for an irreversible action', async () => {
    renderUi(<ConfirmDialog title="Finalize" message="m" confirmLabel="Finalize" typedConfirmation="FINALIZE" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Finalize' }) as HTMLButtonElement;
    await userEvent.type(screen.getByLabelText('Type FINALIZE to confirm'), 'final');
    expect(button.disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText('Type FINALIZE to confirm'));
    await userEvent.type(screen.getByLabelText('Type FINALIZE to confirm'), 'FINALIZE');
    expect(button.disabled).toBe(false);
  });
  it('has no axe violations', async () => {
    renderUi(<ConfirmDialog title="Finalize" message="m" confirmLabel="Go" requireComment={false} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await expectNoAxeViolations();
  });
});
