import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows title, description and action', () => {
    renderUi(<EmptyState title="No leave" description="Apply when you need it" action={<Button>Apply</Button>} />);
    expect(screen.getByText('No leave')).toBeTruthy();
    expect(screen.getByText('Apply when you need it')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<EmptyState title="No leave" compact />);
    await expectNoAxeViolations(container);
  });
});
