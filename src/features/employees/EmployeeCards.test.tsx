import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, problem, renderPage, writes } from '../../test/page';
import { EmployeeCards, shrinkPhoto } from './EmployeeCards';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const png = () => new File(['x'], 'me.png', { type: 'image/png' });
const show = (answer: (url: string, init: RequestInit) => unknown = () => ({ ok: true })) => {
  const f = mockPageApi(['employees.manage'], answer);
  renderPage(<EmployeeCards employeeId="e2" />);
  return f;
};

describe('employee cards', () => {
  it('offers both cards for this person', async () => {
    show();
    expect(await screen.findByRole('button', { name: 'ID card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Business card' })).toBeTruthy();
  });
  it('choosing a photo uploads it, says so and clears the field', async () => {
    const f = show();
    await userEvent.upload(await screen.findByLabelText('Photo for the ID card'), png());
    await waitFor(() => expect(writes(f, '/api/v1/employees/e2/photo')).toHaveLength(1));
    expect(await screen.findByText(/Photo saved/)).toBeTruthy();
  });
  it('a refused photo stays with the reason', async () => {
    show((url) => (url.endsWith('/photo') ? problem(415, 'Use a JPEG or PNG photo.') : ({})));
    await userEvent.upload(await screen.findByLabelText('Photo for the ID card'), png());
    expect(await screen.findByText('Use a JPEG or PNG photo.')).toBeTruthy();
  });
});

describe('shrinkPhoto', () => {
  it('sends the original when the browser cannot read it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('no'))));
    const file = png();
    expect(await shrinkPhoto(file)).toBe(file);
  });
  it('scales to fit a card and never enlarges', async () => {
    const sizes: number[][] = [];
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve({ width: 3000, height: 4000, close: vi.fn() })));
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = real(tag);
      if (tag === 'canvas') Object.assign(el, { getContext: () => ({ drawImage: (_: unknown, __: number, ___: number, w: number, h: number) => sizes.push([w, h]) }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(['y'], { type: 'image/jpeg' })) });
      return el;
    });
    const out = await shrinkPhoto(png());
    expect(sizes).toEqual([[600, 800]]);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('photo.jpg');
  });
});
