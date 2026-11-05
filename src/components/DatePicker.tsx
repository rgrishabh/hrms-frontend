import type { InputHTMLAttributes } from 'react';
import { Input } from './Input';
import type { FieldProps } from './Input';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, Pick<FieldProps, 'label' | 'hideLabel' | 'hint' | 'error'> {
  /** 'date' gives YYYY-MM-DD, 'datetime' the browser's local date and time, 'month' YYYY-MM. */
  mode?: 'date' | 'datetime' | 'month';
  fieldClassName?: string;
}

const TYPE = { date: 'date', datetime: 'datetime-local', month: 'month' } as const;

/**
 * A native date input. The phone's calendar wheel, locale-aware display, keyboard entry and form
 * validation come from the browser, and the value is always ISO, so no business logic parses dates.
 * color-scheme on the theme keeps its popup in the right colours.
 */
export function DatePicker({ mode = 'date', ...rest }: DatePickerProps) {
  return <Input {...rest} type={TYPE[mode]} />;
}
