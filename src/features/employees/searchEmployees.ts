import { api, qs } from '../../api';
import type { PickerItem } from '../../components/Picker';

export interface EmployeeHit { id: string; first_name: string; last_name: string | null; employee_code: string; status?: string; designation?: string | null }

export const employeeName = (e: { first_name: string; last_name?: string | null }) => `${e.first_name} ${e.last_name ?? ''}`.trim();
export const toPickerItem = (e: EmployeeHit): PickerItem => ({ id: e.id, label: employeeName(e), description: e.employee_code });

export async function searchEmployees(text: string, status?: string): Promise<PickerItem[]> {
  const r = await api.get<{ items: EmployeeHit[] }>(`/api/v1/employees${qs({ search: text || undefined, status, pageSize: 20 })}`);
  return r.items.map(toPickerItem);
}
