import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaskableText, Restricted, RevealToggle } from '../components/RevealToggle';
import { mockPageApi, reads, renderPage } from '../test/page';
import { renderUi } from '../test/render';
import { isMaskedField, useRevealable, withReveal } from './masking';

interface Pay { net: number | null; masked?: boolean; maskedFields?: string[] }
const MASKED: Pay = { net: null, masked: true, maskedFields: ['net'] };
const OPEN: Pay = { net: 54321, masked: false };

function PayCard({ url, keepPrevious }: { url: string | null; keepPrevious?: boolean }) {
  const { query, revealed, setRevealed } = useRevealable<Pay>(url, { keepPrevious });
  const data = query.data;
  return (
    <div>
      <p data-testid="net">{data ? (isMaskedField(data, 'net') ? 'hidden' : String(data.net)) : 'waiting'}</p>
      <RevealToggle revealed={revealed} onChange={setRevealed} what="pay" loading={query.isFetching} />
    </div>
  );
}
const answer = (url: string) => (url.includes('reveal=1') ? OPEN : MASKED);

afterEach(() => { vi.restoreAllMocks(); });

describe('isMaskedField', () => {
  it('needs both the flag and the field listed', () => {
    expect(isMaskedField(MASKED, 'net')).toBe(true);
    expect(isMaskedField(MASKED, 'gross')).toBe(false);
    expect(isMaskedField({ net: null, masked: false, maskedFields: ['net'] }, 'net')).toBe(false);
    expect(isMaskedField({ net: null, masked: true }, 'net')).toBe(false);
    expect(isMaskedField({ net: null }, 'net')).toBe(false);
    expect(isMaskedField(null, 'net')).toBe(false);
    expect(isMaskedField(undefined, 'net')).toBe(false);
  });
});

describe('withReveal', () => {
  it('adds to a query or starts one', () => {
    expect(withReveal('/api/v1/x')).toBe('/api/v1/x?reveal=1');
    expect(withReveal('/api/v1/x?page=2')).toBe('/api/v1/x?page=2&reveal=1');
  });
});

describe('revealing', () => {
  it('stays hidden until asked, asks with reveal=1, and hiding goes back without it', async () => {
    const f = mockPageApi([], [], answer);
    renderPage(<PayCard url="/api/v1/pay" />);
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('hidden'));
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    const show = await screen.findByRole('button', { name: 'Show pay' });
    expect(show.getAttribute('aria-pressed')).toBe('false');
    expect(show.getAttribute('title')).toBe('Showing these is recorded in the audit log');
    await userEvent.click(show);
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('54321'));
    expect(reads(f, '/api/v1/pay?reveal=1')).toHaveLength(1);
    const hide = await screen.findByRole('button', { name: 'Hide pay' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(hide.getAttribute('title')).toBeNull();
    await userEvent.click(hide);
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('hidden'));
  });
  it('a revealed answer is asked for again each time, never served from memory', async () => {
    const f = mockPageApi([], [], answer);
    renderPage(<PayCard url="/api/v1/pay" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show pay' }));
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('54321'));
    await userEvent.click(await screen.findByRole('button', { name: 'Hide pay' }));
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('hidden'));
    await userEvent.click(await screen.findByRole('button', { name: 'Show pay' }));
    await waitFor(() => expect(reads(f, '/api/v1/pay?reveal=1')).toHaveLength(2));
  });
  it('keeps the previous page on screen while revealing, when the screen asks for it', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    mockPageApi([], [], async (url) => { if (url.includes('reveal=1')) await held; return answer(url); });
    renderPage(<PayCard url="/api/v1/pay" keepPrevious />);
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('hidden'));
    await userEvent.click(await screen.findByRole('button', { name: 'Show pay' }));
    expect(screen.getByTestId('net').textContent).toBe('hidden');
    release();
    await waitFor(() => expect(screen.getByTestId('net').textContent).toBe('54321'));
  });
  it('no address yet means no request', async () => {
    const f = mockPageApi([], [], answer);
    renderPage(<PayCard url={null} />);
    expect((await screen.findByTestId('net')).textContent).toBe('waiting');
    expect(reads(f, '/api/v1/pay')).toHaveLength(0);
  });
});

describe('RevealToggle wording', () => {
  it('talks about amounts unless told otherwise', async () => {
    const onChange = vi.fn();
    renderUi(<RevealToggle revealed={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('from revealed, offers to hide', async () => {
    const onChange = vi.fn();
    renderUi(<RevealToggle revealed onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('text that may be withheld', () => {
  it('says why it is hidden and shows no value', () => {
    renderUi(<MaskableText row={{ reason: null, masked: true, maskedFields: ['reason'] }} field="reason" />);
    expect(screen.getByText(/^Hidden\. Only the person, HR above them/)).toBeTruthy();
  });
  it('the reason can be specific to the screen', () => {
    renderUi(<MaskableText row={{ reason: null, masked: true, maskedFields: ['reason'] }} field="reason" reason="Only the panel." />);
    expect(screen.getByText('Hidden. Only the panel.')).toBeTruthy();
  });
  it('shows a value that is not withheld, and a dash for nothing', () => {
    const { container } = renderUi(<MaskableText row={{ reason: 'Family wedding' }} field="reason" />);
    expect(container.textContent).toContain('Family wedding');
    const empty = renderUi(<MaskableText row={{ reason: null, masked: true, maskedFields: ['other'] }} field="reason" />);
    expect(empty.container.textContent).toContain('—');
  });
  it('Restricted has a default reason and takes another', () => {
    renderUi(<><Restricted /><Restricted reason="Payroll only." /></>);
    expect(screen.getByText('Hidden. Only HR above this person, and the person, can see this.')).toBeTruthy();
    expect(screen.getByText('Hidden. Payroll only.')).toBeTruthy();
  });
});
