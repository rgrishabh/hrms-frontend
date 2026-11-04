import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDateTime, fmtNumber } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { useOrg } from '../org/useOrg';

interface Geofence { branch_id: string; branch_name: string; latitude: string | number; longitude: string | number; radius_m: number; updated_at: string }
interface Row { branchId: string; branchName: string; fence: Geofence | null }

const URL = '/api/v1/attendance/geofences';
const reload = () => invalidateApi(URL);

/** Range checks the API also makes, so a typing slip shows at the field. Exported for tests. */
export function validateGeofence(latitude: string, longitude: string, radius: string): FieldErrors {
  const out: FieldErrors = {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  const r = Number(radius);
  if (latitude.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) out['latitude'] = 'Enter a latitude from -90 to 90';
  if (longitude.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) out['longitude'] = 'Enter a longitude from -180 to 180';
  if (radius.trim() === '' || !Number.isInteger(r) || r < 10 || r > 100000) out['radiusMeters'] = 'Enter whole metres from 10 to 100000';
  return out;
}

export function GeofencesAdmin({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const query = useApiQuery<{ items: Geofence[] }>(URL);
  const org = useOrg();
  const [edit, setEdit] = useState<Row | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const columns: Column<Row>[] = [
    { key: 'branch', header: 'Branch', card: 'title', cell: (r) => r.branchName },
    { key: 'state', header: 'Status', card: 'status', cell: (r) => (r.fence ? <Badge tone="ok">Set</Badge> : <Badge>Not set</Badge>) },
    { key: 'latitude', header: 'Latitude', align: 'right', cell: (r) => (r.fence ? <span className="tnum">{fmtNumber(r.fence.latitude, 6)}</span> : '—') },
    { key: 'longitude', header: 'Longitude', align: 'right', cell: (r) => (r.fence ? <span className="tnum">{fmtNumber(r.fence.longitude, 6)}</span> : '—') },
    { key: 'radius', header: 'Radius', align: 'right', cell: (r) => (r.fence ? `${fmtNumber(r.fence.radius_m)} m` : '—') },
    { key: 'updated', header: 'Updated', cell: (r) => (r.fence ? fmtDateTime(r.fence.updated_at) : '—') },
    ...(canEdit ? [{
      key: 'actions', header: 'Actions', card: 'actions' as const, cell: (r: Row) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => setEdit(r)}>{r.fence ? 'Edit' : 'Set area'}</Button>
          {r.fence && <Button size="sm" variant="danger-ghost" onClick={() => setRemove(r)}>Remove</Button>}
        </div>
      ),
    }] : []),
  ];
  return (
    <div className="stack-3">
      <p className="text-sm text-2">The area mobile clock-in is checked against, per branch. Location is read only at the moment of clocking in. Whether it is asked for, and whether clocking in outside is refused or only flagged, are in Settings under Attendance.</p>
      <QueryState query={query} isEmpty={(d) => !d.items.length && !org.data?.branches.length} empty={<EmptyState icon={<MapPin />} title="No geofences yet" description="Add a branch first, then set its area here." />}>
        {(d) => {
          const fences = new Map(d.items.map((g) => [g.branch_id, g]));
          // Branches without an area are listed too, so setting one is a press away. Without org access, only what exists.
          const rows: Row[] = org.data?.branches.length
            ? org.data.branches.map((b) => ({ branchId: b.id, branchName: b.name, fence: fences.get(b.id) ?? null }))
            : d.items.map((g) => ({ branchId: g.branch_id, branchName: g.branch_name, fence: g }));
          return <Table label="Geofences" columns={columns} rows={rows} rowKey={(r) => r.branchId} />;
        }}
      </QueryState>
      {edit && <GeofenceForm row={edit} onClose={() => setEdit(null)} />}
      {remove?.fence && (
        <ConfirmDialog
          title="Remove geofence"
          danger
          confirmLabel="Remove"
          message={`Remove the area for ${remove.branchName}? Clock-ins at this branch will no longer be checked against a location.`}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            const g = remove.fence!;
            await api.del(`${URL}/${remove.branchId}`);
            toast('Geofence removed', 'ok', { label: 'Undo', onClick: () => { void api.put(`${URL}/${g.branch_id}`, { latitude: Number(g.latitude), longitude: Number(g.longitude), radiusMeters: g.radius_m }).then(reload).then(() => toast('Geofence restored')).catch((x: unknown) => toast(errorMessage(x), 'error')); } });
            await reload();
          }}
        />
      )}
    </div>
  );
}

function GeofenceForm({ row, onClose }: { row: Row; onClose: () => void }) {
  const toast = useToast();
  const [latitude, setLatitude] = useState(row.fence ? String(row.fence.latitude) : '');
  const [longitude, setLongitude] = useState(row.fence ? String(row.fence.longitude) : '');
  const [radius, setRadius] = useState(row.fence ? String(row.fence.radius_m) : '200');
  const s = useSubmit(async () => {
    await api.put(`${URL}/${row.branchId}`, { latitude: Number(latitude), longitude: Number(longitude), radiusMeters: Number(radius) });
    toast('Geofence saved');
    await reload();
    onClose();
  }, { validate: () => validateGeofence(latitude, longitude, radius) });
  return (
    <Modal title={`Geofence for ${row.branchName}`} onClose={onClose}>
      <form className="stack-3" noValidate onSubmit={s.submit}>
        <div className="columns-form">
          <Input label="Latitude" hint="-90 to 90, in decimal degrees" inputMode="decimal" required error={s.errors['latitude']} value={latitude} onChange={(e) => { setLatitude(e.target.value); s.clearError('latitude'); }} />
          <Input label="Longitude" hint="-180 to 180, in decimal degrees" inputMode="decimal" required error={s.errors['longitude']} value={longitude} onChange={(e) => { setLongitude(e.target.value); s.clearError('longitude'); }} />
          <Input label="Radius (metres)" hint="10 to 100000" inputMode="numeric" required error={s.errors['radiusMeters']} value={radius} onChange={(e) => { setRadius(e.target.value); s.clearError('radiusMeters'); }} />
        </div>
        <FormActions error={s.error} busy={s.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
