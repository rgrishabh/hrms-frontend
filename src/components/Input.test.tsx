import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Checkbox, Input, Textarea } from './Input';

describe('Input', () => {
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
