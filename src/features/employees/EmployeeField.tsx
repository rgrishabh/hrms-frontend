import { Picker, type PickerItem } from '../../components/Picker';
import { searchEmployees } from './searchEmployees';

export interface EmployeeFieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Only employees with this status, such as 'active'. */
  status?: string;
  value: PickerItem | null;
  onChange: (item: PickerItem | null) => void;
}

/** The one employee picker. What is selected is always visible, so a form cannot submit a hidden id. */
export function EmployeeField({ label = 'Employee', hint, error, required, status, value, onChange }: EmployeeFieldProps) {
  return <Picker label={label} hint={hint} error={error} required={required} placeholder="Search name or code" queryKey={`employees:${status ?? 'any'}`} search={(t) => searchEmployees(t, status)} value={value} onChange={onChange} />;
}
