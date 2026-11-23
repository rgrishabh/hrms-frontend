import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { DevicesAdmin } from '../features/attendance/DevicesAdmin';
import { GeofencesAdmin } from '../features/attendance/GeofencesAdmin';
import { HolidaysAdmin } from '../features/attendance/HolidaysAdmin';
import { LocksAdmin } from '../features/attendance/LocksAdmin';
import { RosterSetup } from '../features/attendance/Roster';
import { ShiftsAdmin } from '../features/attendance/ShiftsAdmin';

type Tab = 'shifts' | 'rosters' | 'holidays' | 'devices' | 'geofences' | 'locks';

export function AttendanceAdmin() {
  const { can, canAny, hasFeature } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (can('attendance.configure') && hasFeature('FEATURE_SHIFTS')) tabs.push({ key: 'shifts', label: 'Shifts' }, { key: 'rosters', label: 'Rosters' });
  if (can('attendance.configure') && hasFeature('FEATURE_HOLIDAYS')) tabs.push({ key: 'holidays', label: 'Holidays' });
  if (can('attendance.devices.manage') && hasFeature('FEATURE_ATTENDANCE_BIOMETRIC')) tabs.push({ key: 'devices', label: 'Biometric devices' });
  if (canAny('attendance.configure', 'attendance.read') && hasFeature('FEATURE_ATTENDANCE_GEOFENCE')) tabs.push({ key: 'geofences', label: 'Geofences' });
  if (canAny('attendance.lock', 'attendance.read')) tabs.push({ key: 'locks', label: 'Payroll locks' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['shifts']);
  return (
    <div className="stack-4">
      <PageHeader title="Attendance setup" description="Shift policies, rotating rosters, holiday calendars, devices and payroll period locks." />
      {!tabs.length
        ? <EmptyState title="Nothing to set up" description="There is nothing here with your permissions and the features that are on." />
        : (
          <>
            <Tabs label="Attendance setup" idBase="attendance-setup" tabs={tabs} value={tab} onChange={setTab} />
            <TabPanel idBase="attendance-setup" tab={tab}>
              {tab === 'shifts' && <ShiftsAdmin />}
              {tab === 'rosters' && <RosterSetup />}
              {tab === 'holidays' && <HolidaysAdmin />}
              {tab === 'devices' && <DevicesAdmin />}
              {tab === 'geofences' && <GeofencesAdmin canEdit={can('attendance.configure')} />}
              {tab === 'locks' && <LocksAdmin canLock={can('attendance.lock')} />}
            </TabPanel>
          </>
        )}
    </div>
  );
}
