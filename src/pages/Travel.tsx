import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { AllTrips } from '../features/travel/AllTrips';
import { MyTrips } from '../features/travel/MyTrips';

type Tab = 'mine' | 'team' | 'all';

export function Travel() {
  const { canAny, can, me } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('travel.self')) tabs.push({ key: 'mine', label: 'My trips' });
  if (can('travel.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('travel.read', 'travel.approve', 'expenses.pay')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  return (
    <div className="stack-4">
      <PageHeader title="Travel" description="Trips with an estimate and an optional advance, approved by your manager, and by finance for advances and trips abroad. Claim the expenses from the trip; the advance is set off against the claim." />
      {!tabs.length && <EmptyState title="You do not have access to travel" />}
      {tabs.length > 1 && <Tabs label="Travel" idBase="travel" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="travel" tab={tab}>
          {/* Keyed so a page or filter from one tab never applies to another. */}
          {tab === 'mine' ? <MyTrips /> : <AllTrips key={tab} scope={tab} />}
        </TabPanel>
      )}
    </div>
  );
}
