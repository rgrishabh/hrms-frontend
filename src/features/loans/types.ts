import { formatMoney } from '../../components/Money';
import type { Maskable } from '../../lib/masking';
import { fmtMonth } from '../../format';
import type { FeatureFlag } from '../../lib/features';
import { invalidateApi } from '../../lib/query';

export type LoanKind = 'salary_advance' | 'loan';

export interface Loan extends Maskable {
  id: string; employee_id: string; employee_code: string; name: string; department: string | null; kind: LoanKind; amount: number | string | null; installments: number | null; installment_amount: number | string | null; first_period: string | null;
  skip_periods: string[] | null; purpose: string | null; status: string; outstanding: number | string | null; recorded_by_other: boolean; disbursed_at: string | null; disbursement_reference: string | null;
}
export interface LoanDetailData extends Loan {
  balance: { outstanding: number | string; inProgress: number | string; recovered: number | string } | null;
  schedule: { period: string; amount: number | string }[] | null;
  recoveries: { id: string; source: string; period: string | null; amount: number | string; reference: string | null; created_at: string; run_status: string | null; run_kind: string | null }[] | null;
}

export const KIND_LABEL: Record<LoanKind, string> = { salary_advance: 'Salary advance', loan: 'Loan' };
const KIND_FLAG: Record<LoanKind, FeatureFlag> = { salary_advance: 'FEATURE_SALARY_ADVANCE', loan: 'FEATURE_LOANS' };

/** The kinds this installation offers. Each has its own flag, and the server answers 404 for one that is off. */
export const loanKinds = (hasFeature: (...flags: FeatureFlag[]) => boolean): LoanKind[] => (['salary_advance', 'loan'] as const).filter((k) => hasFeature(KIND_FLAG[k]));

export const loansTitle = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'Loans' : 'Salary advances') : 'Advances & loans');
export const loansNoun = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'a loan' : 'a salary advance') : 'an advance or loan');

/** Terms can be masked with the rest of a loan. Without them there is nothing to say, rather than a guess. */
export const terms = (l: Loan) => {
  if (l.installments === null || l.first_period === null) return 'Hidden';
  const from = fmtMonth(l.first_period);
  return l.installment_amount === null ? `${l.installments} instalments from ${from}` : `${l.installments} × ${formatMoney(l.installment_amount)} from ${from}`;
};
export const reloadLoans = () => invalidateApi('/api/v1/loans', '/api/v1/dashboard');
