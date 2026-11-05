import { useCallback, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api';
import { useToast, type ToastAction } from './Toast';

export type FieldErrors = Record<string, string>;

export interface SubmitOptions {
  /** Client checks that need more than the browser's own: return messages by field. Empty means go on. */
  validate?: () => FieldErrors;
}

/**
 * Form submission: blocks double submits, keeps the form open on failure, and sends the server's field
 * errors to their fields. Pass `errors[name]` to each field and `error` to FormActions.
 */
export function useSubmit(action: () => Promise<unknown>, options: SubmitOptions = {}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<unknown>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const invalid = options.validate?.() ?? {};
    setErrors(invalid);
    setError(null);
    if (Object.keys(invalid).length) return;
    setBusy(true);
    try {
      await action();
    } catch (x) {
      const fields = x instanceof ApiError ? x.fieldErrors() : {};
      setErrors(fields);
      setError(Object.keys(fields).length && x instanceof ApiError ? x.message : x);
    } finally { setBusy(false); }
  };
  const clearError = useCallback((field: string) => setErrors((f) => { if (!(field in f)) return f; const { [field]: _gone, ...rest } = f; return rest; }), []);
  return { busy, errors, error, submit, setError, clearError };
}

/**
 * A one-press action on a row, with no dialog: the success goes to a toast (with an optional undo), the
 * failure to an error toast. `busyKey` says which row's button shows the spinner.
 */
export function useAction() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<unknown>, success?: string, undo?: ToastAction): Promise<boolean> => {
    setBusyKey(key);
    try {
      await action();
      if (success) toast(success, 'ok', undo);
      return true;
    } catch (x) {
      toast(errorMessage(x), 'error');
      return false;
    } finally { setBusyKey(null); }
  };
  return { run, busyKey, isBusy: (key: string) => busyKey === key };
}
