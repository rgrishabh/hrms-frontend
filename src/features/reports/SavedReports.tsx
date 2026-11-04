import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Skeleton, SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { ReportInfo, SavedReport, Schedule } from './types';

const SAVED_URL = '/api/v1/reports/saved';
const FREQUENCY: Record<Schedule['frequency'], string> = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
const PERIOD: Record<string, string> = { as_saved: 'The saved dates', yesterday: 'Yesterday', last_7_days: 'The last 7 days', last_month: 'Last month', month_to_date: 'This month so far', year_to_date: 'This year so far' };
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const entries = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

const scheduleText = (s: Schedule) => `${FREQUENCY[s.frequency]}${s.frequency === 'weekly' ? ` on ${WEEKDAY[s.weekday ?? 0]}` : s.frequency === 'monthly' ? ` on day ${s.dayOfMonth}` : ''} · ${PERIOD[s.period] ?? s.period}`;

export function SavedReports({ items }: { items: readonly ReportInfo[] }) {
  const toast = useToast();
  const query = useApiQuery<{ items: SavedReport[] }>(SAVED_URL);
  const [schedule, setSchedule] = useState<SavedReport | null>(null);
  const [remove, setRemove] = useState<SavedReport | null>(null);
  const columns: Column<SavedReport>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (s) => (items.some((i) => i.key === s.report_key) ? <Link to={`/reports${qs({ r: s.report_key, ...s.params })}`}>{s.name}</Link> : s.name) },
    { key: 'report', header: 'Report', card: 'subtitle', cell: (s) => s.reportName },
    {
      key: 'schedule', header: 'Schedule', cell: (s) => (s.schedule
        ? (
          <>
            <span className="cluster">{scheduleText(s.schedule)}{!s.schedule.enabled && <Badge tone="warn">Paused</Badge>}</span>
            <div className="table__cell-sub">Next {fmtDate(s.schedule.nextRunOn)}{s.schedule.recipientIds.length ? ` · +${s.schedule.recipientIds.length} recipient(s)` : ''}{s.schedule.lastResult ? ` · ${s.schedule.lastResult}` : ''}</div>
          </>
        )
        : '—'),
    },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (s) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => setSchedule(s)}>{s.schedule ? 'Edit schedule' : 'Schedule'}</Button>
          <Button size="sm" variant="danger-ghost" onClick={() => setRemove(s)}>Delete</Button>
        </div>
      ),
    },
  ];
  return (
    <QueryState query={query} compact loading={<Skeleton height="block" />} isEmpty={(d) => !d.items.length}>
      {(d) => (
        <section className="stack-3" aria-labelledby="reports-saved">
          <h2 id="reports-saved">My saved reports</h2>
          <Table label="My saved reports" columns={columns} rows={d.items} rowKey={(s) => s.id} />
          {schedule && <ScheduleForm key={schedule.id} saved={schedule} onClose={() => setSchedule(null)} />}
          {remove && (
            <ConfirmDialog
              title="Delete saved report"
              danger
              confirmLabel="Delete"
              message={`Delete “${remove.name}”${remove.schedule ? ' and its schedule' : ''}?`}
              onClose={() => setRemove(null)}
              onConfirm={async () => { await api.del(`${SAVED_URL}/${remove.id}`); toast('Deleted'); await invalidateApi(SAVED_URL); }}
            />
          )}
        </section>
      )}
    </QueryState>
  );
}

function ScheduleForm({ saved, onClose }: { saved: SavedReport; onClose: () => void }) {
  const toast = useToast();
  const s0 = saved.schedule;
  const [f, setF] = useState({ frequency: s0?.frequency ?? 'monthly', weekday: String(s0?.weekday ?? 1), dayOfMonth: String(s0?.dayOfMonth ?? 1), period: s0?.period ?? 'last_month', enabled: s0?.enabled ?? true });
  const [to, setTo] = useState<string[]>(s0?.recipientIds ?? []);
  const [removing, setRemoving] = useState(false);
  const people = useApiQuery<{ items: { id: string; name: string; email: string }[] }>(`${SAVED_URL}/${saved.id}/recipients`);
  const form = useSubmit(async () => {
    const r = await api.put<{ nextRunOn: string }>(`${SAVED_URL}/${saved.id}/schedule`, {
      frequency: f.frequency,
      weekday: f.frequency === 'weekly' ? Number(f.weekday) : undefined,
      dayOfMonth: f.frequency === 'monthly' ? Number(f.dayOfMonth) : undefined,
      period: f.period,
      recipientIds: to,
      enabled: f.enabled,
    });
    toast(`Scheduled; next run ${fmtDate(r.nextRunOn)}`);
    await invalidateApi(SAVED_URL);
    onClose();
  });
  return (
    <Modal title={`Schedule — ${saved.name}`} onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="columns-form">
          <Select label="How often" value={f.frequency} options={entries(FREQUENCY)} error={form.errors['frequency']} onChange={(e) => setF({ ...f, frequency: e.target.value as Schedule['frequency'] })} />
          {f.frequency === 'weekly' && <Select label="On" value={f.weekday} options={WEEKDAY.map((d, i) => ({ value: String(i), label: d }))} onChange={(e) => setF({ ...f, weekday: e.target.value })} />}
          {f.frequency === 'monthly' && <Input label="On day" type="number" inputMode="numeric" required min={1} max={28} value={f.dayOfMonth} error={form.errors['dayOfMonth']} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} />}
          <Select label="Covering" value={f.period} options={entries(PERIOD)} error={form.errors['period']} onChange={(e) => setF({ ...f, period: e.target.value })} />
        </div>
        <fieldset className="table-toolbar__group">
          <legend>Also send to</legend>
          <QueryState query={people} compact loading={<SkeletonRows rows={2} />}>
            {(d) => (d.items.length
              ? <div className="stack-1">{d.items.map((p) => <Checkbox key={p.id} label={<>{p.name} <span className="text-2 report-email">{p.email}</span></>} checked={to.includes(p.id)} onChange={(e) => setTo(e.target.checked ? [...to, p.id] : to.filter((x) => x !== p.id))} />)}</div>
              : <p className="text-sm text-2">Only you: nobody else can see this report for the whole organization, or it is limited to your team.</p>)}
          </QueryState>
          <p className="text-xs text-3">They are told in the app, and by email, that it is ready. The report itself stays in the app.</p>
        </fieldset>
        <Checkbox label="Active" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" submitLabel="Save schedule" onCancel={onClose} extra={s0 && <Button variant="danger-ghost" onClick={() => setRemoving(true)}>Remove schedule</Button>} />
      </form>
      {removing && (
        <ConfirmDialog
          title="Remove schedule"
          danger
          confirmLabel="Remove"
          message={`“${saved.name}” stays saved, but stops running.`}
          onClose={() => setRemoving(false)}
          onConfirm={async () => { await api.del(`${SAVED_URL}/${saved.id}/schedule`); toast('Schedule removed'); await invalidateApi(SAVED_URL); onClose(); }}
        />
      )}
    </Modal>
  );
}

export function SaveReportButton({ def, params }: { def: ReportInfo; params: Record<string, string> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(def.name);
  const form = useSubmit(async () => {
    await api.post(SAVED_URL, { reportKey: def.key, name, params });
    toast('Saved. Find it, and schedule it, under All reports.');
    await invalidateApi(SAVED_URL);
    setOpen(false);
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Save report</Button>
      {open && (
        <Modal title="Save report" size="sm" onClose={() => setOpen(false)}>
          <form className="stack-3" onSubmit={form.submit}>
            <Input label="Name" hint="Saves the options you ran it with." required minLength={2} maxLength={100} value={name} error={form.errors['name']} onChange={(e) => setName(e.target.value)} />
            <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={() => setOpen(false)} />
          </form>
        </Modal>
      )}
    </>
  );
}
