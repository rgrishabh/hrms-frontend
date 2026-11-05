import { formatMoney } from '../../components/Money';
import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';
import { fmtMonth } from '../../format';
import type { FeatureFlag } from '../../lib/features';
import { invalidateApi } from '../../lib/query';

export type LoanKind = 'salary_advance' | 'loan';

/** The list and detail say `string` for kind. The detail's schedule period is a month that is always sent; the schema allows null. */
export type Loan = Refine<ApiItem<'/api/v1/loans/requests'>, { kind: LoanKind }>;
export type LoanDetailData = Refine<ApiResponse<'/api/v1/loans/requests/{id}'>, { kind: LoanKind; schedule: { period: string; amount: string }[] | null }>;
/** recomputePayroll is the month's run to recompute, or null when none is affected; the schema says only string. */
export type DeferAnswer = Refine<ApiResponse<'/api/v1/loans/requests/{id}/defer', 'post'>, { recomputePayroll: string | null }>;

export const KIND_LABEL: Record<LoanKind, string> = { salary_advance: 'Salary advance', loan: 'Loan' };
const KIND_FLAG: Record<LoanKind, FeatureFlag> = { salary_advance: 'FEATURE_SALARY_ADVANCE', loan: 'FEATURE_LOANS' };

/** The kinds this installation offers. Each has its own flag, and the server answers 404 for one that is off. */
export const loanKinds = (hasFeature: (...flags: FeatureFlag[]) => boolean): LoanKind[] => (['salary_advance', 'loan'] as const).filter((k) => hasFeature(KIND_FLAG[k]));

export const loansTitle = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'Loans' : 'Salary advances') : 'Advances & loans');
export const loansNoun = (kinds: readonly LoanKind[]) => (kinds.length === 1 ? (kinds[0] === 'loan' ? 'a loan' : 'a salary advance') : 'an advance or loan');

/** Terms can be masked with the rest of a loan. Without them there is nothing to say, rather than a guess. */
export const terms = (l: Pick<Loan, 'installments' | 'first_period' | 'installment_amount'>) => {
  if (l.installments === null || l.first_period === null) return 'Hidden';
  const from = fmtMonth(l.first_period);
  return l.installment_amount === null ? `${l.installments} instalments from ${from}` : `${l.installments} × ${formatMoney(l.installment_amount)} from ${from}`;
};
export const reloadLoans = () => invalidateApi('/api/v1/loans', '/api/v1/dashboard');
