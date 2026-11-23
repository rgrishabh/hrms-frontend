import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { StatGrid, StatTile } from './StatTile';

describe('StatTile', () => {
  it('links when there is a screen behind it and keeps the tile key', () => {
    renderUi(<StatTile tileKey="headcount" label="Headcount" value={42} href="/reports" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/reports');
    expect(link.getAttribute('data-tile')).toBe('headcount');
    expect(link.querySelector('.v')?.textContent).toBe('42');
  });
  it('is plain content without a link', () => {
    renderUi(<StatTile label="Headcount" value={42} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<StatGrid label="Numbers"><StatTile label="A" value={1} detail="d" tone="bad" /></StatGrid>);
    await expectNoAxeViolations(container);
  });
});
