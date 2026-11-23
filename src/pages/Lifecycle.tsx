import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { MyTasks } from '../features/lifecycle/MyTasks';
import { Onboarding } from '../features/lifecycle/Onboarding';
import { Probation } from '../features/lifecycle/Probation';
import { Separations } from '../features/lifecycle/Separations';
import { Templates } from '../features/lifecycle/Templates';
import '../features/lifecycle/Lifecycle.css';

type Tab = 'tasks' | 'onboarding' | 'probation' | 'separations' | 'templates';

export function Lifecycle() {
  const { can, canAny, hasFeature, me } = useAuth();
  const hr = canAny('lifecycle.manage', 'lifecycle.read');
  const tabs: TabItem<Tab>[] = [{ key: 'tasks', label: 'My tasks' }];
  if (hasFeature('FEATURE_ONBOARDING') && hr) tabs.push({ key: 'onboarding', label: 'Onboarding' });
  if (hasFeature('FEATURE_ONBOARDING')) tabs.push({ key: 'probation', label: 'Probation' });
  if (hasFeature('FEATURE_OFFBOARDING') && (hr || me?.user.employeeId)) tabs.push({ key: 'separations', label: 'Separations' });
  if (can('lifecycle.manage')) tabs.push({ key: 'templates', label: 'Checklist templates' });
  const [tab, setTab] = useTabParam(tabs.map((t) => t.key));
  return (
    <div className="stack-4">
      <PageHeader title="Onboarding & exit" description="Joining checklists, probation reviews, resignations and exit clearance." />
      {tabs.length > 1 && <Tabs label="Onboarding and exit" idBase="lifecycle" tabs={tabs} value={tab} onChange={setTab} />}
      <TabPanel idBase="lifecycle" tab={tab}>
        {tab === 'tasks' && <MyTasks />}
        {tab === 'onboarding' && <Onboarding />}
        {tab === 'probation' && <Probation />}
        {tab === 'separations' && <Separations />}
        {tab === 'templates' && <Templates />}
      </TabPanel>
    </div>
  );
}
