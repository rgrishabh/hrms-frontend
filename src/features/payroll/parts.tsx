import { Money } from '../../components/Money';
import { todayLocal } from '../../format';
import type { PayComponent } from './types';

/** The month before the current one, by the organization's calendar. */
export function lastMonth(): string {
  const [y, m] = todayLocal().split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** A salary's components, as a percentage or an amount depending on how each is calculated. */
export function SalaryAmounts({ amounts, components }: { amounts: Record<string, number | string>; components: readonly PayComponent[] }) {
  return (
    <ul className="list-plain text-sm">
      {Object.entries(amounts).map(([code, value]) => (
        <li key={code}><span className="mono">{code}</span> {components.find((c) => c.code === code)?.calc === 'percent' ? <span className="tnum">{value}%</span> : <Money value={value} />}</li>
      ))}
    </ul>
  );
}
