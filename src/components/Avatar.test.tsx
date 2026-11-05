import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('shows initials', () => {
    const { container } = renderUi(<Avatar name="Meera Nair" />);
    expect(container.textContent).toBe('MN');
  });
  it('falls back to initials when the image fails', () => {
    const { container } = renderUi(<Avatar name="Asha" src="/x.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.textContent).toBe('A');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Avatar name="Asha" src="/x.png" />);
    await expectNoAxeViolations(container);
  });
});
