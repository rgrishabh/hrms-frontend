import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { api, qs, type Paged } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { Money, formatMoney } from '../../components/Money';
import { RevealToggle } from '../../components/RevealToggle';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useTableState } from '../../components/useTableState';
import { fmtMonth } from '../../format';
import { ApplyForm, DeferForm, DisburseForm, LoanDetail, RepaymentForm } from './LoanForms';
import { KIND_LABEL, loanKinds, loansNoun, loansTitle, reloadLoans, terms, type Loan } from './types';

const URL_BASE = '/api/v1/loans/requests';
const PAGE_SIZE = 25;

function baseColumns(showEmployee: boolean): Column<Loan>[] {
  return [
    ...(showEmployee ? [{ key: 'employee', header: 'Employee', card: 'title', cell: (l: Loan) => <>{l.name}<div className="table__cell-sub mono">{l.employee_code}{l.department ? ` · ${l.department}` : ''}</div></> } as Column<Loan>] : []),
    { key: 'kind', header: 'Kind', card: showEmployee ? 'subtitle' : 'title', cell: (l) => <>{KIND_LABEL[l.kind]}{l.purpose && <div className="table__cell-sub">{l.purpose}</div>}</> },
    { key: 'amount', header: 'Amount', align: 'right', cell: (l) => <Money value={l.amount} masked={isMaskedField(l, 'amount')} /> },
    { key: 'recovery', header: 'Recovery', cell: (l) => <>{terms(l)}{l.skip_periods.length > 0 && <div className="table__cell-sub">Deferred: {l.skip_periods.map(fmtMonth).join(', ')}</div>}</> },
    { key: 'outstanding', header: 'Outstanding', align: 'right', cell: (l) => (['disbursed', 'closed'].includes(l.status) ? <Money value={l.outstanding} masked={isMaskedField(l, 'outstanding')} /> : '—') },
    { key: 'status', header: 'Status', card: 'status', cell: (l) => <span className="stack-1"><StatusBadge status={l.status} />{l.recorded_by_other && <span className="table__cell-sub">Recorded by payroll</span>}</span> },
  ];
}

export function MyLoans() {
  const toast = useToast();
  const { hasFeature } = useAuth();
  const kinds = loanKinds(hasFeature);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<Loan | null>(null);
  const { query: list, revealed, setRevealed } = useRevealable<Paged<Loan>>(`${URL_BASE}${qs({ scope: 'mine', page, pageSize: PAGE_SIZE })}`, { keepPrevious: true });
  const columns: Column<Loan>[] = [
    ...baseColumns(false),
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (l) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => setDetail(l.id)}>Details</Button>
          {l.status === 'pending' && <Button size="sm" onClick={() => setWithdraw(l)}>Withdraw</Button>}
        </div>
      ),
    },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <h2>My {loansTitle(kinds).toLowerCase().replace('&', 'and')}</h2>
        <div className="cluster"><RevealToggle revealed={revealed} loading={list.isFetching} onChange={setRevealed} /><Button variant="primary" onClick={() => setForm(true)}>Apply</Button></div>
      </div>
      <QueryState query={list} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<HandCoins />} title={`You have no ${loansTitle(kinds).toLowerCase().replace('&', 'or')}`} description={`Apply for ${loansNoun(kinds)} when you need one.`} />}>
        {(d) => <Table label="My advances and loans" columns={columns} rows={d.items} rowKey={(l) => l.id} refreshing={list.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {form && <ApplyForm onClose={() => setForm(false)} onSaved={() => { toast('Application sent for approval'); void reloadLoans(); }} />}
      {detail && <LoanDetail id={detail} onClose={() => setDetail(null)} />}
      {withdraw && (
        <ConfirmDialog
          title="Withdraw application"
          message={`Withdraw your ${KIND_LABEL[withdraw.kind].toLowerCase()} application${withdraw.amount === null ? '' : ` for ${formatMoney(withdraw.amount)}`}?`}
          confirmLabel="Withdraw"
          onClose={() => setWithdraw(null)}
          onConfirm={async () => { await api.post(`${URL_BASE}/${withdraw.id}/withdraw`); toast('Application withdrawn'); await reloadLoans(); }}
        />
      )}
    </div>
  );
}

type Act = { kind: 'disburse' | 'repay' | 'defer' | 'cancel'; loan: Loan };
const STATUSES = ['pending', 'approved', 'disbursed', 'closed', 'returned', 'rejected', 'cancelled'];
const NO_COLUMNS: Column<Loan>[] = [];
const FILTERS = { status: '', kind: '' };

export function LoanList({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me, hasFeature } = useAuth();
  const kinds = loanKinds(hasFeature);
  const table = useTableState(`loans-${scope}`, NO_COLUMNS, { filters: FILTERS });
  const [detail, setDetail] = useState<string | null>(null);
  const [record, setRecord] = useState(false);
  const [act, setAct] = useState<Act | null>(null);
  const { query: list, revealed, setRevealed } = useRevealable<Paged<Loan>>(`${URL_BASE}${qs({ scope, status: table.filters['status'], kind: table.filters['kind'], page: table.page, pageSize: PAGE_SIZE })}`, { keepPrevious: true });
  const manage = scope === 'all' && can('loans.manage');
  const cancelOk = scope === 'all' && (can('loans.manage') || can('loans.approve'));
  const columns: Column<Loan>[] = [
    ...baseColumns(true),
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (l) => {
        const own = l.employee_id === me?.user.employeeId;
        return (
          <div className="table__actions">
            <Button size="sm" onClick={() => setDetail(l.id)}>Details</Button>
            {manage && !own && l.status === 'approved' && <Button size="sm" variant="primary" onClick={() => setAct({ kind: 'disburse', loan: l })}>Disburse</Button>}
            {manage && !own && l.status === 'disbursed' && <Button size="sm" onClick={() => setAct({ kind: 'repay', loan: l })}>Repayment</Button>}
            {manage && !own && ['approved', 'disbursed'].includes(l.status) && <Button size="sm" onClick={() => setAct({ kind: 'defer', loan: l })}>Defer a month</Button>}
            {cancelOk && !own && l.status === 'approved' && <Button size="sm" variant="danger-ghost" onClick={() => setAct({ kind: 'cancel', loan: l })}>Cancel</Button>}
          </div>
        );
      },
    },
  ];
  return (
    <div className="stack-3">
      <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters} actions={manage && <Button variant="primary" onClick={() => setRecord(true)}>Record for an employee</Button>}>
        <Select label="Status" hideLabel placeholder="Any status" value={table.filters['status']} options={STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
        {kinds.length > 1 && <Select label="Kind" hideLabel placeholder="Both kinds" value={table.filters['kind']} options={kinds.map((k) => ({ value: k, label: `${KIND_LABEL[k]}s` }))} onChange={(e) => table.setFilter('kind', e.target.value)} />}
      </FilterBar>
      <QueryState query={list} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<HandCoins />} title={table.activeFilterCount ? 'Nothing matches these filters' : 'Nothing here yet'} />}>
        {(d) => <Table label="Advances and loans" columns={columns} rows={d.items} rowKey={(l) => l.id} refreshing={list.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {detail && <LoanDetail id={detail} onClose={() => setDetail(null)} />}
      {record && <ApplyForm forOthers onClose={() => setRecord(false)} onSaved={() => { toast('Recorded; sent to the manager and finance for approval'); void reloadLoans(); }} />}
      {act?.kind === 'disburse' && <DisburseForm loan={act.loan} onClose={() => setAct(null)} />}
      {act?.kind === 'repay' && <RepaymentForm loan={act.loan} onClose={() => setAct(null)} />}
      {act?.kind === 'defer' && <DeferForm loan={act.loan} onClose={() => setAct(null)} />}
      {act?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancel approved application"
          danger
          requireComment
          commentLabel="Reason"
          minCommentLength={3}
          confirmLabel="Cancel application"
          onClose={() => setAct(null)}
          message={`Cancel ${act.loan.name}'s ${KIND_LABEL[act.loan.kind].toLowerCase()}${act.loan.amount === null ? '' : ` of ${formatMoney(act.loan.amount)}`} before it is paid?`}
          onConfirm={async (reason) => { await api.post(`${URL_BASE}/${act.loan.id}/cancel`, { reason }); toast('Cancelled'); await reloadLoans(); }}
        />
      )}
    </div>
  );
}
