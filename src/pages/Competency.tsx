import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { Assessments } from '../features/competency/Assessments';
import { Authorizations } from '../features/competency/Authorizations';
import { Matrix } from '../features/competency/Matrix';
import { MyCompetence } from '../features/competency/MyCompetence';
import { Setup } from '../features/competency/Setup';
import { TrainingRecords } from '../features/competency/TrainingRecords';
import '../features/competency/Competency.css';

type Tab = 'mine' | 'matrix' | 'authorizations' | 'assessments' | 'training' | 'setup';

export function Competency() {
  const { can, canAny, hasFeature, me } = useAuth();
  const lab = hasFeature('FEATURE_LAB_COMPETENCY');
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('competency.self')) tabs.push({ key: 'mine', label: lab ? 'My competence' : 'My training' });
  if (lab && can('competency.read')) tabs.push({ key: 'matrix', label: 'Competence matrix' });
  if (lab && canAny('competency.read', 'competency.authorize')) tabs.push({ key: 'authorizations', label: 'Authorizations' });
  if (lab && canAny('competency.read', 'competency.assess')) tabs.push({ key: 'assessments', label: 'Assessments' });
  if (canAny('training.manage', 'competency.read')) tabs.push({ key: 'training', label: 'Training records' });
  if (canAny('training.manage', 'competency.manage')) tabs.push({ key: 'setup', label: lab ? 'Courses & methods' : 'Courses' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  const title = lab ? 'Training & competency' : 'Training';
  const description = lab ? 'Training records, competency assessments and quality-approved technical authorizations for laboratory methods.' : 'Training courses and employee training records.';
  return (
    <div className="stack-4">
      <PageHeader title={title} description={description} />
      {!tabs.length
        ? <EmptyState title="Nothing here for you" description="You do not have access to these records." />
        : (
          <>
            {tabs.length > 1 && <Tabs label={title} idBase="competency" tabs={tabs} value={tab} onChange={setTab} />}
            <TabPanel idBase="competency" tab={tab}>
              {tab === 'mine' && <MyCompetence />}
              {tab === 'matrix' && <Matrix />}
              {tab === 'authorizations' && <Authorizations />}
              {tab === 'assessments' && <Assessments />}
              {tab === 'training' && <TrainingRecords />}
              {tab === 'setup' && <Setup />}
            </TabPanel>
          </>
        )}
    </div>
  );
}
