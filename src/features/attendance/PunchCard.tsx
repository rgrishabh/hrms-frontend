import { useRef, useState } from 'react';
import { ApiError, errorMessage, api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { EXCEPTION_LABEL, fmtClock, fmtDate, fmtMinutes, fmtTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { SelfieCapture } from './SelfieCapture';
import type { AttendanceEvent, DailyResult } from './types';
import './PunchCard.css';

interface Today {
  linked: boolean; today: string; timezone: string; nextDirection: 'in' | 'out'; locationMode: 'off' | 'optional' | 'required';
  channels: { web: boolean; mobile: boolean }; selfieRequired?: boolean; events: Pick<AttendanceEvent, 'direction' | 'event_time'>[]; daily: Pick<DailyResult, 'status' | 'exceptions' | 'worked_minutes'> | null;
}
interface PunchBody { channel: 'web' | 'mobile'; idempotencyKey: string; direction: 'in' | 'out'; latitude?: number; longitude?: number; selfieId?: string }

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

/** Location is requested only at punch time, never tracked. */
function locate(): Promise<{ position: GeolocationPosition } | { failure: string }> {
  if (!('geolocation' in navigator)) return Promise.resolve({ failure: 'This device cannot share its location, which your organization requires to clock in. Ask HR to correct your attendance.' });
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ position }),
    (e) => resolve({ failure: e.code === e.PERMISSION_DENIED
      ? 'Location is blocked for this site. Allow it in your browser\'s site settings, then try again.'
      : 'Your location could not be found. Move somewhere with a better signal, then try again.' }),
    { timeout: 8000, enableHighAccuracy: true },
  ));
}

function Punch({ data }: { data: Today }) {
  const toast = useToast();
  const { hasFeature } = useAuth();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfieError, setSelfieError] = useState<unknown>(null);
  // A photo already uploaded is reused on retry: nothing has used it until a clock-in succeeds.
  const selfieId = useRef<string | null>(null);
  const channel: 'web' | 'mobile' | null = isMobileDevice() && data.channels.mobile ? 'mobile' : data.channels.web ? 'web' : data.channels.mobile ? 'mobile' : null;
  const usesLocation = hasFeature('FEATURE_ATTENDANCE_GEOFENCE') && channel === 'mobile' && data.locationMode !== 'off';
  const needsSelfie = hasFeature('FEATURE_ATTENDANCE_SELFIE') && data.selfieRequired === true && data.nextDirection === 'in';
  const d = data.daily;

  /** Throws when the caller should keep its dialog open. */
  const send = async (photo?: Blob) => {
    if (!channel) return;
    setBusy(true);
    setBlocked(null);
    try {
      const body: PunchBody = { channel, idempotencyKey: crypto.randomUUID(), direction: data.nextDirection };
      if (usesLocation) {
        const at = await locate();
        if ('position' in at) { body.latitude = at.position.coords.latitude; body.longitude = at.position.coords.longitude; }
        else if (data.locationMode === 'required') { setBlocked(at.failure); return; }
      }
      if (photo && !selfieId.current) {
        const form = new FormData();
        form.append('file', photo, 'selfie.jpg');
        selfieId.current = (await api.upload<{ id: string }>('/api/v1/attendance/selfies', form)).id;
      }
      if (selfieId.current) body.selfieId = selfieId.current;
      const r = await api.post<{ duplicate?: boolean; direction: string; eventTime: string; outsideGeofence?: boolean }>('/api/v1/attendance/punch', body);
      selfieId.current = null;
      setSelfieOpen(false);
      if (r.duplicate) toast('Already recorded');
      else if (r.outsideGeofence) toast(`Clocked ${r.direction} at ${fmtTime(r.eventTime)}. You were outside your branch's area, so HR will see this flagged.`);
      else toast(`Clocked ${r.direction} at ${fmtTime(r.eventTime)}`);
      await invalidateApi('/api/v1/attendance/me');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'outside_geofence') { setSelfieOpen(false); setBlocked('You are outside the area allowed for clock-in at your branch. Move closer and try again, or ask for an attendance correction.'); }
      else if (code === 'selfie_required' && !photo) { setSelfieError(null); setSelfieOpen(true); }
      else if (selfieOpen) setSelfieError(e);
      else toast(errorMessage(e), 'error');
    } finally { setBusy(false); }
  };
  const press = () => {
    if (needsSelfie && !selfieId.current) { setSelfieError(null); setSelfieOpen(true); return; }
    void send();
  };
  const label = data.nextDirection === 'in' ? 'Clock in' : 'Clock out';
  const punches = data.events.map((e) => `${e.direction === 'in' ? 'In' : e.direction === 'out' ? 'Out' : '•'} ${fmtTime(e.event_time)}`).join(' · ');
  return (
    <Card title={`Today, ${fmtDate(data.today)}`} actions={d && <StatusBadge status={d.status} />}>
      <div className="punch">
        <div className="punch__time tnum">{fmtClock(data.timezone)}</div>
        <p className="text-2">{punches ? `Punches: ${punches}` : 'No punches yet today'}</p>
        {d && d.exceptions.length > 0 && <div className="cluster">{d.exceptions.map((x) => <Badge key={x} tone="warn">{EXCEPTION_LABEL[x] ?? x}</Badge>)}</div>}
        {blocked && <Alert tone="warn" live>{blocked}</Alert>}
        {channel
          ? <Button variant="primary" size="lg" loading={busy && !selfieOpen} loadingText="Recording…" onClick={press}>{blocked ? 'Try again' : label}</Button>
          : <Alert>Web and mobile attendance are not enabled for your organization. Use the biometric device.</Alert>}
        {usesLocation && <p className="text-xs text-3">Your location is {data.locationMode === 'required' ? 'required' : 'requested'} only when you clock in or out.</p>}
        {needsSelfie && <p className="text-xs text-3">A photo is needed to clock in.</p>}
        {d && <p className="text-xs text-3">Worked so far: {fmtMinutes(d.worked_minutes)}</p>}
      </div>
      {selfieOpen && <SelfieCapture confirmLabel="Use photo and clock in" busy={busy} error={selfieError} onConfirm={(photo) => void send(photo)} onClose={() => { selfieId.current = null; setSelfieOpen(false); }} />}
    </Card>
  );
}
