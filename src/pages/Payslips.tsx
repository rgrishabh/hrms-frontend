import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate, money } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal } from '../ui';
import { PayLines } from './Payroll';

export function Payslips() {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/payroll/payslips/mine'), []);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <div><h1>My payslips</h1><p className="sub">Available once a payroll run is finalized.</p></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No payslips yet.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Month</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th /></tr></thead><tbody>
          {data.items.map((p: any) => <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}><td className="mono">{p.period}{p.kind === 'fnf' ? ' (F&F)' : ''}</td>
            <td>{money(p.gross)}</td><td>{money(p.deductions)}</td><td><strong>{money(p.net)}</strong></td><td><button className="btn sm">View</button></td></tr>)}
        </tbody></table></div>)}
      {open && <PayslipView id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function PayslipView({ id, onClose }: { id: string; onClose: () => void }) {
  const { config } = useAuth();
  const { data: p, loading, error } = useLoad(() => api.get(`/api/v1/payroll/payslips/${id}`), [id]);
  return (
    <Modal title={p ? `Payslip ${p.period}` : 'Payslip'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack payslip">
          <div className="row"><div><strong>{p.legal_entity}</strong><div className="muted" style={{ fontSize: 12 }}>{config?.brand.name}</div></div><span className="spacer" />
            <strong>Payslip — {p.period}{p.kind === 'fnf' ? ' (full & final)' : ''}</strong></div>
          <div className="form-grid" style={{ fontSize: 13 }}>
            <div><span className="muted">Employee</span><div>{p.name} ({p.employee_code})</div></div>
            <div><span className="muted">Designation</span><div>{p.designation ?? '—'}{p.department ? ` · ${p.department}` : ''}</div></div>
            <div><span className="muted">Branch</span><div>{p.branch}</div></div>
            <div><span className="muted">Joined</span><div>{fmtDate(p.date_of_joining)}</div></div>
            <div><span className="muted">Paid days</span><div>{Number(p.paid_days)} of {Number(p.days_in_period)}{Number(p.lop_days) ? ` (LOP ${Number(p.lop_days)})` : ''}</div></div>
            <div><span className="muted">UAN / PAN</span><div>{p.uan ?? '—'} / {p.pan ?? '—'}</div></div>
            <div><span className="muted">Bank</span><div>{p.account ?? '—'}{p.ifsc ? ` · ${p.ifsc}` : ''}</div></div>
          </div>
          <PayLines lines={p.lines} gross={p.gross} deductions={p.deductions} net={p.net} />
          <div className="row"><span className="muted" style={{ fontSize: 11 }}>Computer-generated payslip.</span><span className="spacer" /><button className="btn" onClick={() => window.print()}>Print / save as PDF</button></div>
        </div>
      )}
    </Modal>
  );
}
