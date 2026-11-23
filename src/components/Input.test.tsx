import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Checkbox, Input, Textarea } from './Input';

describe('Input', () => {
  it('shows a failed browser check inline, moves focus there, and clears it on typing', async () => {
    renderUi(<form onSubmit={(e) => e.preventDefault()}><Input label="Name" required defaultValue="" /><Input label="Code" required defaultValue="" /><button type="submit">Save</button></form>);
    const name = screen.getByRole('textbox', { name: /Name/ });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    await userEvent.type(name, 'A');
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });
  it('keeps the hint and error out of the accessible name and ties them with aria-describedby', () => {
    renderUi(<Input label="From" hint="First day" error="Too early" />);
    const input = screen.getByRole('textbox', { name: 'From' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['Too early', 'First day']);
  });
  it('passes keyboard hints through', () => {
    renderUi(<Input label="Code" inputMode="numeric" />);
    expect(screen.getByLabelText('Code').getAttribute('inputmode')).toBe('numeric');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<><Input label="A" required /><Textarea label="B" hint="h" /><Checkbox label="C" /></>);
    await expectNoAxeViolations(container);
  });
});
