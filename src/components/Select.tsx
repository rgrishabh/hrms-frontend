import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { Field, type FieldProps } from './Input';
import './Select.css';

export interface SelectOption { value: string; label: string; disabled?: boolean }

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Pick<FieldProps, 'label' | 'hideLabel' | 'hint' | 'error'> {
  options?: readonly SelectOption[];
  /** First empty option, for "All branches" or "Select…". */
  placeholder?: string;
  fieldClassName?: string;
  children?: ReactNode;
}

/** A native select: the phone's own picker, built-in keyboard support, and Playwright's selectOption. */
export function Select({ label, hideLabel, hint, error, options, placeholder, fieldClassName, required, className, children, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...rest }: SelectProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} required={required} className={fieldClassName}>
      <SelectControl {...rest} id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} className={className}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        {children}
      </SelectControl>
    </Field>
  );
}

function SelectControl({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select">
      <select {...rest} className={['control', 'select__control', className].filter(Boolean).join(' ')}>{children}</select>
      <ChevronDown className="select__chevron" aria-hidden="true" />
    </span>
  );
}
