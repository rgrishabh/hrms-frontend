import { useState } from 'react';
import { Banknote, Layers } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { CARD_LIST_QUERY, useMediaQuery } from '../../components/hooks';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { formatMoney, Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Skeleton } from '../../components/Skeleton';
import { StatGrid, StatTile } from '../../components/StatTile';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit } from '../../components/useSubmit';
import { fmtDateOfInstant, fmtDateTime } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { Ageing, Batch, Payable } from './types';

const BASE = '/api/v1/expenses';
const reloadFinance = () => invalidateApi(`${BASE}/payables`, `${BASE}/batches`, `${BASE}/reports/ageing`, `${BASE}/claims`);

function AgeingTiles() {
  const ageing = useApiQuery<Ageing>(`${BASE}/reports/ageing`);
  return (
    <QueryState query={ageing} compact loading={<StatGrid>{[1, 2, 3, 4].map((i) => <Skeleton key={i} height="tile" />)}</StatGrid>} isEmpty={(d) => !d.pipeline.length && !d.approvedUnpaidByAge.length} empty={null}>
      {(d) => (
        <StatGrid label="Reimbursement pipeline">
          {d.pipeline.map((p) => <StatTile key={p.status} tileKey={`pipeline_${p.status}`} label={p.status === 'submitted' ? 'Awaiting approval' : 'Approved, unpaid'} value={<Money value={p.amount} />} detail={`${p.claims} claim(s)`} />)}
          {d.approvedUnpaidByAge.map((b) => <StatTile key={b.bucket} tileKey={`age_${b.bucket}`} label={`Unpaid ${b.bucket} days`} value={<Money value={b.amount} />} detail={`${b.claims} claim(s)`} />)}
        </StatGrid>
      )}
    </QueryState>
  );
}

function Payables() {
  const asCards = useMediaQuery(CARD_LIST_QUERY);
  const { run, isBusy } = useAction();
  const query = useApiQuery<ApiResponse<'/api/v1/expenses/payables'>>(`${BASE}/payables`);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toast = useToast();
  const prepare = () => run('prepare', async () => {
    const r = await api.post<ApiResponse<'/api/v1/expenses/batches', 'post'>>(`${BASE}/batches`, { claimIds: [...selected] });
    toast(`Batch prepared: ${formatMoney(r.total)}. Another finance user must approve it.`);
    setSelected(new Set());
    await reloadFinance();
  });
  const columns: Column<Payable>[] = [
    { key: 'employee', header: 'Employee', card: 'title', cell: (p) => <>{p.employee_name} <span className="text-2 mono">{p.employee_code}</span></> },
    { key: 'claim', header: 'Claim', card: 'subtitle', cell: (p) => p.title },
    {
      key: 'amount', header: 'Amount', align: 'right', cell: (p) => (
        <>
          <Money value={p.payable} />
          {Number(p.advance_adjusted) > 0 && <div className="table__cell-sub"><Money value={p.total} /> less <Money value={p.advance_adjusted} /> advance</div>}
        </>
      ),
    },
    { key: 'approved', header: 'Approved', cell: (p) => `${fmtDateOfInstant(p.approved_at)} · ${p.age_days}d` },
    { key: 'select', header: 'Select', card: 'actions', cell: (p) => <Checkbox label={asCards ? <>Select<span className="visually-hidden"> {p.title}</span></> : <span className="visually-hidden">Select {p.title}</span>} checked={selected.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} /> },
  ];
  return (
    <Card title="Approved, ready to pay" flush actions={<Button variant="primary" size="sm" disabled={!selected.size} loading={isBusy('prepare')} onClick={() => void prepare()}>Prepare batch ({selected.size})</Button>}>
      <QueryState query={query} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<Banknote />} title="Nothing to pay" description="Approved claims appear here." />}>
        {(d) => <Table label="Claims ready to pay" columns={columns} rows={d.items} rowKey={(p) => p.id} />}
      </QueryState>
    </Card>
  );
}

function Batches() {
  const { can, me } = useAuth();
  const toast = useToast();
  const { run, isBusy } = useAction();
  const query = useApiQuery<ApiResponse<'/api/v1/expenses/batches'>>(`${BASE}/batches`);
  const [paying, setPaying] = useState<Batch | null>(null);
  const [cancelling, setCancelling] = useState<Batch | null>(null);
  const canPay = can('expenses.pay');
  const approve = (b: Batch) => run(b.id, async () => { await api.post(`${BASE}/batches/${b.id}/approve`); await reloadFinance(); }, 'Batch approved');
  const columns: Column<Batch>[] = [
    { key: 'created', header: 'Created', card: 'title', cell: (b) => fmtDateTime(b.created_at) },
    { key: 'claims', header: 'Claims', align: 'right', cell: (b) => b.claim_count },
    { key: 'total', header: 'Total', align: 'right', cell: (b) => <Money value={b.total} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (b) => <StatusBadge status={b.status} /> },
    {
      key: 'who', header: 'Prepared / approved / paid by', cell: (b) => (
        <span className="text-sm text-2">
          {[b.prepared_by_name, b.approved_by_name, b.paid_by_name].filter(Boolean).join(' → ')}
          {b.payment_reference && <span className="table__cell-sub mono"> Ref {b.payment_reference}</span>}
          {b.status === 'prepared' && b.prepared_by === me?.user.id && <span className="table__cell-sub"> Another finance user must approve it</span>}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (b) => canPay && (
        <div className="table__actions">
          {/* The server refuses the person who prepared the batch: maker and checker must differ. */}
          {b.status === 'prepared' && b.prepared_by !== me?.user.id && <Button size="sm" loading={isBusy(b.id)} onClick={() => void approve(b)}>Approve</Button>}
          {b.status === 'approved' && <Button size="sm" variant="primary" onClick={() => setPaying(b)}>Mark paid</Button>}
          {['approved', 'paid'].includes(b.status) && <DownloadButton url={`${BASE}/batches/${b.id}/export.csv`} fileName={`reimbursement-batch-${b.id}.csv`}>Export CSV</DownloadButton>}
          {['prepared', 'approved'].includes(b.status) && <Button size="sm" variant="danger-ghost" onClick={() => setCancelling(b)}>Cancel</Button>}
        </div>
      ),
    },
  ];
  return (
    <Card title="Payment batches" flush>
      <QueryState query={query} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<Layers />} title="No batches yet" />}>
        {(d) => <Table label="Payment batches" columns={columns} rows={d.items} rowKey={(b) => b.id} />}
      </QueryState>
      {paying && <PayBatch batch={paying} onClose={() => setPaying(null)} />}
      {cancelling && (
        <ConfirmDialog
          title="Cancel batch"
          danger
          confirmLabel="Cancel batch"
          message={`Cancel this batch of ${cancelling.claim_count} claim(s), ${formatMoney(cancelling.total)}? The claims go back to ready to pay.`}
          onClose={() => setCancelling(null)}
          onConfirm={async () => { await api.post(`${BASE}/batches/${cancelling.id}/cancel`); toast('Batch cancelled'); await reloadFinance(); }}
        />
      )}
    </Card>
  );
}

function PayBatch({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const toast = useToast();
  const [reference, setReference] = useState('');
  const form = useSubmit(async () => {
    await api.post(`${BASE}/batches/${batch.id}/paid`, { paymentReference: reference });
    toast('Payment recorded; employees notified');
    await reloadFinance();
    onClose();
  });
  return (
    <Modal title="Record payment" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <p className="text-2">{batch.claim_count} claim(s), <Money value={batch.total} />. Record the bank transfer reference once the transfer is done.</p>
        <Input label="Payment reference" required minLength={3} error={form.errors['paymentReference']} value={reference} onChange={(e) => setReference(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} onCancel={onClose} submitLabel="Mark paid" />
      </form>
    </Modal>
  );
}

export function Finance() {
  const { can } = useAuth();
  return (
    <div className="stack-4">
      <AgeingTiles />
      {can('expenses.pay') && <Payables />}
      <Batches />
    </div>
  );
}
