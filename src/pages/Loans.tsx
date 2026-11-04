import { HandCoins } from 'lucide-react';
import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { LoanList, MyLoans } from '../features/loans/LoanLists';
import { loanKinds, loansTitle } from '../features/loans/types';

type Tab = 'mine' | 'team' | 'all';

export function Loans() {
  const { canAny, can, me, hasFeature } = useAuth();
  const kinds = loanKinds(hasFeature);
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('loans.self')) tabs.push({ key: 'mine', label: 'Mine' });
  if (can('loans.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('loans.read', 'loans.approve', 'loans.manage')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['mine']);
  return (
    <div className="stack-4">
      <PageHeader title={loansTitle(kinds)} description="Approved by your manager and finance, and recovered in monthly instalments through payroll." />
      {!tabs.length && <EmptyState icon={<HandCoins />} title="You do not have access to this" />}
      {tabs.length > 1 && <Tabs label={loansTitle(kinds)} idBase="loans" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="loans" tab={tab}>
          {/* Keyed, so page and filters belong to one tab and a narrower list is never hidden behind a stale page. */}
          {tab === 'mine' ? <MyLoans /> : <LoanList key={tab} scope={tab} />}
        </TabPanel>
      )}
    </div>
  );
}
