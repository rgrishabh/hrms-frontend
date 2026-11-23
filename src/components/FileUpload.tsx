import { useId, useRef, useState, type DragEvent } from 'react';
import { FileUp, X } from 'lucide-react';
import { Button } from './Button';
import './FileUpload.css';

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export interface FileUploadProps {
  label: string;
  hint?: string;
  /** Passed to the native input, for example ".csv,text/csv". Also enforced for dropped files. */
  accept?: string;
  maxBytes?: number;
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
  error?: string | null;
}

function accepted(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(',').map((a) => a.trim().toLowerCase()).some((a) => (a.startsWith('.') ? file.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
}

/**
 * A native file input with a drop zone around it. The input stays focusable, so keyboard and screen
 * reader users get the system picker. Files stay in memory; nothing previews through blob: URLs,
 * which the CSP forbids. The server does the real type and malware checks.
 */
export function FileUpload({ label, hint, accept, maxBytes, file, onChange, required, error }: FileUploadProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const shown = error ?? localError;

  const take = (f: File | null | undefined) => {
    if (!f) return;
    if (!accepted(f, accept)) { setLocalError('That file type is not allowed.'); return; }
    if (maxBytes && f.size > maxBytes) { setLocalError(`That file is larger than ${size(maxBytes)}.`); return; }
    setLocalError(null);
    onChange(f);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); };
  const clear = () => { onChange(null); setLocalError(null); if (input.current) input.current.value = ''; };

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}{required && <span className="field__required" aria-hidden="true"> *</span>}</label>
      {file ? (
        <div className="file-upload__chosen">
          <span className="grow file-upload__name">{file.name}</span>
          <span className="text-3 text-sm nowrap">{size(file.size)}</span>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Remove ${file.name}`} icon={<X aria-hidden="true" />} onClick={clear} />
        </div>
      ) : (
        <div className={`file-upload${over ? ' file-upload--over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <FileUp aria-hidden="true" />
          <span>Choose a file or drop it here</span>
          <input
            ref={input}
            id={id}
            type="file"
            className="file-upload__input"
            accept={accept}
            required={required}
            aria-describedby={hint ? `${id}-hint` : undefined}
            aria-invalid={shown ? true : undefined}
            onInvalid={(e) => { e.preventDefault(); setLocalError(e.currentTarget.validationMessage); }}
            onChange={(e) => take(e.target.files?.[0])}
          />
        </div>
      )}
      {hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
      {shown && <span className="field__error" role="alert">{shown}</span>}
    </div>
  );
}
