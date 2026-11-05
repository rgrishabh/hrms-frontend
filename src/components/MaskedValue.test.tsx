import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { MaskedValue } from './MaskedValue';

describe('MaskedValue', () => {
  it('asks for the value only on an explicit click, and hiding forgets it', async () => {
    const onReveal = vi.fn(async () => '₹1,20,000.00');
    const { container } = renderUi(<MaskedValue label="Net pay" mask="₹ ••••••" onReveal={onReveal} />);
    expect(onReveal).not.toHaveBeenCalled();
    expect(container.textContent).toContain('₹ ••••••');
    expect(container.textContent).not.toContain('1,20,000');
    await userEvent.click(screen.getByRole('button', { name: 'Show Net pay' }));
    expect(onReveal).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('₹1,20,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Hide Net pay' }));
    expect(container.textContent).not.toContain('1,20,000');
    await userEvent.click(screen.getByRole('button', { name: 'Show Net pay' }));
    expect(onReveal).toHaveBeenCalledTimes(2);
  });
  it('shows the reason when revealing fails and stays masked', async () => {
    renderUi(<MaskedValue label="Net pay" onReveal={async () => { throw new Error('Denied'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show Net pay' }));
    expect(screen.getByRole('alert').textContent).toBe('Denied');
    expect(screen.getByRole('button', { name: 'Show Net pay' })).toBeTruthy();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<MaskedValue label="Net pay" onReveal={() => '1'} />);
    await expectNoAxeViolations(container);
  });
});
