import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { TabPanel, Tabs, useTabParam } from './Tabs';

const TABS = [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta', count: 3 }, { key: 'c', label: 'Gamma' }] as const;
type Key = (typeof TABS)[number]['key'];

function Harness() {
  const [v, setV] = useState<Key>('a');
  return <><Tabs label="Sections" idBase="t" tabs={TABS} value={v} onChange={setV} /><TabPanel idBase="t" tab={v}>{v}</TabPanel></>;
}

describe('Tabs', () => {
  it('has one tab stop and moves with the arrow keys, wrapping', async () => {
    renderUi(<Harness />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: /^Beta/ }).getAttribute('tabindex')).toBe('-1');
    alpha.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gamma' }));
    expect(screen.getByRole('tabpanel', { name: 'Gamma' }).textContent).toBe('c');
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(alpha);
  });
  it('useTabParam reads ?tab=, ignores unknown values and writes back', async () => {
    function Url() {
      const [tab, setTab] = useTabParam(['a', 'b'] as const);
      const loc = useLocation();
      return <button onClick={() => setTab('b')}>{tab} {loc.search}</button>;
    }
    renderUi(<Url />, '/x?tab=nope');
    const b = screen.getByRole('button');
    expect(b.textContent).toContain('a ');
    await userEvent.click(b);
    expect(b.textContent).toContain('b ?tab=b');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Harness />);
    await expectNoAxeViolations(container);
  });
});
