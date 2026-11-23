import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Button, ButtonLink } from './Button';

describe('Button', () => {
  it('does not submit a surrounding form by default', () => {
    renderUi(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('type', 'button');
  });
  it('blocks clicks while loading, so a request cannot be sent twice', async () => {
    const onClick = vi.fn();
    renderUi(<Button loading onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(b).catch(() => undefined);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<><Button variant="primary">A</Button><Button iconOnly aria-label="Close" /><ButtonLink to="/x">L</ButtonLink></>);
    await expectNoAxeViolations(container);
  });
});
