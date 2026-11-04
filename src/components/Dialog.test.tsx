import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { Input } from './Input';
import { Modal } from './Modal';

describe('Modal', () => {
  it('is named by its title, moves focus in, traps Tab and restores focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          {open && <Modal title="Edit" onClose={() => setOpen(false)} footer={<Button>Save</Button>}><Input label="Name" /></Modal>}
        </>
      );
    }
    renderUi(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    screen.getByRole('button', { name: 'Save' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes only the top dialog on Escape', async () => {
    const outer = vi.fn(); const inner = vi.fn();
    function Nested() {
      const [open, setOpen] = useState(false);
      return <Modal title="Outer" onClose={outer}><Button onClick={() => setOpen(true)}>More</Button>{open && <Modal title="Inner" onClose={inner}><Input label="X" /></Modal>}</Modal>;
    }
    renderUi(<Nested />);
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.keyboard('{Escape}');
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });

  it('renders a dialog opened later after earlier ones in the DOM, so it paints on top', () => {
    renderUi(<><Modal title="First" onClose={vi.fn()}>a</Modal><Modal title="Second" onClose={vi.fn()}>b</Modal></>);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.map((d) => d.getAttribute('aria-labelledby') && d.textContent?.includes('Second'))).toEqual([false, true]);
  });

  it('asks before discarding typed work', async () => {
    const onClose = vi.fn();
    renderUi(<Modal title="Edit" onClose={onClose}><Input label="Name" /></Modal>);
    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('x');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click when clean, but not on a drag that began inside', () => {
    const onClose = vi.fn();
    renderUi(<Modal title="Edit" onClose={onClose}>text</Modal>);
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement!;
    fireEvent.mouseDown(dialog); fireEvent.mouseUp(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(backdrop); fireEvent.mouseUp(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('persistent content has no close button and ignores Escape and the backdrop', async () => {
    const onClose = vi.fn();
    renderUi(<Modal title="Key" persistent onClose={onClose}>one-time key</Modal>);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(backdrop); fireEvent.mouseUp(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    renderUi(<Modal title="Edit" description="More" onClose={vi.fn()} footer={<Button>Save</Button>}><Input label="Name" /></Modal>);
    await expectNoAxeViolations();
  });
});

describe('Drawer', () => {
  it('shares the dialog behaviour', async () => {
    const onClose = vi.fn();
    renderUi(<Drawer title="Menu" side="left" onClose={onClose}><Button>Item</Button></Drawer>);
    expect(screen.getByRole('dialog', { name: 'Menu' }).className).toContain('dialog--drawer');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('has no axe violations', async () => {
    renderUi(<Drawer title="Menu" onClose={vi.fn()}><Button>Item</Button></Drawer>);
    await expectNoAxeViolations();
  });
});
