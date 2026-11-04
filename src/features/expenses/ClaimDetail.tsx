import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { Modal } from '../../components/Modal';
import { formatMoney, Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { fmtDate, fmtNumber } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { ClaimForm } from './ClaimList';
import { ItemForm } from './ItemForm';
import { CATEGORIES_URL, CLAIMS_URL, VEHICLE, type Claim, type ClaimItem, type ExpenseCategory } from './types';

type Confirming = 'submit' | 'cancel' | 'withdraw';

const pricing = (i: ClaimItem) => {
  if (!i.calc || !i.quantity) return null;
  return i.calc === 'per_diem'
    ? `${fmtNumber(i.quantity)} day(s) × ${formatMoney(i.rate ?? 0)} · ${i.tier ?? ''}`
    : `${fmtNumber(i.quantity)} km × ${formatMoney(i.rate ?? 0)} · ${VEHICLE[i.vehicle ?? ''] ?? i.vehicle ?? ''}`;
};

function TripNote({ claim: c }: { claim: Claim }) {
  const adjusted = Number(c.advance_adjusted ?? 0);
  return (
    <Alert>
      Claim for a trip{adjusted > 0
        ? <>: <Money value={adjusted} /> set off against the travel advance, <Money value={Number(c.total) - adjusted} /> to reimburse.</>
        : '. When it is approved, any travel advance still outstanding is set off first; only the rest is reimbursed.'}
    </Alert>
  );
}

export function ClaimDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const { me } = useAuth();
  const query = useApiQuery<Claim>(`${CLAIMS_URL}/${id}`);
  const c = query.data;
  const cats = useApiQuery<{ items: ExpenseCategory[] }>(c?.editable ? CATEGORIES_URL : null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirming | null>(null);
  const [removing, setRemoving] = useState<ClaimItem | null>(null);
  const columns: Column<ClaimItem>[] = [
    { key: 'date', header: 'Date', card: 'subtitle', cell: (i) => fmtDate(i.expense_date) },
    { key: 'category', header: 'Category', card: 'title', cell: (i) => i.category_name },
    {
      key: 'description', header: 'Description', cell: (i) => (
        <>
          {i.description}
          {pricing(i) && <div className="table__cell-sub">{pricing(i)}</div>}
          {i.merchant && <div className="table__cell-sub">{i.merchant}{i.invoice_number ? ` · ${i.invoice_number}` : ''}{i.gstin ? ` · GSTIN ${i.gstin}` : ''}</div>}
          {i.duplicate_of && <div><Badge tone="warn">Possible duplicate</Badge></div>}
        </>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', cell: (i) => <Money value={i.amount} /> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (i) => (
        <div className="table__actions">
          {i.has_receipt && <DownloadButton url={`/api/v1/expenses/items/${i.id}/receipt`} fileName={`receipt-${i.expense_date}`} aria-label={`Download receipt for ${i.description}`}>Receipt</DownloadButton>}
          {c?.editable && <Button size="sm" onClick={() => setRemoving(i)}>Remove</Button>}
        </div>
      ),
    },
  ];
  const own = c?.employee_id === me?.user.employeeId;
  return (
    <Modal title={c?.title ?? 'Expense claim'} size="lg" onClose={onClose}>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster-between">
              <span className="cluster"><StatusBadge status={d.status} /><span className="text-2">{d.employee_name}</span></span>
              <strong><Money value={d.total} /></strong>
            </div>
            <p className="text-sm text-2">{d.purpose}{d.project ? ` · ${d.project}` : ''}{d.payment_reference ? ` · paid, ref ${d.payment_reference}` : ''}</p>
            {d.travel_request_id && <TripNote claim={d} />}
            {d.items.length
              ? <Table label="Expenses in this claim" columns={columns} rows={d.items} rowKey={(i) => i.id} />
              : <EmptyState compact title="No expenses yet" description={d.editable ? 'Add the first one to submit this claim.' : undefined} />}
            {cats.isError && <InlineError error={cats.error} />}
            {d.editable && (
              <div className="cluster-between">
                <div className="cluster">
                  <Button disabled={!cats.data} onClick={() => setAdding(true)}>Add expense</Button>
                  <Button onClick={() => setEditing(true)}>Edit details</Button>
                </div>
                <div className="cluster">
                  <Button variant="danger-ghost" onClick={() => setConfirm('cancel')}>Cancel claim</Button>
                  <Button variant="primary" disabled={!d.items.length} onClick={() => setConfirm('submit')}>Submit for approval</Button>
                </div>
              </div>
            )}
            {d.status === 'submitted' && own && <div className="cluster-between"><span /><Button onClick={() => setConfirm('withdraw')}>Withdraw</Button></div>}
            {confirm && (
              <ConfirmDialog
                title={confirm === 'submit' ? 'Submit claim' : confirm === 'withdraw' ? 'Withdraw claim' : 'Cancel claim'}
                danger={confirm !== 'submit'}
                confirmLabel={confirm === 'submit' ? 'Submit' : confirm === 'withdraw' ? 'Withdraw claim' : 'Cancel claim'}
                message={confirm === 'submit' ? `Submit ${formatMoney(d.total)} for approval? You cannot edit it unless it is returned to you.` : confirm === 'withdraw' ? 'Withdraw this claim from approval? It is cancelled, and this cannot be undone.' : 'Cancel this claim? This cannot be undone.'}
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                  await api.post(`${CLAIMS_URL}/${id}/${confirm === 'submit' ? 'submit' : 'cancel'}`);
                  toast(confirm === 'submit' ? 'Submitted for approval' : confirm === 'withdraw' ? 'Claim withdrawn' : 'Claim cancelled');
                  await invalidateApi(CLAIMS_URL, '/api/v1/approvals', '/api/v1/dashboard');
                }}
              />
            )}
            {removing && (
              <ConfirmDialog
                title="Remove expense"
                danger
                confirmLabel="Remove"
                message={`Remove “${removing.description}” (${formatMoney(removing.amount)}) from this claim? Its receipt is removed too.`}
                onClose={() => setRemoving(null)}
                onConfirm={async () => { await api.del(`${CLAIMS_URL}/${id}/items/${removing.id}`); toast('Expense removed'); await invalidateApi(CLAIMS_URL); }}
              />
            )}
            {adding && cats.data && <ItemForm claimId={id} categories={cats.data.items} onClose={() => setAdding(false)} />}
            {editing && <ClaimForm claim={d} onClose={() => setEditing(false)} onSaved={() => toast('Claim saved')} />}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
