import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { renderUi } from '../test/render';
import { FormActions } from './FormActions';
import { Input } from './Input';
import { useAction, useSubmit } from './useSubmit';

function Form({ action, validate }: { action: () => Promise<unknown>; validate?: () => Record<string, string> }) {
  const f = useSubmit(action, { validate });
  return (
    <form onSubmit={f.submit}>
      <Input label="Amount" error={f.errors['amount']} />
      <FormActions error={f.error} busy={f.busy} submitLabel="Save" />
    </form>
  );
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('useSubmit', () => {
  it('a client check stops the request and shows at the field', async () => {
    const action = vi.fn(async () => undefined);
    renderUi(<Form action={action} validate={() => ({ amount: 'Enter an amount' })} />);
    await save();
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount')).toBeTruthy();
  });
  it('server field errors go to their fields, and the form stays', async () => {
    const problem = { type: 'about:blank', title: 'Please check', status: 422, errors: [{ path: 'amount', message: 'Too large' }] };
    renderUi(<Form action={async () => { throw new ApiError(problem); }} />);
    await save();
    expect(await screen.findByText('Too large')).toBeTruthy();
    expect(screen.getByText('Please check')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
  it('a double press submits once', async () => {
    let finish = () => undefined as void;
    const action = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    renderUi(<Form action={action} />);
    await save();
    await userEvent.click(screen.getAllByRole('button')[0]!);
    expect(action).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
  });
});

function Row({ action }: { action: () => Promise<unknown> }) {
  const { run, isBusy } = useAction();
  return <button type="button" disabled={isBusy('r1')} onClick={() => void run('r1', action, 'Done')}>Go</button>;
}

describe('useAction', () => {
  it('reports success and failure as toasts', async () => {
    const { unmount } = renderUi(<Row action={async () => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('Done')).toBeTruthy();
    unmount();
    renderUi(<Row action={async () => { throw new Error('Nope'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('Nope')).toBeTruthy();
  });
});
