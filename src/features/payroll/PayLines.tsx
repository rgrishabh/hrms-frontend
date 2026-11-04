import { money } from '../../format';
import './PayLines.css';

export interface PayLine { kind: string; name: string; amount: number | string; basis?: string | null }

/** Earnings, deductions, employer contributions and net pay: shared by payslips and payroll runs. */
export function PayLines({ lines, gross, deductions, net }: { lines: readonly PayLine[]; gross: number | string; deductions: number | string; net: number | string }) {
  const group = (kind: string) => lines.filter((l) => l.kind === kind);
  const employer = group('employer');
  return (
    <div className="stack-4">
      <div className="pay-lines">
        {(['earning', 'deduction'] as const).map((kind) => (
          <table key={kind} className="pay-lines__table">
            <caption>{kind === 'earning' ? 'Earnings' : 'Deductions'}</caption>
            <tbody>
              {group(kind).map((l, i) => <tr key={i}><td>{l.name}{l.basis && <div className="text-xs text-3">{l.basis}</div>}</td><td className="pay-lines__amount">{money(l.amount)}</td></tr>)}
              <tr className="pay-lines__total"><th scope="row">Total</th><td className="pay-lines__amount">{money(kind === 'earning' ? gross : deductions)}</td></tr>
            </tbody>
          </table>
        ))}
      </div>
      {employer.length > 0 && <p className="text-sm text-2">Employer contributions: {employer.map((l) => `${l.name} ${money(l.amount)}`).join(' · ')}</p>}
      <p className="pay-lines__net">Net pay <span className="tnum">{money(net)}</span></p>
    </div>
  );
}
