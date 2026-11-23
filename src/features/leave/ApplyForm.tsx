import { useEffect, useState, type FormEvent, useMemo } from 'react';
import { api, errorMessage } from '../../api';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { InlineError } from '../../components/ErrorState';
import { Checkbox, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { addDays, fmtDate, fmtNumber, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import type { LeaveBalance } from './types';

type Preview = ApiResponse<'/api/v1/leave/requests/preview', 'post'>;

export function ApplyForm({ types, onClose, onDone }: { types: readonly LeaveBalance[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const start0 = addDays(todayLocal(), 1);
  const [f, setF] = useState({ leaveTypeId: types[0]?.id ?? '', startDate: start0, endDate: start0, startHalf: 'full', endHalf: 'full', reason: '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === f.leaveTypeId);
  const endDate = f.endDate < f.startDate ? f.startDate : f.endDate;
  const single = f.startDate === endDate;
  const body = useMemo(() => ({ leaveTypeId: f.leaveTypeId, startDate: f.startDate, endDate, startHalf: f.startHalf, endHalf: f.endHalf }), [f.leaveTypeId, f.startDate, endDate, f.startHalf, f.endHalf]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.post<Preview>('/api/v1/leave/requests/preview', body)
        .then((p) => { if (alive) { setPreview(p); setPreviewError(null); } })
        .catch((e: unknown) => { if (alive) { setPreview(null); setPreviewError(errorMessage(e)); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [body]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ApiResponse<'/api/v1/leave/requests', 'post'>>('/api/v1/leave/requests', { ...body, reason: f.reason });
      toast(`Leave requested: ${fmtNumber(r.days)} day(s). Sent for approval.`);
      onDone();
      onClose();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };
  const skipped = preview?.perDate.filter((d) => d.fraction === 0) ?? [];
  return (
    <Modal title="Apply for leave" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <Select label="Leave type" value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })} options={types.map((t) => ({ value: t.id, label: `${t.name}${t.requires_balance ? `, ${fmtNumber(t.available)} available` : ''}` }))} />
        <div className="columns-form">
          <DatePicker label="From" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} />
          <DatePicker label="To" required min={f.startDate} value={endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </div>
        {type?.allow_half_day && (
          <div className="stack-1">
            <Checkbox label={single ? 'Second half only' : 'Start in the second half'} checked={f.startHalf === 'second_half'} onChange={(e) => setF({ ...f, startHalf: e.target.checked ? 'second_half' : 'full', endHalf: e.target.checked && single ? 'full' : f.endHalf })} />
            <Checkbox label={single ? 'First half only' : 'Return after the first half'} checked={f.endHalf === 'first_half'} onChange={(e) => setF({ ...f, endHalf: e.target.checked ? 'first_half' : 'full', startHalf: e.target.checked && single ? 'full' : f.startHalf })} />
          </div>
        )}
        {preview && (preview.sufficient
          ? (
            <Alert>
              <strong>{fmtNumber(preview.days)} day(s)</strong>{!preview.paid && ' (unpaid)'}{preview.requiresBalance && <> · {fmtNumber(preview.available)} available</>}
              {skipped.length > 0 && <div className="text-xs">Not counted (weekly off or holiday): {skipped.map((d) => fmtDate(d.date)).join(', ')}</div>}
            </Alert>
          )
          : <InlineError error={`${fmtNumber(preview.days)} day(s) · ${fmtNumber(preview.available)} available, not enough balance`} />)}
        {previewError && <Alert tone="warn">{previewError}</Alert>}
        <Textarea label="Reason" required minLength={3} maxLength={1000} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!preview?.sufficient} loading={busy} loadingText="Submitting…">Submit for approval</Button></div></div>
      </form>
    </Modal>
  );
}
