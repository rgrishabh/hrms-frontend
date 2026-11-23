import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Select } from './Select';

describe('Select', () => {
  const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
  it('is a native select with its placeholder first', async () => {
    const onChange = vi.fn();
    renderUi(<Select label="Branch" placeholder="All branches" options={options} value="" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Branch' });
    expect(select.tagName).toBe('SELECT');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All branches', 'Alpha', 'Beta']);
    await userEvent.selectOptions(select, 'b');
    expect(onChange).toHaveBeenCalled();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Select label="Branch" options={options} hint="h" error="e" />);
    await expectNoAxeViolations(container);
  });
});
