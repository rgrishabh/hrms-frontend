import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { api, qs } from '../../api';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { FormActions } from '../../components/FormActions';
import { useDebouncedValue } from '../../components/hooks';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { localInputToIso } from '../../format';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { KINDS, options, RECOMMENDATION, type Interview } from './types';

type PanelUser = ApiItem<'/api/v1/recruitment/panel-users'>;

export function ScheduleInterview({ applicationId, nextRound, onClose }: { applicationId: string; nextRound: number; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ round: nextRound as number | string, kind: 'technical', at: '', durationMin: 45 as number | string, location: '' });
  const [panel, setPanel] = useState<PanelUser[]>([]);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const users = useApiQuery<ApiResponse<'/api/v1/recruitment/panel-users'>>(`/api/v1/recruitment/panel-users${qs({ search: debounced })}`, { placeholderData: (p) => p });
  const form = useSubmit(async () => {
    await api.post(`/api/v1/recruitment/applications/${applicationId}/interviews`, { round: Number(f.round), kind: f.kind, scheduledAt: localInputToIso(f.at), durationMin: Number(f.durationMin), location: f.location || null, panelUserIds: panel.map((p) => p.id) });
    toast('Interview scheduled; the panel was notified');
    await invalidateApi('/api/v1/recruitment');
    onClose();
  }, { validate: (): Record<string, string> => (panel.length ? {} : { panel: 'Add at least one person to the panel.' }) });
  return (
    <Modal title="Schedule interview" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Round" type="number" inputMode="numeric" min={1} max={20} required error={form.errors['round']} value={f.round} onChange={(e) => setF({ ...f, round: e.target.value })} />
          <Select label="Kind" value={f.kind} options={options(KINDS)} onChange={(e) => setF({ ...f, kind: e.target.value })} />
          <DatePicker mode="datetime" label="Date and time" required error={form.errors['scheduledAt']} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
          <Input label="Duration (minutes)" type="number" inputMode="numeric" min={10} max={480} required error={form.errors['durationMin']} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} />
        </div>
        <Input label="Room or meeting link" error={form.errors['location']} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <div className="stack-2">
          {panel.length > 0 && (
            <ul className="list-plain cluster" aria-label="Panel">
              {panel.map((p) => <li key={p.id}><Button size="sm" icon={<X aria-hidden="true" />} aria-label={`Remove ${p.display_name}`} onClick={() => setPanel(panel.filter((x) => x.id !== p.id))}>{p.display_name}</Button></li>)}
            </ul>
          )}
          <Input label="Panel" placeholder="Search people" error={form.errors['panel'] ?? form.errors['panelUserIds']} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
          <QueryState query={users} compact loading={<SkeletonRows rows={2} />}>
            {(d) => (
              <div className="recruit-panel-results" role="group" aria-label="People to add">
                {d.items.filter((u) => !panel.some((p) => p.id === u.id)).map((u) => <Button key={u.id} size="sm" onClick={() => setPanel([...panel, u])}>+ {u.display_name}{u.designation ? ` · ${u.designation}` : ''}</Button>)}
              </div>
            )}
          </QueryState>
        </div>
        <FormActions error={form.error} busy={form.busy} submitLabel="Schedule" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function FeedbackForm({ interview, onClose }: { interview: Interview; onClose: () => void }) {
  const toast = useToast();
  const ratingId = useId();
  const [f, setF] = useState({ rating: 0, recommendation: '', notes: '' });
  const form = useSubmit(async () => {
    await api.post(`/api/v1/recruitment/interviews/${interview.id}/feedback`, f);
    toast('Feedback submitted');
    await invalidateApi('/api/v1/recruitment');
    onClose();
  }, { validate: (): Record<string, string> => (f.rating ? {} : { rating: 'Choose a rating.' }) });
  return (
    <Modal title={`Feedback — round ${interview.round}`} onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="stack-1">
          <span id={ratingId} className="field__label">Rating</span>
          <div className="recruit-rating" role="group" aria-labelledby={ratingId}>
            {[1, 2, 3, 4, 5].map((n) => <Button key={n} size="sm" variant={f.rating === n ? 'primary' : 'secondary'} aria-label={`${n} of 5`} aria-pressed={f.rating === n} onClick={() => { setF({ ...f, rating: n }); form.clearError('rating'); }}>{n}</Button>)}
          </div>
          {form.errors['rating'] && <span role="alert" className="field__error">{form.errors['rating']}</span>}
        </div>
        <Select label="Recommendation" required placeholder="Select…" error={form.errors['recommendation']} value={f.recommendation} options={options(RECOMMENDATION)} onChange={(e) => setF({ ...f, recommendation: e.target.value })} />
        <Textarea label="Notes" hint="Evidence for your rating: what the candidate did well or not. Submitted once; colleagues see it after submitting theirs." required minLength={10} rows={6} error={form.errors['notes']} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Submit" onCancel={onClose} />
      </form>
    </Modal>
  );
}
