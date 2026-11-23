import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import './Stepper.css';

export type StepState = 'done' | 'current' | 'upcoming' | 'failed';
export interface StepItem { key: string; title: ReactNode; description?: ReactNode; state: StepState; meta?: ReactNode }

const STATE_LABEL: Record<StepState, string> = { done: 'Completed', current: 'In progress', upcoming: 'Not started', failed: 'Stopped' };

/** Progress through ordered steps. Each step's state is in words for screen readers. */
export function Stepper({ steps, label }: { steps: readonly StepItem[]; label: string }) {
  return (
    <ol className="stepper" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.key} className={`stepper__step stepper__step--${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className="stepper__marker" aria-hidden="true">
            {s.state === 'done' ? <Check /> : s.state === 'failed' ? <X /> : i + 1}
          </span>
          <div className="stepper__content">
            <div className="stepper__title"><span className="visually-hidden">{STATE_LABEL[s.state]}: </span>{s.title}{s.meta}</div>
            {s.description && <div className="stepper__description">{s.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
