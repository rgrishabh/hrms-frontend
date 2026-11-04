import { useState } from 'react';
import { errorMessage, api } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { EXCEPTION_LABEL, fmtClock, fmtDate, fmtMinutes, fmtTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { AttendanceEvent, DailyResult } from './types';
import './PunchCard.css';

interface Today {
  linked: boolean; today: string; timezone: string; nextDirection: 'in' | 'out'; locationMode: 'off' | 'optional' | 'required';
  channels: { web: boolean; mobile: boolean }; events: Pick<AttendanceEvent, 'direction' | 'event_time'>[]; daily: Pick<DailyResult, 'status' | 'exceptions' | 'worked_minutes'> | null;
}
interface PunchBody { channel: 'web' | 'mobile'; idempotencyKey: string; direction: 'in' | 'out'; latitude?: number; longitude?: number }

/** A touch-first device, not a narrow window, counts as mobile: resizing a desktop browser must not change the channel. */
const isMobileDevice = () => window.matchMedia('(pointer: coarse)').matches;

/** Clock-in card. The server decides the time; an idempotency key makes double clicks and retries safe. */
export function PunchCard() {
  const query = useApiQuery<Today>('/api/v1/attendance/me/today');
  return (
    <QueryState query={query} compact loading={<Card title="Today" headingLevel={2}><SkeletonRows rows={3} /></Card>}>
      {(d) => (d.linked ? <Punch data={d} /> : <Card title="Today"><p className="text-2">Your account is not linked to an employee record, so attendance is not available.</p></Card>)}
    </QueryState>
  );
}

function Punch({ data }: { data: Today }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const channel: 'web' | 'mobile' | null = isMobileDevice() && data.channels.mobile ? 'mobile' : data.channels.web ? 'web' : data.channels.mobile ? 'mobile' : null;
  const usesLocation = channel === 'mobile' && data.locationMode !== 'off';
  const d = data.daily;
  const punch = async () => {
    if (!channel) return;
    setBusy(true);
    try {
      const body: PunchBody = { channel, idempotencyKey: crypto.randomUUID(), direction: data.nextDirection };
      if (usesLocation && 'geolocation' in navigator) {
        // Location is requested only at punch time, never tracked.
        const pos = await new Promise<GeolocationPosition | null>((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000 }));
        if (pos) { body.latitude = pos.coords.latitude; body.longitude = pos.coords.longitude; }
      }
      const r = await api.post<{ duplicate?: boolean; direction: string; eventTime: string }>('/api/v1/attendance/punch', body);
      toast(r.duplicate ? 'Already recorded' : `Clocked ${r.direction} at ${fmtTime(r.eventTime)}`);
      await invalidateApi('/api/v1/attendance/me');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };
  const punches = data.events.map((e) => `${e.direction === 'in' ? 'In' : e.direction === 'out' ? 'Out' : '•'} ${fmtTime(e.event_time)}`).join(' · ');
  return (
    <Card title={`Today, ${fmtDate(data.today)}`} actions={d && <StatusBadge status={d.status} />}>
      <div className="punch">
        <div className="punch__time tnum">{fmtClock(data.timezone)}</div>
        <p className="text-2">{punches ? `Punches: ${punches}` : 'No punches yet today'}</p>
        {d && d.exceptions.length > 0 && <div className="cluster">{d.exceptions.map((x) => <Badge key={x} tone="warn">{EXCEPTION_LABEL[x] ?? x}</Badge>)}</div>}
        {channel
          ? <Button variant="primary" size="lg" loading={busy} loadingText="Recording…" onClick={punch}>{data.nextDirection === 'in' ? 'Clock in' : 'Clock out'}</Button>
          : <Alert>Web and mobile attendance are not enabled for your organization. Use the biometric device.</Alert>}
        {usesLocation && <p className="text-xs text-3">Your location is {data.locationMode === 'required' ? 'required' : 'requested'} only when you clock in or out.</p>}
        {d && <p className="text-xs text-3">Worked so far: {fmtMinutes(d.worked_minutes)}</p>}
      </div>
    </Card>
  );
}
