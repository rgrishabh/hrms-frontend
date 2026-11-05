import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { DownloadButton } from '../components/DownloadButton';
import { EmptyState } from '../components/EmptyState';
import { KeyValue } from '../components/KeyValue';
import { MaskedValue } from '../components/MaskedValue';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { RevealToggle } from '../components/RevealToggle';
import { Table, type Column } from '../components/Table';
import { PayLines } from '../features/payroll/PayLines';
import { currencySymbol, fmtDate } from '../format';
import { formatMoney } from '../components/Money';
import type { ApiItem, ApiResponse, Refine } from '../lib/api-types';
import { isMaskedField, useRevealable, withReveal } from '../lib/masking';
import { useApiQuery } from '../lib/query';

/** The list masks like the slip does, though its schema says neither. */
type PayslipRow = Refine<ApiItem<'/api/v1/payroll/payslips/mine'>, { gross: string | null; deductions: string | null; net: string | null; masked?: boolean; maskedFields?: string[] }>;
type Payslip = ApiResponse<'/api/v1/payroll/payslips/{id}'>;

export function Payslips() {
  const query = useApiQuery<Refine<ApiResponse<'/api/v1/payroll/payslips/mine'>, { items: PayslipRow[] }>>('/api/v1/payroll/payslips/mine');
  const [open, setOpen] = useState<string | null>(null);
  const mask = `${currencySymbol()} ••••••`;
  // One slip at a time, so each look writes one audit row for this person's own figure.
  const amount = (p: PayslipRow, field: 'gross' | 'deductions' | 'net', name: string) => (isMaskedField(p, field)
    ? <MaskedValue label={`${name} for ${p.period}`} mask={mask} onReveal={async () => formatMoney((await api.get<Payslip>(withReveal(`/api/v1/payroll/payslips/${p.id}`)))[field])} />
    : formatMoney(p[field]));
  const columns: Column<PayslipRow>[] = [
    { key: 'period', header: 'Month', card: 'title', cell: (p) => <span className="tnum">{p.period}{p.kind === 'fnf' ? ' (F&F)' : ''}</span> },
    { key: 'gross', header: 'Gross', align: 'right', cell: (p) => amount(p, 'gross', 'Gross') },
    { key: 'deductions', header: 'Deductions', align: 'right', cell: (p) => amount(p, 'deductions', 'Deductions') },
    { key: 'net', header: 'Net pay', align: 'right', cell: (p) => amount(p, 'net', 'Net pay') },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (p) => <div className="table__actions"><Button size="sm" aria-label={`View payslip for ${p.period}`} onClick={() => setOpen(p.id)}>View</Button><DownloadButton url={`/api/v1/payroll/payslips/${p.id}/payslip.pdf`} fileName={`payslip-${p.period}.pdf`} aria-label={`Download payslip for ${p.period} as PDF`}>PDF</DownloadButton></div> },
  ];
  return (
    <div className="stack-4">
      <PageHeader title="My payslips" description="Available once a payroll run is finalized. Amounts stay hidden until you ask to see them." />
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Receipt />} title="No payslips yet" description="Your payslip appears here after each finalized payroll run." />}>
        {(d) => <Table label="My payslips" columns={columns} rows={d.items} rowKey={(p) => p.id} />}
      </QueryState>
      {open && <PayslipView id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PayslipView({ id, onClose }: { id: string; onClose: () => void }) {
  const { config } = useAuth();
  const { query, revealed, setRevealed } = useRevealable<Payslip>(`/api/v1/payroll/payslips/${id}`);
  const p = query.data;
  return (
    <Modal title={p ? `Payslip ${p.period}` : 'Payslip'} size="lg" onClose={onClose}>
      <QueryState query={query}>
        {(s) => (
          <div className="stack-4 printable">
            <div className="cluster-between">
              <div><strong>{s.legal_entity}</strong><div className="text-xs text-2">{config?.brand.name}</div></div>
              <strong>Payslip, {s.period}{s.kind === 'fnf' ? ' (full and final)' : ''}</strong>
            </div>
            <KeyValue items={[
              { label: 'Employee', value: `${s.name} (${s.employee_code})` },
              { label: 'Designation', value: `${s.designation ?? '—'}${s.department ? ` · ${s.department}` : ''}` },
              { label: 'Branch', value: s.branch },
              { label: 'Joined', value: fmtDate(s.date_of_joining) },
              { label: 'Paid days', value: `${Number(s.paid_days)} of ${Number(s.days_in_period)}${Number(s.lop_days) ? ` (LOP ${Number(s.lop_days)})` : ''}` },
              { label: 'UAN / PAN', value: isMaskedField(s, 'uan') ? 'Hidden' : `${s.uan ?? '—'} / ${s.pan ?? '—'}` },
              { label: 'Bank', value: isMaskedField(s, 'account') ? 'Hidden' : `${s.account ?? '—'}${s.ifsc ? ` · ${s.ifsc}` : ''}` },
            ]} />
            {isMaskedField(s, 'net') ? <p className="text-sm text-2">Amounts are hidden until you ask to see them.</p> : <PayLines lines={s.lines ?? []} gross={s.gross} deductions={s.deductions} net={s.net} />}
            <div className="cluster-between no-print">
              <RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="pay details" />
              <DownloadButton url={`/api/v1/payroll/payslips/${id}/payslip.pdf`} fileName={`payslip-${s.period}.pdf`}>Download PDF</DownloadButton>
            </div>
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
