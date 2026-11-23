import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Badge, statusLabel, StatusBadge } from './Badge';

describe('StatusBadge', () => {
  it('maps statuses to tones and words', () => {
    renderUi(<StatusBadge status="missing_punch" />);
    const b = screen.getByText('Missing punch');
    expect(b.className).toContain('badge--danger');
  });
  it('sentence-cases an unknown status', () => { expect(statusLabel('in_progress')).toBe('In progress'); });
  it('has no axe violations', async () => {
    const { container } = renderUi(<><Badge tone="ok">A</Badge><StatusBadge status="pending" /></>);
    await expectNoAxeViolations(container);
  });
});
