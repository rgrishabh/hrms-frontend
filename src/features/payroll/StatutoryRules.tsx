import { useState } from 'react';
import { Scale } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDate } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { RuleKind, StatutoryRule } from './types';

const URL = '/api/v1/payroll/statutory-rules';
const RULE_LABEL: Record<RuleKind, string> = { pf: 'Provident fund', esi: 'ESI', pt: 'Professional tax', lwf: 'Labour welfare fund', tds: 'Income tax (TDS)' };
const RULE_HELP: Record<RuleKind, string> = {
  pf: '{"employeeRate": …, "employerRate": …, "epsRate": …, "wageCeiling": …, "ceilingOnEmployee": true, "ceilingOnEmployer": true}',
  esi: '{"employeeRate": …, "employerRate": …, "wageThreshold": …, "rounding": "up"}',
  pt: '{"slabs": [{"upTo": …, "amount": …}, {"upTo": null, "amount": …, "monthAmounts": {"02": …}}]}',
  lwf: '{"employee": …, "employer": …, "months": [6, 12]}',
  tds: '{"slabs": [{"upTo": …, "rate": …}, {"upTo": null, "rate": …}], "standardDeduction": …, "rebateLimit": …, "rebateMax": …, "cessRate": …}',
};
interface RuleForm { id?: string; kind: RuleKind; scope: string; effectiveFrom: string; effectiveTo: string; params: string; sourceReference: string }
const BLANK: RuleForm = { kind: 'pf', scope: 'IN', effectiveFrom: '', effectiveTo: '', params: '', sourceReference: '' };
const toForm = (r: StatutoryRule): RuleForm => ({ id: r.id, kind: r.kind, scope: r.scope, effectiveFrom: r.effective_from, effectiveTo: r.effective_to ?? '', params: JSON.stringify(r.params, null, 2), sourceReference: r.source_reference });
const scopeFor = (k: RuleKind) => (k === 'pf' || k === 'esi' ? 'IN' : k === 'tds' ? 'new' : '');
const parses = (text: string) => { try { JSON.parse(text); return true; } catch { return false; } };

export function StatutoryRules() {
  const { can, me } = useAuth();
  const toast = useToast();
  const action = useAction();
  const query = useApiQuery<{ items: StatutoryRule[] }>(URL);
  const [edit, setEdit] = useState<RuleForm | null>(null);
  const [retire, setRetire] = useState<StatutoryRule | null>(null);
  const manage = can('payroll.statutory');
  const reload = () => invalidateApi(URL);
  const columns: Column<StatutoryRule>[] = [
    { key: 'rule', header: 'Rule', card: 'title', cell: (r) => <>{RULE_LABEL[r.kind]}<div className="table__cell-sub mono">{JSON.stringify(r.params).slice(0, 90)}</div></> },
    { key: 'scope', header: 'Scope', cell: (r) => r.scope },
    { key: 'effective', header: 'Effective', cell: (r) => <span className="tnum">{fmtDate(r.effective_from)}{r.effective_to ? ` – ${fmtDate(r.effective_to)}` : ' onwards'}</span> },
    { key: 'source', header: 'Source', cell: (r) => <span className="text-sm">{r.source_reference}</span> },
    { key: 'people', header: 'Entered and verified by', cell: (r) => <span className="text-sm">{r.created_by_name}{r.verified_by_name ? `, then ${r.verified_by_name}` : ''}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    ...(manage ? [{
      key: 'actions', header: 'Actions', card: 'actions', cell: (r: StatutoryRule) => (
        <div className="table__actions">
          {r.status === 'draft' && <Button size="sm" onClick={() => setEdit(toForm(r))}>Edit</Button>}
          {r.status === 'draft' && r.created_by !== me?.user.id && <Button size="sm" variant="primary" loading={action.isBusy(r.id)} onClick={() => void action.run(r.id, async () => { await api.post(`${URL}/${r.id}/verify`); await reload(); }, 'Verified and active')}>Verify</Button>}
          {r.status !== 'retired' && <Button size="sm" variant="danger-ghost" onClick={() => setRetire(r)}>Retire</Button>}
        </div>
      ),
    } as Column<StatutoryRule>] : []),
  ];
  return (
    <div className="stack-3">
      <Alert tone="warn">No statutory values are shipped. Enter each rule from the official notification or circular, cite it, and have a second person verify it against the source. Rates change, so review rules at every change in law.</Alert>
      {manage && <div className="cluster-between"><span /><Button variant="primary" onClick={() => setEdit({ ...BLANK })}>New rule</Button></div>}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Scale />} title="No rules yet" description="Without rules no statutory deduction is made, and runs show warnings." />}>
        {(d) => <Table label="Statutory rules" columns={columns} rows={d.items} rowKey={(r) => r.id} />}
      </QueryState>
      {edit && <RuleEditor initial={edit} onClose={() => setEdit(null)} />}
      {retire && (
        <ConfirmDialog
          title="Retire rule"
          danger
          confirmLabel="Retire rule"
          message={`Retire ${RULE_LABEL[retire.kind]} (${retire.scope}) from ${fmtDate(retire.effective_from)}? Future runs will no longer use it.`}
          onClose={() => setRetire(null)}
          onConfirm={async () => { await api.post(`${URL}/${retire.id}/retire`); toast('Retired'); await reload(); }}
        />
      )}
    </div>
  );
}

function RuleEditor({ initial, onClose }: { initial: RuleForm; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const form = useSubmit(async () => {
    const body = { kind: f.kind, scope: f.scope, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || null, params: JSON.parse(f.params) as unknown, sourceReference: f.sourceReference };
    if (f.id) await api.put(`${URL}/${f.id}`, body); else await api.post(URL, body);
    toast('Saved as a draft. A second person must verify it.');
    await invalidateApi(URL);
    onClose();
  }, { validate: (): FieldErrors => (parses(f.params) ? {} : { params: 'Parameters must be valid JSON' }) });
  return (
    <Modal title={f.id ? 'Edit draft rule' : 'New statutory rule'} size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Select label="Rule" value={f.kind} options={Object.entries(RULE_LABEL).map(([value, label]) => ({ value, label }))} onChange={(e) => { const kind = e.target.value as RuleKind; setF({ ...f, kind, scope: scopeFor(kind) }); }} />
          <Input label="Scope" hint={f.kind === 'tds' ? 'new or old (regime)' : f.kind === 'pt' || f.kind === 'lwf' ? 'State, as on the branch' : 'IN'} required minLength={2} maxLength={60} error={form.errors['scope']} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} />
          <DatePicker label="Effective from" required error={form.errors['effectiveFrom']} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
          <DatePicker label="Effective to (optional)" min={f.effectiveFrom || undefined} error={form.errors['effectiveTo']} value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} />
        </div>
        <Textarea label="Parameters (JSON)" hint={`Shape: ${RULE_HELP[f.kind]}. Rates in %, amounts in your currency.`} required rows={8} className="mono" spellCheck={false} error={form.errors['params']} value={f.params} onChange={(e) => setF({ ...f, params: e.target.value })} />
        <Input label="Source reference" hint="Notification or circular number and date, or the advice relied on" required minLength={5} maxLength={500} error={form.errors['sourceReference']} value={f.sourceReference} onChange={(e) => setF({ ...f, sourceReference: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save draft" onCancel={onClose} />
      </form>
    </Modal>
  );
}
