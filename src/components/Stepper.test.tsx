import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Stepper, type StepItem } from './Stepper';

const steps: StepItem[] = [{ key: '1', title: 'Manager', state: 'done' }, { key: '2', title: 'HR', state: 'current', description: 'Waiting' }, { key: '3', title: 'Finance', state: 'upcoming' }];

describe('Stepper', () => {
  it('marks the current step and puts each state into words', () => {
    renderUi(<Stepper label="Approval steps" steps={steps} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
    expect(items[0]!.textContent).toContain('Completed');
    expect(items[2]!.textContent).toContain('Not started');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Stepper label="Approval steps" steps={steps} />);
    await expectNoAxeViolations(container);
  });
});
