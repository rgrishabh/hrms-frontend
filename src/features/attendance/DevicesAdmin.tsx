import { useState } from 'react';
import { Fingerprint, Link2, ListChecks } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDateTime } from '../../format';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { orgOptions, useOrg } from '../org/useOrg';
import './Roster.css';

type Device = ApiItem<'/api/v1/attendance/devices'>;
type Unmapped = ApiItem<'/api/v1/attendance/device-events/unmapped'>;
type Mapping = ApiItem<'/api/v1/attendance/device-mappings'>;

const reload = () => invalidateApi('/api/v1/attendance/device');

export function DevicesAdmin() {
  const toast = useToast();
  const devices = useApiQuery<ApiResponse<'/api/v1/attendance/devices'>>('/api/v1/attendance/devices');
  const unmapped = useApiQuery<ApiResponse<'/api/v1/attendance/device-events/unmapped'>>('/api/v1/attendance/device-events/unmapped');
  const mappings = useApiQuery<ApiResponse<'/api/v1/attendance/device-mappings'>>('/api/v1/attendance/device-mappings');
  const [rotating, setRotating] = useState<Device | null>(null);
  const [toggling, setToggling] = useState<Device | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [mapUser, setMapUser] = useState<string | null>(null);
  const deviceColumns: Column<Device>[] = [
    { key: 'device', header: 'Device', card: 'title', cell: (d) => <>{d.name}<div className="table__cell-sub mono">{d.serial_number} · {d.api_key_prefix}</div></> },
    { key: 'branch', header: 'Branch', cell: (d) => d.branch_name },
    { key: 'status', header: 'Status', card: 'status', cell: (d) => <StatusBadge status={d.status} /> },
    { key: 'sync', header: 'Last sync', cell: (d) => (d.last_sync_at ? fmtDateTime(d.last_sync_at) : 'Never') },
    { key: 'drift', header: 'Clock drift', cell: (d) => <div className="cell-wrap">{d.last_clock_drift_seconds != null ? `${d.last_clock_drift_seconds}s` : '—'}{d.last_error && <div className="table__cell-sub">{d.last_error}</div>}</div> },
    { key: 'unmapped', header: 'Unmapped', align: 'right', cell: (d) => (d.unmapped_events ? <Badge tone="warn">{d.unmapped_events}</Badge> : '—') },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (d) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => setRotating(d)}>Rotate key</Button>
          <Button size="sm" onClick={() => setToggling(d)}>{d.status === 'active' ? 'Disable' : 'Activate'}</Button>
        </div>
      ),
    },
  ];
  const unmappedColumns: Column<Unmapped>[] = [
    { key: 'user', header: 'Device user ID', card: 'title', cell: (e) => <span className="mono">{e.device_user_id ?? '—'}</span> },
    { key: 'time', header: 'Time', cell: (e) => fmtDateTime(e.event_time) },
    { key: 'device', header: 'Device', cell: (e) => e.device_name },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (e) => <div className="table__actions"><Button size="sm" onClick={() => setMapUser(e.device_user_id ?? '')}>Map to employee</Button></div> },
  ];
  const mappingColumns: Column<Mapping>[] = [
    { key: 'user', header: 'Device user ID', card: 'title', cell: (m) => <span className="mono">{m.device_user_id}</span> },
    { key: 'employee', header: 'Employee', cell: (m) => <>{m.name} <span className="mono text-sm text-2">{m.employee_code}</span></> },
  ];
  return (
    <div className="stack-6">
      <div className="stack-3">
        <div className="cluster-between"><span /><Button variant="primary" onClick={() => setRegistering(true)}>Register device</Button></div>
        <QueryState query={devices} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Fingerprint />} title="No devices registered" />}>
          {(d) => <Table label="Biometric devices" columns={deviceColumns} rows={d.items} rowKey={(x) => x.id} />}
        </QueryState>
      </div>
      <Card title="Unmapped device events">
        <div className="stack-3">
          <p className="text-sm text-2">Punches from device enrolment IDs that are not linked to an employee. Map the ID and these events are processed automatically.</p>
          <QueryState query={unmapped} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<ListChecks />} title="Queue is empty." />}>
            {(d) => <Table label="Unmapped device events" columns={unmappedColumns} rows={d.items} rowKey={(x) => x.id} />}
          </QueryState>
        </div>
      </Card>
      <Card title="Enrolment ID mappings" actions={<Button size="sm" onClick={() => setMapUser('')}>Add mapping</Button>}>
        <QueryState query={mappings} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<Link2 />} title="No mappings yet." />}>
          {(d) => <Table label="Enrolment ID mappings" columns={mappingColumns} rows={d.items} rowKey={(x) => x.device_user_id} />}
        </QueryState>
      </Card>
      {registering && <RegisterDevice onClose={() => setRegistering(false)} onKey={setNewKey} />}
      {rotating && (
        <ConfirmDialog
          title="Rotate device key"
          confirmLabel="Rotate key"
          danger
          message={`The current key for ${rotating.name} stops working immediately. The device cannot sync until it is given the new key.`}
          onClose={() => setRotating(null)}
          onConfirm={async () => { const r = await api.post<ApiResponse<'/api/v1/attendance/devices/{id}/rotate-key', 'post'>>(`/api/v1/attendance/devices/${rotating.id}/rotate-key`); setNewKey(r.apiKey); await reload(); }}
        />
      )}
      {toggling && (
        <ConfirmDialog
          title={toggling.status === 'active' ? 'Disable device' : 'Enable device'}
          confirmLabel={toggling.status === 'active' ? 'Disable' : 'Enable'}
          danger={toggling.status === 'active'}
          message={toggling.status === 'active' ? `${toggling.name} will stop sending attendance until it is enabled again.` : `${toggling.name} can send attendance again.`}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            const disabling = toggling.status === 'active';
            await api.patch(`/api/v1/attendance/devices/${toggling.id}`, { status: disabling ? 'disabled' : 'active' });
            toast(disabling ? 'Device disabled' : 'Device enabled');
            await reload();
          }}
        />
      )}
      {newKey && (
        <Modal title="Device API key" persistent onClose={() => setNewKey(null)}>
          <div className="stack-3">
            <Alert tone="warn">Copy this key into the device or bridge configuration now. It will not be shown again.</Alert>
            <div className="key-box">{newKey}</div>
            <div className="cluster-between">
              <span />
              <div className="cluster">
                <Button onClick={() => { navigator.clipboard.writeText(newKey).then(() => toast('Copied'), (x: unknown) => toast(errorMessage(x), 'error')); }}>Copy</Button>
                <Button variant="primary" onClick={() => setNewKey(null)}>Done</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {mapUser !== null && <MapDialog initial={mapUser} onClose={() => setMapUser(null)} />}
    </div>
  );
}

function RegisterDevice({ onClose, onKey }: { onClose: () => void; onKey: (key: string) => void }) {
  const org = useOrg();
  const [f, setF] = useState({ branchId: '', serialNumber: '', name: '', adapterKey: 'generic_push_v1' });
  const s = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/attendance/devices', 'post'>>('/api/v1/attendance/devices', f);
    onKey(r.apiKey);
    await reload();
    onClose();
  });
  return (
    <Modal title="Register biometric device" onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        <Select label="Branch" required placeholder="Select…" error={s.errors['branchId']} value={f.branchId} options={orgOptions(org.data?.branches)} onChange={(e) => setF({ ...f, branchId: e.target.value })} />
        <Input label="Serial number" required error={s.errors['serialNumber']} value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} />
        <Input label="Name" hint="For example, main gate" required error={s.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Select label="Integration adapter" hint="The push contract is in the biometric integration guide" value={f.adapterKey} options={[{ value: 'generic_push_v1', label: 'Generic push (v1)' }]} onChange={(e) => setF({ ...f, adapterKey: e.target.value })} />
        <FormActions error={s.error} busy={s.busy} submitLabel="Register" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function MapDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const toast = useToast();
  const [deviceUserId, setDeviceUserId] = useState(initial);
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const s = useSubmit(async () => {
    const r = await api.put<ApiResponse<'/api/v1/attendance/device-mappings/{deviceUserId}', 'put'>>(`/api/v1/attendance/device-mappings/${encodeURIComponent(deviceUserId)}`, { employeeId: employee!.id });
    toast(`Mapped. ${r.reprocessedEvents} queued event(s) processed.`);
    await reload();
    onClose();
  }, { validate: (): FieldErrors => (employee ? {} : { employee: 'Choose an employee' }) });
  return (
    <Modal title="Map device enrolment ID" onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        <Input label="Device user ID" required value={deviceUserId} onChange={(e) => setDeviceUserId(e.target.value)} />
        <EmployeeField required status="active" error={s.errors['employee']} value={employee} onChange={(e) => { setEmployee(e); s.clearError('employee'); }} />
        <FormActions error={s.error} busy={s.busy} submitLabel="Save mapping" onCancel={onClose} />
      </form>
    </Modal>
  );
}
