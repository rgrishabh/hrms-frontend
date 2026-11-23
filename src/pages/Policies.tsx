import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { ManagePolicies } from '../features/policies/ManagePolicies';
import { MyPolicies } from '../features/policies/MyPolicies';
import { PolicyViewer } from '../features/policies/PolicyViewer';

type Tab = 'mine' | 'manage';

export function Policies() {
  const { can, canAny, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('policies.self')) tabs.push({ key: 'mine', label: 'My policies' });
  if (can('policies.read')) tabs.push({ key: 'manage', label: 'Manage policies' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  const viewing = params.get('version');
  // The list and every record behind it need policies.read, even for someone who may change or publish.
  const cannotList = canAny('policies.manage', 'policies.publish') && !can('policies.read');
  const open = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('version', id); return n; });
  const close = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('version'); return n; });
  const explanation = 'Managing or publishing policies also needs permission to view them. Ask your administrator to add it to your role.';
  return (
    <div className="stack-4">
      <PageHeader title="Policies" description="Read the policies that apply to you and confirm you have read them." />
      {cannotList && tabs.length > 0 && <Alert>{explanation}</Alert>}
      {!tabs.length && !viewing && (cannotList
        ? <EmptyState title="Your role cannot view the policy list" description={explanation} />
        : <EmptyState title="You do not have access to policies" />)}
      {tabs.length > 1 && <Tabs label="Policies" idBase="policies" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="policies" tab={tab}>
          {tab === 'mine' && <MyPolicies onOpen={open} />}
          {tab === 'manage' && <ManagePolicies onView={open} />}
        </TabPanel>
      )}
      {viewing && <PolicyViewer id={viewing} onClose={close} />}
    </div>
  );
}
