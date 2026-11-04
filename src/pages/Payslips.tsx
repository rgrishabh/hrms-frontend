import { useState } from 'react';
import { Printer, Receipt } from 'lucide-react';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { KeyValue } from '../components/KeyValue';
import { MaskedValue } from '../components/MaskedValue';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Table, type Column } from '../components/Table';
import { PayLines, type PayLine } from '../features/payroll/PayLines';
import { currencySymbol, fmtDate, money } from '../format';
import { useApiQuery } from '../lib/query';

interface PayslipRow { id: string; period: string; kind: string; gross: number | string; deductions: number | string; net: number | string }
interface Payslip extends PayslipRow {
  legal_entity: string; name: string; employee_code: string; designation: string | null; department: string | null; branch: string; date_of_joining: string;
  paid_days: number | string; days_in_period: number | string; lop_days: number | string; uan: string | null; pan: string | null; account: string | null; ifsc: string | null; lines: PayLine[];
}

export function Payslips() {
  const query = useApiQuery<{ items: PayslipRow[] }>('/api/v1/payroll/payslips/mine');
  const [open, setOpen] = useState<string | null>(null);
  const mask = `${currencySymbol()} ••••••`;
  const columns: Column<PayslipRow>[] = [
    { key: 'period', header: 'Month', card: 'title', cell: (p) => <span className="tnum">{p.period}{p.kind === 'fnf' ? ' (F&F)' : ''}</span> },
    { key: 'gross', header: 'Gross', align: 'right', cell: (p) => <MaskedValue label={`Gross for ${p.period}`} mask={mask} onReveal={() => money(p.gross)} /> },
    { key: 'deductions', header: 'Deductions', align: 'right', cell: (p) => <MaskedValue label={`Deductions for ${p.period}`} mask={mask} onReveal={() => money(p.deductions)} /> },
    { key: 'net', header: 'Net pay', align: 'right', cell: (p) => <MaskedValue label={`Net pay for ${p.period}`} mask={mask} onReveal={() => money(p.net)} /> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (p) => <div className="table__actions"><Button size="sm" onClick={() => setOpen(p.id)}>View</Button></div> },
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
  const query = useApiQuery<Payslip>(`/api/v1/payroll/payslips/${id}`);
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
              { label: 'UAN / PAN', value: `${s.uan ?? '—'} / ${s.pan ?? '—'}` },
              { label: 'Bank', value: `${s.account ?? '—'}${s.ifsc ? ` · ${s.ifsc}` : ''}` },
            ]} />
            <PayLines lines={s.lines} gross={s.gross} deductions={s.deductions} net={s.net} />
            <div className="cluster-between no-print">
              <span className="text-xs text-3">Computer-generated payslip.</span>
              <Button icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>Print or save as PDF</Button>
            </div>
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
