import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { SkeletonPage, SkeletonRows } from './Skeleton';

describe('Skeleton', () => {
  it('marks its region busy with a name', () => {
    renderUi(<SkeletonRows />);
    expect(screen.getByRole('status', { name: 'Loading' }).getAttribute('aria-busy')).toBe('true');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<SkeletonPage />);
    await expectNoAxeViolations(container);
  });
});
