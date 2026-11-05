import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { renderUi } from '../test/render';
import { QueryState } from './QueryState';

function Harness({ fn }: { fn: () => Promise<{ items: string[] }> }) {
  const query = useQuery({ queryKey: ['x'], queryFn: fn });
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<p>Nothing</p>} loading={<p>Wait</p>}>
      {(d) => <p>{d.items.length} items</p>}
    </QueryState>
  );
}

describe('QueryState', () => {
  it('goes from loading to data', async () => {
    renderUi(<Harness fn={async () => ({ items: ['a'] })} />);
    expect(screen.getByText('Wait')).toBeTruthy();
    expect(await screen.findByText('1 items')).toBeTruthy();
  });
  it('shows empty for an empty result', async () => {
    renderUi(<Harness fn={async () => ({ items: [] })} />);
    expect(await screen.findByText('Nothing')).toBeTruthy();
  });
  it('shows an error and never calls children without data, and retry works', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError({ type: 'about:blank', title: 'Boom', status: 500 })).mockResolvedValue({ items: ['a'] });
    renderUi(<Harness fn={fn} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Boom');
    expect(screen.queryByText('Nothing')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('1 items')).toBeTruthy();
  });
});
