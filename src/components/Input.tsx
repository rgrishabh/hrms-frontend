import { Children, cloneElement, isValidElement, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import './Input.css';

export interface FieldProps {
  label: string;
  /** Hide the label visually but keep it for assistive technology. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

/**
 * Label, control, hint and error. The label is tied to the control with for/id and the hint with
 * aria-describedby, so a hint never becomes part of the control's accessible name.
 */
export function Field({ label, hideLabel, hint, error: serverError, required, className, children }: FieldProps) {
  const id = useId();
  const [nativeError, setNativeError] = useState('');
  const error = serverError || nativeError;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const control = Children.only(children);
  // The browser's own checks (required, min, pattern and so on) show here instead of in a bubble.
  const onInvalid = (e: FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement;
    e.preventDefault();
    setNativeError(target.validationMessage);
    if (target.form?.querySelector(':invalid') === target) target.focus();
  };
  return (
    <div className={['field', className].filter(Boolean).join(' ')} onInvalidCapture={onInvalid} onChange={() => setNativeError('')}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}{required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
      {isValidElement(control) ? cloneElement(control, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : control}
      {hint && <span id={hintId} className="field__hint">{hint}</span>}
      {error && <span id={errorId} role="alert" className="field__error">{error}</span>}
    </div>
  );
}

type FieldBits = Pick<FieldProps, 'label' | 'hideLabel' | 'hint' | 'error'> & { fieldClassName?: string };

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldBits {}

/** Text input with a label. Pass type and inputMode for the right phone keyboard. */
export function Input({ label, hideLabel, hint, error, fieldClassName, required, className, ...rest }: InputProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} required={required} className={fieldClassName}>
      <input {...rest} required={required} className={['control', className].filter(Boolean).join(' ')} />
    </Field>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldBits {}

export function Textarea({ label, hideLabel, hint, error, fieldClassName, required, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} required={required} className={fieldClassName}>
      <textarea {...rest} required={required} className={['control', 'control--area', className].filter(Boolean).join(' ')} />
    </Field>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label: ReactNode; hint?: ReactNode }

export function Checkbox({ label, hint, className, ...rest }: CheckboxProps) {
  return (
    <label className={['check', className].filter(Boolean).join(' ')}>
      <input {...rest} type="checkbox" />
      <span>{label}{hint && <span className="field__hint check__hint">{hint}</span>}</span>
    </label>
  );
}
