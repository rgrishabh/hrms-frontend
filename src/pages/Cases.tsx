import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { CaseDetail } from '../features/cases/CaseDetail';
import { Committee } from '../features/cases/Committee';
import { Handling } from '../features/cases/Handling';
import { MyCases } from '../features/cases/MyCases';
import { CASES_URL, type CaseList, type CommitteeData } from '../features/cases/types';
import { useApiQuery } from '../lib/query';
import '../features/cases/Cases.css';

type Tab = 'mine' | 'grievances' | 'posh' | 'committee';

export function Cases() {
  const { can, hasFeature, me } = useAuth();
  const grievanceOn = hasFeature('FEATURE_GRIEVANCE');
  const poshOn = hasFeature('FEATURE_POSH');
  const manages = can('grievance.manage');
  const committee = useApiQuery<CommitteeData>(poshOn ? `${CASES_URL}/committee` : null);
  // Someone assigned a grievance handles it without holding the permission, so only the list can tell.
  const assigned = useApiQuery<CaseList>(grievanceOn && !manages ? `${CASES_URL}?kind=grievance&scope=handling` : null);
  const onCommittee = !!committee.data?.members.some((m) => m.user_id === me?.user.id);
  const [params, setParams] = useSearchParams();
  const tabs: TabItem<Tab>[] = [{ key: 'mine', label: 'My cases' }];
  if (grievanceOn && manages) tabs.push({ key: 'grievances', label: 'Grievances' });
  else if (grievanceOn && assigned.data?.items.length) tabs.push({ key: 'grievances', label: 'Assigned to me' });
  if (poshOn && onCommittee) tabs.push({ key: 'posh', label: 'POSH complaints (IC)' });
  if (poshOn) tabs.push({ key: 'committee', label: 'Internal Committee' });
  const [tab, setTab] = useTabParam(tabs.map((t) => t.key));
  const open = params.get('case');
  const setOpen = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('case', id); else n.delete('case'); return n; }, { replace: !id });
  const title = grievanceOn && poshOn ? 'Grievances & POSH' : poshOn ? 'POSH' : 'Grievances';
  const description = ['Confidential.', poshOn && 'POSH complaints go only to the Internal Committee.', grievanceOn && 'Grievances go to HR.', 'Details are encrypted.'].filter(Boolean).join(' ');
  return (
    <div className="stack-4">
      <PageHeader title={title} description={description} />
      {tabs.length > 1 && <Tabs label={title} idBase="cases" tabs={tabs} value={tab} onChange={setTab} />}
      <TabPanel idBase="cases" tab={tab}>
        {tab === 'mine' && <MyCases onOpen={setOpen} />}
        {tab === 'grievances' && <Handling kind="grievance" label={manages ? 'Grievances' : 'Grievances assigned to me'} onOpen={setOpen} />}
        {tab === 'posh' && <Handling kind="posh" label="POSH complaints" onOpen={setOpen} />}
        {tab === 'committee' && <Committee onCommittee={onCommittee} />}
      </TabPanel>
      {open && <CaseDetail key={open} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
