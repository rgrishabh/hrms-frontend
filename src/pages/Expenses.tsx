import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { AllowanceRates } from '../features/expenses/AllowanceRates';
import { Categories } from '../features/expenses/Categories';
import { ClaimList } from '../features/expenses/ClaimList';
import { Finance } from '../features/expenses/Finance';

type Tab = 'mine' | 'team' | 'finance' | 'categories' | 'rates';

export function Expenses() {
  const { can, canAny, me } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('expenses.self')) tabs.push({ key: 'mine', label: 'My claims' });
  if (can('expenses.team.read')) tabs.push({ key: 'team', label: 'Team claims' });
  if (canAny('expenses.pay', 'expenses.read')) tabs.push({ key: 'finance', label: 'Finance' });
  if (can('expenses.manage')) tabs.push({ key: 'categories', label: 'Categories' }, { key: 'rates', label: 'Allowance rates' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  return (
    <div className="stack-4">
      <PageHeader title="Expenses" description="Claims are approved by your manager and then by finance. Receipts are stored securely with the claim." />
      {!tabs.length && <EmptyState title="You do not have access to expenses" />}
      {tabs.length > 1 && <Tabs label="Expenses" idBase="expenses" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="expenses" tab={tab}>
          {/* Keyed so page, filters and open records never carry over to another tab. */}
          {(tab === 'mine' || tab === 'team') && <ClaimList key={tab} scope={tab} />}
          {tab === 'finance' && <Finance />}
          {tab === 'categories' && <Categories />}
          {tab === 'rates' && <AllowanceRates />}
        </TabPanel>
      )}
    </div>
  );
}
