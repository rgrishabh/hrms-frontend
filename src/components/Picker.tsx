import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from './Button';
import { useDebouncedValue } from './hooks';
import { Field } from './Input';
import './Picker.css';

export interface PickerItem { id: string; label: string; description?: string }

export interface PickerProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  /** Identifies the data source in the query cache, such as 'employees'. */
  queryKey: string;
  /** Called with the debounced text, once it reaches minChars. */
  search: (text: string) => Promise<PickerItem[]>;
  minChars?: number;
  value: PickerItem | null;
  onChange: (item: PickerItem | null) => void;
}

/**
 * Search and pick one record from a large list: the WAI-ARIA combobox pattern. What is selected is
 * always visible, as a chip, so a form can never submit an id the user cannot see.
 */
export function Picker({ label, hint, error, required, placeholder, queryKey, search, minChars = 0, value, onChange }: PickerProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(text.trim());
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const enabled = open && debounced.length >= minChars;
  const results = useQuery({ queryKey: ['picker', queryKey, debounced], queryFn: () => search(debounced), enabled, staleTime: 30_000 });
  const items = enabled ? results.data ?? [] : [];

  const pick = (item: PickerItem) => { onChange(item); setText(''); setOpen(false); setActive(0); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = items[active]; if (open && item && debounced === text.trim() && !results.isFetching) pick(item); } // never a stale result
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); } // closes the list, not a surrounding dialog
  };

  if (value) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <div className="picker__chosen" role="group" aria-label={label}>
          <span className="grow"><span className="picker__name">{value.label}</span>{value.description && <span className="picker__description"> {value.description}</span>}</span>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Clear ${label}`} icon={<X aria-hidden="true" />} onClick={() => { onChange(null); requestAnimationFrame(() => input.current?.focus()); }} />
        </div>
        {hint && <span className="field__hint">{hint}</span>}
        {error && <span className="field__error">{error}</span>}
      </div>
    );
  }

  const status = results.isError ? 'Could not load results' : results.isFetching ? 'Searching…' : debounced.length < minChars ? `Type at least ${minChars} characters` : 'No matches';
  return (
    <div className="picker">
      <Field label={label} hint={hint} error={error} required={required}>
        <input
          ref={input}
          type="text"
          role="combobox"
          autoComplete="off"
          className="control"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          required={required}
          placeholder={placeholder}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </Field>
      {/* Mouse down selects before the input's blur closes the list. */}
      <ul id={listId} role="listbox" aria-label={label} className="picker__list" hidden={!open}>
        {items.map((item, i) => (
          <li key={item.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="picker__option" onMouseDown={(e) => { e.preventDefault(); pick(item); }} onMouseEnter={() => setActive(i)}>
            <span className="picker__name">{item.label}</span>
            {item.description && <span className="picker__description">{item.description}</span>}
          </li>
        ))}
        {!items.length && <li role="presentation" className="picker__status">{status}</li>}
      </ul>
    </div>
  );
}
