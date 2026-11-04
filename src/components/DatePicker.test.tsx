import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('is a native date input with limits', () => {
    renderUi(<DatePicker label="From" min="2026-01-01" value="2026-02-01" readOnly />);
    const input = screen.getByLabelText('From') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.min).toBe('2026-01-01');
    expect(input.value).toBe('2026-02-01');
  });
  it('maps datetime to the local input type', () => {
    renderUi(<DatePicker label="At" mode="datetime" />);
    expect((screen.getByLabelText('At') as HTMLInputElement).type).toBe('datetime-local');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<DatePicker label="From" hint="h" />);
    await expectNoAxeViolations(container);
  });
});
