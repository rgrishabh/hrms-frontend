import { api, qs } from '../../api';
import type { PickerItem } from '../../components/Picker';
import { CASES_URL } from './types';

/** Active users, by name only, for choosing a handler or a committee member. */
export async function searchPeople(text: string): Promise<PickerItem[]> {
  const r = await api.get<{ items: { id: string; display_name: string }[] }>(`${CASES_URL}/people${qs({ search: text || undefined })}`);
  return r.items.map((u) => ({ id: u.id, label: u.display_name }));
}
