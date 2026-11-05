import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { InlineError } from './ErrorState';
import { Input, Textarea } from './Input';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Undefined shows no comment box. true requires a comment; false offers one. */
  requireComment?: boolean;
  /** What the comment box asks for, when it is not a plain comment: "Payment reference". */
  commentLabel?: string;
  /** Holds the button until the comment is this long, when the server has a minimum. */
  minCommentLength?: number;
  /** For irreversible actions: the user must type this word to enable the button. */
  typedConfirmation?: string;
  /** Throw to keep the dialog open with the error shown and the typed comment intact. */
  onConfirm: (comment: string) => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, requireComment, commentLabel = 'Comment', minCommentLength = 0, typedConfirmation, onConfirm, onClose }: ConfirmDialogProps) {
  const [comment, setComment] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blocked = (requireComment && comment.trim().length < Math.max(1, minCommentLength)) || (typedConfirmation !== undefined && typed.trim() !== typedConfirmation);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try { await onConfirm(comment); onClose(); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={blocked} loading={busy} onClick={confirm}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="stack-3">
        <div>{message}</div>
        {requireComment !== undefined && <Textarea label={`${commentLabel} (${requireComment ? (minCommentLength > 1 ? `at least ${minCommentLength} characters` : 'required') : 'optional'})`} value={comment} onChange={(e) => setComment(e.target.value)} />}
        {typedConfirmation !== undefined && <Input label={`Type ${typedConfirmation} to confirm`} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}
        <InlineError error={error} />
      </div>
    </Modal>
  );
}
