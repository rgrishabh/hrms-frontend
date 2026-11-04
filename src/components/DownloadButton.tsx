import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { errorMessage } from '../api';
import { downloadFile } from '../lib/download';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useToast } from './Toast';

export interface DownloadButtonProps {
  url: string;
  /** Used when the server names no file. */
  fileName: string;
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Screen-reader name, when the visible text alone does not say which record. */
  'aria-label'?: string;
}

/** A file from the API. A failure stays on the page as a toast, instead of opening raw JSON as a page or a file. */
export function DownloadButton({ url, fileName, children, size = 'sm', variant = 'secondary', disabled, 'aria-label': ariaLabel }: DownloadButtonProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await downloadFile(url, fileName); } catch (x) { toast(errorMessage(x), 'error'); } finally { setBusy(false); }
  };
  return <Button size={size} variant={variant} disabled={disabled} loading={busy} aria-label={ariaLabel} icon={<Download aria-hidden="true" />} onClick={() => void go()}>{children}</Button>;
}
