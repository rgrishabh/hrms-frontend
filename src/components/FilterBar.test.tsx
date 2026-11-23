import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { FilterBar } from './FilterBar';
import { Select } from './Select';

describe('FilterBar', () => {
  it('does not submit a surrounding form on Enter', async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderUi(<form onSubmit={submit}><FilterBar search={{ label: 'Search', value: 'a', onChange: vi.fn() }} /><button>Go</button></form>);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), '{Enter}');
    expect(submit).not.toHaveBeenCalled();
  });
  it('offers Clear only when a filter is active', () => {
    const onClear = vi.fn();
    const { rerender } = renderUi(<FilterBar onClear={onClear} activeCount={0} />);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    rerender(<FilterBar onClear={onClear} activeCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<FilterBar search={{ label: 'Search', value: '', onChange: vi.fn() }}><Select label="Branch" hideLabel options={[]} /></FilterBar>);
    await expectNoAxeViolations(container);
  });
});
