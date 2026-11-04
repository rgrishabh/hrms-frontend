import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Modal } from '../../components/Modal';
import './SelfieCapture.css';

const MAX_SIDE = 640;
type Stage = 'starting' | 'live' | 'blocked' | 'unavailable';

function frameToBlob(video: HTMLVideoElement): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The photo could not be taken. Try again.'))), 'image/jpeg', 0.85));
}

/** A data: URL for the preview, because the CSP's img-src does not allow blob:. */
const previewOf = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('The photo could not be read. Try again.'));
  r.readAsDataURL(blob);
});

export interface SelfieCaptureProps {
  /** Label of the final button, such as "Use photo and clock in". */
  confirmLabel: string;
  busy: boolean;
  error: unknown;
  onConfirm: (photo: Blob) => void;
  onClose: () => void;
}

/**
 * Takes one photo for a clock-in. The camera runs only while this dialog is open and stops when it
 * closes. If the camera is blocked or missing, the device's own photo picker is offered instead.
 */
export function SelfieCapture({ confirmLabel, busy, error, onConfirm, onClose }: SelfieCaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>('starting');
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const start = async () => {
    setStage('starting');
    if (!navigator.mediaDevices?.getUserMedia) { setStage('unavailable'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setStage('live');
    } catch (e) {
      setStage(e instanceof DOMException && e.name === 'NotAllowedError' ? 'blocked' : 'unavailable');
    }
  };
  useEffect(() => { void start(); return stop; }, []);

  const accept = async (blob: Blob) => {
    setFailure(null);
    try { setPhoto({ blob, preview: await previewOf(blob) }); stop(); } catch (e) { setFailure((e as Error).message); }
  };
  const take = async () => {
    if (!video.current) return;
    try { await accept(await frameToBlob(video.current)); } catch (e) { setFailure((e as Error).message); }
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void accept(f); };
  const retake = () => { setPhoto(null); void start(); };

  const noCamera = stage === 'blocked' || stage === 'unavailable';
  return (
    <Modal title="Take a selfie to clock in" description="Your organization asks for a photo at clock-in. It is kept for a limited time and used only to confirm attendance." onClose={onClose}>
      <div className="stack-3">
        {photo
          ? <img className="selfie__frame" src={photo.preview} alt="Your photo" />
          : <video ref={video} className={`selfie__frame${noCamera ? ' selfie__frame--off' : ''}`} autoPlay playsInline muted aria-label="Camera preview" />}
        {!photo && stage === 'blocked' && <Alert tone="warn">The camera is blocked for this site. Allow it in your browser's site settings and try again, or choose a photo below.</Alert>}
        {!photo && stage === 'unavailable' && <Alert tone="warn">No camera could be started on this device. Choose a photo below.</Alert>}
        {!photo && noCamera && (
          <label className="btn btn--secondary btn--md selfie__file">
            <Camera aria-hidden="true" />
            Choose a photo
            <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" capture="user" onChange={onFile} />
          </label>
        )}
        <InlineError error={failure ?? error} />
        <div className="cluster-between">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <div className="cluster">
            {photo
              ? (
                <>
                  <Button icon={<RefreshCw aria-hidden="true" />} disabled={busy} onClick={retake}>Retake</Button>
                  <Button variant="primary" loading={busy} loadingText="Recording…" onClick={() => onConfirm(photo.blob)}>{confirmLabel}</Button>
                </>
              )
              : noCamera
                ? <Button icon={<RefreshCw aria-hidden="true" />} onClick={() => void start()}>Try the camera again</Button>
                : <Button variant="primary" disabled={stage !== 'live'} icon={<Camera aria-hidden="true" />} onClick={() => void take()}>Take photo</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
