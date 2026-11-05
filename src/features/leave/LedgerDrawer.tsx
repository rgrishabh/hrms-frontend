import { useState } from 'react';
import { History } from 'lucide-react';
import { qs } from '../../api';
import { Drawer } from '../../components/Drawer';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { fmtDateTime, fmtNumber } from '../../format';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import type { LeaveBalance } from './types';

type LedgerEntry = ApiItem<'/api/v1/leave/ledger'>;

/** Every way the ledger records a change to a balance. An unknown type reads as its code in words. */
const ENTRY_LABEL: Record<string, string> = {
  opening: 'Opening balance', accrual: 'Credited', adjustment: 'Correction', consumption: 'Leave taken', reversal: 'Leave returned', lapse: 'Lapsed',
  carry_forward: 'Carried in from last year', carry_out: 'Carried out to next year',
};
const entryLabel = (t: string) => ENTRY_LABEL[t] ?? `${t.charAt(0).toUpperCase()}${t.slice(1).replace(/_/g, ' ')}`;

const signed = (n: number | string) => `${Number(n) > 0 ? '+' : ''}${fmtNumber(n)}`;

const columns: Column<LedgerEntry>[] = [
  { key: 'type', header: 'Entry', card: 'title', cell: (e) => entryLabel(e.entry_type) },
  { key: 'days', header: 'Days', align: 'right', cell: (e) => signed(e.days) },
  { key: 'when', header: 'When', cell: (e) => fmtDateTime(e.created_at) },
  { key: 'note', header: 'Note', cell: (e) => e.note ?? '—' },
];

export function LedgerDrawer({ employeeId, types, leaveYear, onClose }: { employeeId: string; types: readonly LeaveBalance[]; leaveYear: number; onClose: () => void }) {
  const withBalance = types.filter((t) => t.requires_balance);
  const [typeId, setTypeId] = useState(withBalance[0]?.id ?? '');
  const query = useApiQuery<ApiResponse<'/api/v1/leave/ledger'>>(typeId ? `/api/v1/leave/ledger${qs({ employeeId, leaveTypeId: typeId, year: leaveYear })}` : null);
  return (
    <Drawer title={`Balance history, ${leaveYear}`} onClose={onClose}>
      <div className="stack-4">
        <Select label="Leave type" value={typeId} options={withBalance.map((t) => ({ value: t.id, label: t.name }))} onChange={(e) => setTypeId(e.target.value)} />
        {typeId
          ? (
            <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<History />} title="Nothing recorded this year" />}>
              {(d) => <Table label="Balance history" columns={columns} rows={d.items} rowKey={(e) => e.id} />}
            </QueryState>
          )
          : <EmptyState compact title="No leave type here has a balance" />}
      </div>
    </Drawer>
  );
}
