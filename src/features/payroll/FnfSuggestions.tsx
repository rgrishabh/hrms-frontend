import { Alert } from '../../components/Alert';
import { statusLabel } from '../../components/Badge';
import { KeyValue } from '../../components/KeyValue';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { fmtDate, fmtNumber } from '../../format';
import { useApiQuery } from '../../lib/query';
import { SalaryAmounts } from './parts';
import { COMPONENTS_URL, type FnfSuggestion, type PayComponent } from './types';

export const fnfUrl = (employeeId: string) => `/api/v1/payroll/fnf-suggestions/${employeeId}`;

/** What the system knows about a leaver. HR confirms each figure and enters it as an adjustment. */
export function FnfSuggestions({ employeeId }: { employeeId: string }) {
  const query = useApiQuery<FnfSuggestion>(fnfUrl(employeeId));
  const components = useApiQuery<{ items: PayComponent[] }>(COMPONENTS_URL);
  return (
    <QueryState query={query} compact loading={<SkeletonRows rows={3} />}>
      {(s) => (
        <div className="stack-3">
          <KeyValue items={[
            { label: 'Last working day', value: fmtDate(s.lastWorkingDay) },
            { label: 'Separation', value: statusLabel(s.kind) },
            { label: 'Notice shortfall', value: s.shortfallWaived ? 'Waived' : `${fmtNumber(s.noticeShortfallDays)} day(s)` },
          ]} />
          <div className="stack-1">
            <h4 className="text-sm">Leave year {s.leaveYear} balances</h4>
            {s.leaveBalances.length
              ? <ul className="list-plain text-sm">{s.leaveBalances.map((b) => <li key={b.code}>{b.name}: <span className="tnum">{fmtNumber(b.balance)}</span> day(s){b.paid ? '' : ', unpaid'}</li>)}</ul>
              : <p className="text-sm text-2">No leave balances.</p>}
          </div>
          {s.salary && (
            <div className="stack-1">
              <h4 className="text-sm">Current salary</h4>
              <SalaryAmounts amounts={s.salary} components={components.data?.items ?? []} />
            </div>
          )}
          <Alert>{s.note}</Alert>
        </div>
      )}
    </QueryState>
  );
}
