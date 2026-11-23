import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money, formatMoney } from './Money';

describe('Money', () => {
  it('formats through the installation currency, with tabular figures', () => {
    render(<Money value={1234.5} />);
    const el = screen.getByText(formatMoney(1234.5));
    expect(el.className).toContain('tnum');
  });
  it('accepts numeric strings, and a missing amount reads as a dash', () => {
    const { container, rerender } = render(<Money value="99.5" />);
    expect(container.textContent).toBe(formatMoney(99.5));
    rerender(<Money value={null} />);
    expect(container.textContent).toBe('—');
    rerender(<Money value={0} />);
    expect(container.textContent).toBe(formatMoney(0));
  });
});
