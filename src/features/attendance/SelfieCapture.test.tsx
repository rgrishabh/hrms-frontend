import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SelfieCapture } from './SelfieCapture';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const track = () => ({ stop: vi.fn() });
const camera = (impl: Mock) => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: impl } });
const stream = (t = track()) => ({ getTracks: () => [t] });
let drawImage: Mock;
const canvases = (blob: Blob | null) => {
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  return vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb) { cb(blob); });
};
const frameSize = (w: number, h: number) => { vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(w); vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(h); };
const JPEG = new Blob(['x'], { type: 'image/jpeg' });
const show = (over: Partial<Parameters<typeof SelfieCapture>[0]> = {}) => {
  const props = { confirmLabel: 'Use photo', busy: false, error: null, onConfirm: vi.fn(), onClose: vi.fn(), ...over };
  return { ...render(<SelfieCapture {...props} />), props };
};

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); });
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'mediaDevices'); });

describe('with a camera', () => {
  it('asks only for the front camera, holds Take photo until live, and scales the frame down to 640', async () => {
    const t = track();
    const media = vi.fn().mockResolvedValue(stream(t));
    camera(media);
    const toBlob = canvases(JPEG);
    frameSize(1280, 720);
    show();
    const take = screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement;
    expect(take.disabled).toBe(true);
    await waitFor(() => expect(take.disabled).toBe(false));
    expect(media).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
    await userEvent.click(take);
    expect(await screen.findByRole('img', { name: 'Your clock-in selfie' })).toBeTruthy();
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 360);
    expect(toBlob.mock.calls[0]!.slice(1)).toEqual(['image/jpeg', 0.85]);
    expect(t.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText('Camera preview')).toBeNull();
  });
  it('confirming hands over the photo; Retake starts the camera again', async () => {
    const media = vi.fn().mockImplementation(async () => stream());
    camera(media);
    canvases(JPEG);
    frameSize(320, 240);
    const { props } = show();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use photo' }));
    expect(props.onConfirm).toHaveBeenCalledWith(JPEG);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 320, 240);
    await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(await screen.findByLabelText('Camera preview')).toBeTruthy();
    await waitFor(() => expect(media).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('img', { name: 'Your clock-in selfie' })).toBeNull();
  });
  it('a frame that cannot be turned into a photo says to try again and stays live', async () => {
    camera(vi.fn().mockResolvedValue(stream()));
    canvases(null);
    frameSize(320, 240);
    show();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByText('The photo could not be taken. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Camera preview')).toBeTruthy();
  });
  it('closing the dialog turns the camera off', async () => {
    const t = track();
    camera(vi.fn().mockResolvedValue(stream(t)));
    const { unmount } = show();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false));
    expect(t.stop).not.toHaveBeenCalled();
    unmount();
    expect(t.stop).toHaveBeenCalled();
  });
  it('while recording, the photo cannot be retaken or the dialog cancelled; the server reason shows', async () => {
    camera(vi.fn().mockRejectedValue(new DOMException('No', 'NotFoundError')));
    const { rerender, props } = show();
    await userEvent.upload(await screen.findByLabelText('Choose a photo'), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('img', { name: 'Your clock-in selfie' });
    rerender(<SelfieCapture {...props} busy error={new Error('Clock-in refused')} />);
    expect((screen.getByRole('button', { name: 'Retake' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Recording…')).toBeTruthy();
    expect(screen.getByText('Clock-in refused')).toBeTruthy();
  });
});

describe('without a camera', () => {
  it('blocked by the browser, explains and offers a photo instead, and can try again', async () => {
    const media = vi.fn().mockRejectedValueOnce(new DOMException('No', 'NotAllowedError')).mockResolvedValue(stream());
    camera(media);
    show();
    expect(await screen.findByText(/The camera is blocked for this site/)).toBeTruthy();
    expect(screen.getByLabelText('Choose a photo')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try the camera again' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/The camera is blocked/)).toBeNull();
  });
  it('any other camera failure reads as no camera', async () => {
    camera(vi.fn().mockRejectedValue(new Error('Device busy')));
    show();
    expect(await screen.findByText(/No camera could be started on this device/)).toBeTruthy();
  });
  it('a browser without camera support goes straight to choosing a photo', async () => {
    show();
    expect(await screen.findByText(/No camera could be started on this device/)).toBeTruthy();
    const photo = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Choose a photo'), photo);
    expect(((await screen.findByRole('img', { name: 'Your clock-in selfie' })) as HTMLImageElement).src).toMatch(/^data:image\/jpeg/);
  });
  it('a chosen photo that cannot be read says so and leaves the picker up', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function fail(this: FileReader) { this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>); });
    show();
    await userEvent.upload(await screen.findByLabelText('Choose a photo'), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('The photo could not be read. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Choose a photo')).toBeTruthy();
  });
  it('Cancel closes', async () => {
    const { props } = show();
    await screen.findByLabelText('Choose a photo');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
