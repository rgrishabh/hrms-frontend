import { useState } from 'react';
import { Star } from 'lucide-react';
import { qs } from '../api';
import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { Cycles } from '../features/performance/Cycles';
import { MyReview } from '../features/performance/ReviewDetail';
import { ReviewList } from '../features/performance/ReviewList';
import type { ApiResponse } from '../lib/api-types';
import { useApiQuery } from '../lib/query';
import '../features/performance/Performance.css';

type Tab = 'mine' | 'team' | 'all' | 'cycles';

export function Performance() {
  const { can, me } = useAuth();
  const manage = can('performance.manage');
  const cycles = useApiQuery<ApiResponse<'/api/v1/performance/cycles'>>('/api/v1/performance/cycles');
  const visible = (cycles.data?.items ?? []).filter((c) => c.status !== 'draft');
  const [picked, setPicked] = useState('');
  const cycle = visible.find((c) => c.id === picked) ?? visible.find((c) => c.status === 'active') ?? visible[0];
  const team = useApiQuery<ApiResponse<'/api/v1/performance/reviews'>>(cycle ? `/api/v1/performance/reviews${qs({ cycleId: cycle.id, scope: 'team' })}` : null);
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('performance.self')) tabs.push({ key: 'mine', label: 'My review' });
  // A failed load keeps the tab, so the failure is seen instead of a team silently vanishing. Going by the
  // count of failures, not isError: opening the tab retries, and the tab must not vanish while it does.
  if (team.errorUpdateCount > 0 && !team.data) tabs.push({ key: 'team', label: 'My team' });
  else if (team.data?.items.length) tabs.push({ key: 'team', label: 'My team', count: team.data.items.length });
  if (manage) tabs.push({ key: 'all', label: 'All reviews' }, { key: 'cycles', label: 'Review cycles' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['mine']);
  return (
    <div className="stack-4">
      <PageHeader
        title="Performance"
        description="Goals agreed with your manager, self-review, manager review and the final rating."
        actions={visible.length > 0 && tab !== 'cycles' && <Select label="Review cycle" value={cycle?.id ?? ''} options={visible.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` }))} onChange={(e) => setPicked(e.target.value)} />}
      />
      <QueryState query={cycles} isEmpty={() => !tabs.length} empty={<EmptyState icon={<Star />} title="You do not have access to performance reviews" />}>
        {(d) => (
          <>
            {tabs.length > 1 && <Tabs label="Performance" idBase="performance" tabs={tabs} value={tab} onChange={setTab} />}
            <TabPanel idBase="performance" tab={tab}>
              {tab === 'cycles' ? <Cycles items={d.items} />
                : !cycle ? <EmptyState icon={<Star />} title="No review cycle is open yet" description={manage ? 'Create one under Review cycles.' : undefined} />
                : tab === 'mine' ? <MyReview cycle={cycle} />
                : <ReviewList cycle={cycle} scope={tab === 'team' ? 'team' : 'all'} />}
            </TabPanel>
          </>
        )}
      </QueryState>
    </div>
  );
}
