import { useState } from 'react';
import { Clock } from 'lucide-react';
import { api, errorMessage, isNotConfigured, ApiError } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';

const JOBS_URL = '/api/v1/tenant/jobs';

interface Run { id: string; period_key: string; trigger: string; status: string; attempts: number; started_at: string | null; result: Record<string, unknown> | null; error: string | null; triggered_by_name: string | null }
interface JobSchedule { kind: 'daily' | 'monthly'; at: string; day?: number }
interface Job { key: string; name: string; description: string; schedule: JobSchedule; active: boolean; nextRun: string; canRun: boolean; recentRuns: Run[] }
interface JobsData { timezone: string; maxAttempts: number; items: Job[] }

const scheduleText = (s: JobSchedule) => (s.kind === 'daily' ? `Daily at ${s.at}` : `Monthly on day ${s.day} at ${s.at}`);
const inProgress = (d: JobsData | undefined) => !!d?.items.some((j) => j.recentRuns.some((r) => r.status === 'queued' || r.status === 'running'));
const resultText = (r: Run) => Object.entries(r.result ?? {}).filter(([k]) => k !== 'durationMs').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');

const runColumns: Column<Run>[] = [
  { key: 'started', header: 'Started', card: 'title', cell: (r) => <span className="nowrap">{fmtDateTime(r.started_at)}</span> },
  { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
  { key: 'period', header: 'Period', cell: (r) => <span className="mono">{r.period_key.startsWith('manual:') ? '—' : r.period_key}</span> },
  { key: 'trigger', header: 'Trigger', cell: (r) => (r.trigger === 'manual' ? `Manual${r.triggered_by_name ? ` (${r.triggered_by_name})` : ''}` : 'Schedule') },
  { key: 'attempts', header: 'Attempts', align: 'right', cell: (r) => r.attempts },
  { key: 'result', header: 'Result', cell: (r) => (r.error ? <span className="job-error mono">{r.error}</span> : <span className="mono text-xs">{resultText(r) || '—'}</span>) },
];

function notConfiguredText(name: string, e: unknown): string {
  const reason = e instanceof ApiError ? e.problem['reason'] : undefined;
  return typeof reason === 'string' ? `${name} is not set up yet: ${reason}` : errorMessage(e);
}

export function Jobs() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // A manual run only joins a queue, so keep watching until the worker has finished it.
  const query = useApiQuery<JobsData>(JOBS_URL, { refetchInterval: (q) => (inProgress(q.state.data) ? 5000 : false) });
  const run = async (j: Job) => {
    setBusy(j.key);
    try {
      await api.post<{ runId: string; status: string }>(`${JOBS_URL}/${j.key}/run`);
      toast(`${j.name} queued. It starts on the next worker pass.`);
      await invalidateApi(JOBS_URL);
    } catch (e) {
      toast(isNotConfigured(e) ? notConfiguredText(j.name, e) : errorMessage(e), 'error');
    } finally { setBusy(null); }
  };
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Clock />} title="No scheduled jobs." />}>
      {(d) => (
        <div className="stack-3">
          <Alert>Jobs run automatically in the background ({d.timezone}). Each run happens once per period, however many app instances are running. Failures retry up to {d.maxAttempts} times, and everything they do is safe to repeat.</Alert>
          {d.items.map((j) => {
            const last = j.recentRuns[0];
            return (
              <Card key={j.key} title={j.name} data-record actions={j.canRun && j.active && <Button size="sm" loading={busy === j.key} loadingText="Queuing…" onClick={() => void run(j)}>Run now</Button>}>
                <div className="stack-2">
                  <p className="text-sm text-2">{j.description}</p>
                  <div className="cluster">
                    {j.active ? <Badge tone="info">{scheduleText(j.schedule)} · next {j.nextRun}</Badge> : <Badge>Inactive: not switched on or not set up</Badge>}
                    {last && <StatusBadge status={last.status} />}
                  </div>
                  {j.recentRuns.length > 0 && (
                    <details className="job-runs">
                      <summary>Recent runs ({j.recentRuns.length})</summary>
                      <Table label={`Recent runs of ${j.name}`} columns={runColumns} rows={j.recentRuns} rowKey={(r) => r.id} />
                    </details>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}
