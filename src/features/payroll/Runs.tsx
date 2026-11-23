import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge, statusLabel } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { useDebouncedValue } from '../../components/hooks';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { RevealToggle } from '../../components/RevealToggle';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import type { ApiBody, ApiResponse } from '../../lib/api-types';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { orgOptions, useOrg } from '../org/useOrg';
import { FnfSuggestions, fnfUrl } from './FnfSuggestions';
import { lastMonth } from './parts';
import { RunDetail } from './RunDetail';
import { RUNS_URL, type FnfSuggestion, type RunRow } from './types';

const PAGE_SIZE = 25;

export function Runs() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const { query: runs, revealed, setRevealed } = useRevealable<ApiResponse<'/api/v1/payroll/runs'>>(RUNS_URL, { keepPrevious: true });
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim().toLowerCase());
  const [page, setPage] = useState(1);
  const open = params.get('run');
  const setOpen = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('run', id); else n.delete('run'); return n; }, { replace: true });
  const columns: Column<RunRow>[] = [
    { key: 'period', header: 'Period', card: 'title', cell: (r) => <Button variant="link" onClick={() => setOpen(r.id)}><span className="tnum nowrap">{r.period}</span></Button> },
    { key: 'entity', header: 'Entity', card: 'subtitle', cell: (r) => r.legal_entity_name ?? '—' },
    { key: 'kind', header: 'Kind', cell: (r) => (r.kind === 'fnf' ? `F&F · ${r.employee_name ?? ''}` : 'Regular') },
    { key: 'employees', header: 'Employees', align: 'right', cell: (r) => (isMaskedField(r, 'totals') ? <Money value={null} masked /> : r.totals?.employees ?? '—') },
    { key: 'gross', header: 'Gross', align: 'right', cell: (r) => <Money value={r.totals?.gross} masked={isMaskedField(r, 'totals')} /> },
    { key: 'net', header: 'Net', align: 'right', cell: (r) => <Money value={r.totals?.net} masked={isMaskedField(r, 'totals')} /> },
    { key: 'warnings', header: 'Warnings', cell: (r) => (r.warnings ? <Badge tone={r.warnings_acknowledged ? 'neutral' : 'warn'}>{r.warnings_acknowledged ? `${r.warnings} acknowledged` : r.warnings}</Badge> : '—') },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
  ];
  const statuses = useMemo(() => [...new Set(runs.data?.items.map((r) => r.status))].map((s) => ({ value: s, label: statusLabel(s) })), [runs.data]);
  const filtered = (runs.data?.items ?? []).filter((r) => (!status || r.status === status) && (!search || `${r.period} ${r.legal_entity_name ?? ''} ${r.employee_name ?? ''}`.toLowerCase().includes(search)));
  const clear = () => { setStatus(''); setText(''); setPage(1); };
  return (
    <div className="stack-3">
      <FilterBar
        search={{ label: 'Search runs', placeholder: 'Month, entity or person', value: text, onChange: (v) => { setText(v); setPage(1); } }}
        activeCount={(status ? 1 : 0) + (text ? 1 : 0)}
        onClear={clear}
        actions={<><RevealToggle revealed={revealed} loading={runs.isFetching} onChange={setRevealed} />{can('payroll.manage') && <Button variant="primary" onClick={() => setCreating(true)}>New run</Button>}</>}
      >
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={statuses} onChange={(e) => { setStatus(e.target.value); setPage(1); }} />
      </FilterBar>
      <QueryState query={runs} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Banknote />} title="No payroll runs yet" description="Set up components, salaries and statutory rules first." />}>
        {(d) => (
          <>
            {filtered.length
              ? <Table label="Payroll runs" columns={columns} rows={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} rowKey={(r) => r.id} pagination={{ page, pageSize: PAGE_SIZE, total: filtered.length, onPage: setPage }} />
              : <EmptyState compact title="No runs match these filters" />}
            {d.total > d.items.length && <p className="text-sm text-2">Showing the latest {d.items.length} of {d.total} runs.</p>}
          </>
        )}
      </QueryState>
      {creating && <NewRun onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {open && <RunDetail id={open} employeeName={runs.data?.items.find((r) => r.id === open)?.employee_name ?? null} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NewRun({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const org = useOrg();
  const [period, setPeriod] = useState(lastMonth);
  const [legalEntityId, setLegalEntityId] = useState('');
  const [kind, setKind] = useState<'regular' | 'fnf'>('regular');
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const fnf = kind === 'fnf';
  const suggestion = useApiQuery<FnfSuggestion>(fnf && employee ? fnfUrl(employee.id) : null);
  // A leaver is settled for their last month. The month can still be changed by hand afterwards.
  const suggested = suggestion.data?.period;
  useEffect(() => { if (suggested) setPeriod(suggested); }, [suggested]);
  const form = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/payroll/runs', 'post'>>(RUNS_URL, { period, legalEntityId, kind, employeeId: fnf ? employee?.id : undefined } satisfies ApiBody<'/api/v1/payroll/runs'>);
    toast('Run created');
    await invalidateApi(RUNS_URL);
    onCreated(r.id);
  }, { validate: (): FieldErrors => (fnf && !employee ? { employeeId: 'Choose who is leaving' } : {}) });
  const entities = orgOptions(org.data?.legalEntities);
  return (
    <Modal title="New payroll run" size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="columns-form">
          <DatePicker label="Month" mode="month" required error={form.errors['period']} value={period} onChange={(e) => setPeriod(e.target.value)} />
          <Select label="Legal entity" required placeholder={org.isError ? 'Could not load entities' : 'Select…'} error={form.errors['legalEntityId']} value={legalEntityId} options={entities} onChange={(e) => setLegalEntityId(e.target.value)} />
          <Select label="Kind" value={kind} options={[{ value: 'regular', label: 'Regular monthly' }, { value: 'fnf', label: 'Full and final (one leaver)' }]} onChange={(e) => setKind(e.target.value as 'regular' | 'fnf')} />
        </div>
        {fnf && <EmployeeField hint="Needs an approved separation" error={form.errors['employeeId']} value={employee} onChange={setEmployee} />}
        {fnf && employee && <FnfSuggestions employeeId={employee.id} />}
        <FormActions error={form.error} busy={form.busy} submitLabel="Create" onCancel={onClose} disabled={fnf && !!employee && !suggestion.isSuccess} />
      </form>
    </Modal>
  );
}
