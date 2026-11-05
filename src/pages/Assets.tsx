import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { AssetRegister } from '../features/assets/AssetRegister';
import { MyAssets } from '../features/assets/MyAssets';
import { useAssetTerms } from '../features/assets/terms';

type Tab = 'mine' | 'register';

export function Assets() {
  const { can, me } = useAuth();
  const terms = useAssetTerms();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('assets.self')) tabs.push({ key: 'mine', label: 'My assets' });
  if (can('assets.manage')) tabs.push({ key: 'register', label: 'Asset register' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  return (
    <div className="stack-4">
      <PageHeader title="Assets" description={terms.description} />
      {!tabs.length && <EmptyState title="You do not have access to assets" />}
      {tabs.length > 1 && <Tabs label="Assets" idBase="assets" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && <TabPanel idBase="assets" tab={tab}>{tab === 'mine' ? <MyAssets /> : <AssetRegister />}</TabPanel>}
    </div>
  );
}
