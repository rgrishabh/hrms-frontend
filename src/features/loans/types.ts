import { formatMoney } from '../../components/Money';
import { fmtMonth } from '../../format';
import type { FeatureFlag } from '../../lib/features';
import { invalidateApi } from '../../lib/query';

export type LoanKind = 'salary_advance' | 'loan';

export interface Loan {
  id: string; employee_id: string; employee_code: string; name: string; department: string | null; kind: LoanKind; amount: number | string; installments: number; installment_amount: number | string; first_period: string;
  skip_periods: string[]; purpose: string; status: string; outstanding: number | string; recorded_by_other: boolean; disbursed_at: string | null; disbursement_reference: string | null;
}
export interface LoanDetailData extends Loan {
  balance: { outstanding: number | string; inProgress: number | string; recovered: number | string };
  schedule: { period: string; amount: number | string }[];
  recoveries: { id: string; source: string; period: string | null; amount: number | string; reference: string | null; created_at: string; run_status: string | null; run_kind: string | null }[];
}

export const KIND_LABEL: Record<LoanKind, string> = { salary_advance: 'Salary advance', loan: 'Loan' };
const KIND_FLAG: Record<LoanKind, FeatureFlag> = { salary_advance: 'FEATURE_SALARY_ADVANCE', loan: 'FEATURE_LOANS' };

/** The kinds this installation offers. Each has its own flag, and the server answers 404 for one that is off. */
export const loanKinds = (hasFeature: (...flags: FeatureFlag[]) => boolean): LoanKind[] => (['salary_advance', 'loan'] as const).filter((k) => hasFeature(KIND_FLAG[k]));

export const loansTitle = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'Loans' : 'Salary advances') : 'Advances & loans');
export const loansNoun = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'a loan' : 'a salary advance') : 'an advance or loan');

export const terms = (l: Loan) => `${l.installments} × ${formatMoney(l.installment_amount)} from ${fmtMonth(l.first_period)}`;
export const reloadLoans = () => invalidateApi('/api/v1/loans', '/api/v1/dashboard');
