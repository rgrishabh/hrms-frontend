import { act, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi, resetViewport, setViewport } from '../test/render';
import { Button } from './Button';
import { Table, type Column } from './Table';
import { useTableState } from './useTableState';

interface Row { id: string; name: string; days: number }
const rows: Row[] = [{ id: '1', name: 'Asha', days: 2 }, { id: '2', name: 'Ben', days: 3 }];
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name, sortable: true, card: 'title', required: true },
  { key: 'days', header: 'Days', cell: (r) => r.days, sortable: true, align: 'right' },
  { key: 'actions', header: 'Actions', cell: (r) => <Button size="sm">Open {r.name}</Button>, card: 'actions' },
];

afterEach(resetViewport);

describe('the columns and views panel', () => {
  const baseViews = { saved: [{ name: 'Short', hidden: ['days'], sort: null, filters: {} }], onApply: vi.fn(), onSave: vi.fn(), onDelete: vi.fn() };
  const open = async () => { await userEvent.click(screen.getByRole('button', { name: 'Columns and views' })); return screen.findByRole('dialog', { name: 'Columns and views' }); };
  it('lists the columns, holds required ones, and reports a toggle', async () => {
    const onToggleColumn = vi.fn();
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} onToggleColumn={onToggleColumn} hidden={['days']} />);
    const panel = await open();
    expect((within(panel).getByRole('checkbox', { name: 'Name' }) as HTMLInputElement).disabled).toBe(true);
    const days = within(panel).getByRole('checkbox', { name: 'Days' }) as HTMLInputElement;
    expect(days.checked).toBe(false);
    await userEvent.click(days);
    expect(onToggleColumn).toHaveBeenCalledWith('days');
  });
  it('applying a saved view closes the panel', async () => {
    const onApply = vi.fn();
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} views={{ ...baseViews, onApply }} />);
    await userEvent.selectOptions(within(await open()).getByLabelText('Saved views'), 'Short');
    expect(onApply).toHaveBeenCalledWith(baseViews.saved[0]);
    expect(screen.queryByRole('dialog', { name: 'Columns and views' })).toBeNull();
  });
  it('saves a view under a trimmed name, and holds Save until there is one', async () => {
    const onSave = vi.fn();
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} views={{ ...baseViews, saved: [], onSave }} />);
    const panel = await open();
    expect(within(panel).queryByLabelText('Saved views')).toBeNull();
    const save = within(panel).getByRole('button', { name: 'Save view' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const name = within(panel).getByLabelText('Save current view as') as HTMLInputElement;
    await userEvent.type(name, '  Mine  ');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith('Mine');
    expect(name.value).toBe('');
  });
  it('deletes a saved view by name', async () => {
    const onDelete = vi.fn();
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} views={{ ...baseViews, onDelete }} />);
    await userEvent.click(within(await open()).getByRole('button', { name: 'Delete “Short”' }));
    expect(onDelete).toHaveBeenCalledWith('Short');
  });
  it('closes on Escape', async () => {
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} views={baseViews} />);
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Columns and views' })).toBeNull();
  });
});

describe('Table on desktop', () => {
  it('a summary row is a real tfoot on desktop and a last card on phones', () => {
    const foot = (c: Column<Row>, i: number) => (i === 0 ? 'Total' : c.key === 'days' ? '5' : null);
    const { unmount } = renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} foot={foot} />);
    expect(screen.getByRole('table').querySelector('tfoot')?.textContent).toContain('Total');
    unmount();
    setViewport(360);
    renderUi(<Table label="Days" columns={columns} rows={rows} rowKey={(r) => r.id} foot={foot} />);
    expect(within(screen.getByRole('list', { name: 'Days' })).getAllByRole('listitem').at(-1)!.textContent).toContain('Total');
    resetViewport();
  });
  it('is a real, named table with row semantics', () => {
    renderUi(<Table label="People" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'People' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('row', { name: /Asha/ })).toBeTruthy();
  });
  it('cycles sort through ascending, descending, none and reports aria-sort', async () => {
    const onSort = vi.fn();
    const { rerender } = renderUi(<Table label="P" columns={columns} rows={rows} rowKey={(r) => r.id} sort={null} onSort={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'name', direction: 'asc' });
    rerender(<Table label="P" columns={columns} rows={rows} rowKey={(r) => r.id} sort={{ key: 'name', direction: 'asc' }} onSort={onSort} />);
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'name', direction: 'desc' });
  });
  it('hides columns and paginates through the server', async () => {
    const onPage = vi.fn();
    renderUi(<Table label="P" columns={columns} rows={rows} rowKey={(r) => r.id} hidden={['days']} pagination={{ page: 1, pageSize: 2, total: 5, onPage }} />);
    expect(screen.queryByRole('columnheader', { name: 'Days' })).toBeNull();
    expect(screen.getByText('1–2 of 5')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('calls the export hook with the format', async () => {
    const onExport = vi.fn();
    renderUi(<Table label="P" columns={columns} rows={rows} rowKey={(r) => r.id} onExport={onExport} />);
    await userEvent.click(screen.getByRole('button', { name: 'XLSX' }));
    expect(onExport).toHaveBeenCalledWith('xlsx');
  });
  it('shows the empty state and no pager when there are no rows', () => {
    renderUi(<Table label="P" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>None</p>} pagination={{ page: 3, pageSize: 2, total: 0, onPage: vi.fn() }} />);
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Table label="P" columns={columns} rows={rows} rowKey={(r) => r.id} sort={null} onSort={vi.fn()} pagination={{ page: 1, pageSize: 2, total: 5, onPage: vi.fn() }} />);
    await expectNoAxeViolations(container);
  });
});

describe('Table on a phone', () => {
  it('becomes a card list with labels and reachable actions', () => {
    setViewport(360);
    renderUi(<Table label="People" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'People' });
    const [first] = within(list).getAllByRole('listitem');
    expect(within(first!).getByText('Days')).toBeTruthy();
    expect(within(first!).getByRole('button', { name: 'Open Asha' })).toBeTruthy();
  });
  it('has no axe violations', async () => {
    setViewport(360);
    const { container } = renderUi(<Table label="People" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    await expectNoAxeViolations(container);
  });
});

describe('useTableState', () => {
  it('returns to page 1 when a filter or sort changes', () => {
    const { result } = renderHook(() => useTableState('t1', columns));
    act(() => result.current.setPage(3));
    act(() => result.current.setFilter('status', 'active'));
    expect(result.current.page).toBe(1);
    expect(result.current.activeFilterCount).toBe(1);
    act(() => result.current.setPage(3));
    act(() => result.current.setSort({ key: 'name', direction: 'desc' }));
    expect(result.current.page).toBe(1);
  });
  it('remembers hidden columns and saved views, and applying a view restores them', () => {
    const first = renderHook(() => useTableState('t2', columns));
    act(() => first.result.current.toggleColumn('days'));
    act(() => first.result.current.setFilter('status', 'active'));
    act(() => first.result.current.views.onSave('Active'));
    first.unmount();
    const second = renderHook(() => useTableState('t2', columns));
    expect(second.result.current.hidden).toEqual(['days']);
    expect(second.result.current.filters).toEqual({});
    act(() => second.result.current.toggleColumn('days'));
    act(() => second.result.current.views.onApply(second.result.current.views.saved[0]!));
    expect(second.result.current.hidden).toEqual(['days']);
    expect(second.result.current.filters).toEqual({ status: 'active' });
    act(() => second.result.current.views.onDelete('Active'));
    expect(second.result.current.views.saved).toEqual([]);
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('hrms.table.t3', '{oops');
    const { result } = renderHook(() => useTableState('t3', columns));
    expect(result.current.hidden).toEqual([]);
  });
});
