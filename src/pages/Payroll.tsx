import { Banknote } from 'lucide-react';
import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { Components } from '../features/payroll/Components';
import { Runs } from '../features/payroll/Runs';
import { Salaries } from '../features/payroll/Salaries';
import { StatutoryRules } from '../features/payroll/StatutoryRules';
import '../features/payroll/Payroll.css';

type Tab = 'runs' | 'salaries' | 'components' | 'statutory';

export function Payroll() {
  const { canAny, hasFeature } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (canAny('payroll.read', 'payroll.manage', 'payroll.approve')) tabs.push({ key: 'runs', label: 'Payroll runs' });
  if (canAny('payroll.read', 'payroll.manage')) tabs.push({ key: 'salaries', label: 'Salaries' }, { key: 'components', label: 'Components' });
  if (hasFeature('FEATURE_PAYROLL_STATUTORY') && canAny('payroll.statutory', 'payroll.read')) tabs.push({ key: 'statutory', label: 'Statutory rules' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['runs']);
  return (
    <div className="stack-4">
      <PageHeader title="Payroll" description="Runs are computed from attendance, approved by a second person and locked when finalized. Statutory values come only from rules you enter and verify." />
      {!tabs.length && <EmptyState icon={<Banknote />} title="You do not have access to payroll" />}
      {tabs.length > 1 && <Tabs label="Payroll" idBase="payroll" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="payroll" tab={tab}>
          {tab === 'runs' && <Runs />}
          {tab === 'salaries' && <Salaries />}
          {tab === 'components' && <Components />}
          {tab === 'statutory' && <StatutoryRules />}
        </TabPanel>
      )}
    </div>
  );
}
