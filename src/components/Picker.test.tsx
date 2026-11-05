import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Picker, type PickerItem } from './Picker';

const people: PickerItem[] = [{ id: '1', label: 'Asha Rao', description: 'EMP1' }, { id: '2', label: 'Ben Roy' }];

function Harness({ search }: { search: (q: string) => Promise<PickerItem[]> }) {
  const [value, setValue] = useState<PickerItem | null>(null);
  return <><Picker label="Employee" placeholder="Search name or code" queryKey="people" search={search} value={value} onChange={setValue} /><span data-testid="value">{value?.id ?? 'none'}</span></>;
}

describe('Picker', () => {
  it('searches, picks with the keyboard and shows what was chosen', async () => {
    const search = vi.fn(async (q: string) => people.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())));
    renderUi(<Harness search={search} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Employee' }), 'ben');
    await waitFor(() => expect(search).toHaveBeenCalledWith('ben'));
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ben Roy']));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('value').textContent).toBe('2');
    expect(screen.getByRole('group', { name: 'Employee' }).textContent).toContain('Ben Roy');
  });
  it('the arrows move through the list, stay in it, and Escape closes it', async () => {
    renderUi(<Harness search={async () => people} />);
    const box = screen.getByRole('combobox', { name: 'Employee' });
    await userEvent.type(box, 'r');
    await screen.findByRole('option', { name: /Ben Roy/ });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    await userEvent.keyboard('{ArrowUp}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}');
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('option')).toBeNull();
    await userEvent.keyboard('{ArrowDown}');
    expect(await screen.findAllByRole('option')).toHaveLength(2);
  });
  it('leaving the field closes the list', async () => {
    renderUi(<Harness search={async () => people} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Employee' }));
    await screen.findByRole('option', { name: /Asha Rao/ });
    await userEvent.tab();
    expect(screen.queryByRole('option')).toBeNull();
  });
  it('clearing removes the selection, so no hidden id can be submitted', async () => {
    renderUi(<Harness search={async () => people} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Employee' }));
    await userEvent.click(await screen.findByRole('option', { name: /Asha Rao/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear Employee' }));
    expect(screen.getByTestId('value').textContent).toBe('none');
  });
  it('says when a search fails', async () => {
    renderUi(<Harness search={async () => { throw new Error('down'); }} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Employee' }));
    expect(await screen.findByText('Could not load results')).toBeTruthy();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Harness search={async () => people} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Employee' }));
    await screen.findByRole('option', { name: /Asha Rao/ });
    await expectNoAxeViolations(container);
  });
});
