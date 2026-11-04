import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { ApplicationDetail } from '../features/recruitment/Application';
import { Candidates } from '../features/recruitment/Candidates';
import { MyInterviews } from '../features/recruitment/MyInterviews';
import { Requisitions } from '../features/recruitment/Requisitions';
import '../features/recruitment/Recruitment.css';

type Tab = 'requisitions' | 'candidates' | 'interviews';

export function Recruitment() {
  const { canAny } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: TabItem<Tab>[] = [];
  if (canAny('recruitment.requisition', 'recruitment.read', 'recruitment.manage', 'recruitment.approve')) tabs.push({ key: 'requisitions', label: 'Requisitions' });
  if (canAny('recruitment.read', 'recruitment.manage')) tabs.push({ key: 'candidates', label: 'Candidates' });
  tabs.push({ key: 'interviews', label: 'My interviews' });
  const [tab, setTab] = useTabParam(tabs.map((t) => t.key));
  const openApp = params.get('application');
  const application = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('application', id); else n.delete('application'); return n; });
  return (
    <div className="stack-4">
      <PageHeader title="Recruitment" description="Approved requisitions, candidates, interviews and offers. Hiring creates the employee record." />
      {tabs.length > 1 && <Tabs label="Recruitment" idBase="recruitment" tabs={tabs} value={tab} onChange={setTab} />}
      <TabPanel idBase="recruitment" tab={tab}>
        {tab === 'requisitions' && <Requisitions onOpenApp={application} />}
        {tab === 'candidates' && <Candidates onOpenApp={application} />}
        {tab === 'interviews' && <MyInterviews onOpenApp={application} />}
      </TabPanel>
      {openApp && <ApplicationDetail id={openApp} onClose={() => application(null)} />}
    </div>
  );
}
