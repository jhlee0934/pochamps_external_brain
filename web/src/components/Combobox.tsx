import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterOptions, type Option } from '../lib/data';

interface Props {
  options: Option[];
  value: string; // English name, '' for none
  onChange: (en: string) => void;
  placeholder?: string;
  label: string;
  allowEmpty?: boolean;
  renderIcon?: (o: Option) => React.ReactNode;
}

/** Searchable picker that shows Korean names and stores English ones. */
export function Combobox({ options, value, onChange, placeholder, label, allowEmpty = true, renderIcon }: Props) {
  const id = useId();
  const selected = useMemo(() => options.find((o) => o.en === value), [options, value]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => (open ? filterOptions(options, query) : []), [open, options, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (o: Option | undefined) => {
    if (o) onChange(o.en);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="combobox">
      <input
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        placeholder={placeholder ?? label}
        value={open ? query : (selected?.ko ?? value)}
        onFocus={(e) => {
          setOpen(true);
          setQuery('');
          e.currentTarget.select();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {allowEmpty && value && !open && (
        <button type="button" className="combobox-clear" aria-label={`${label} 지우기`} onClick={() => onChange('')}>
          ×
        </button>
      )}
      {open && results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="combobox-list" ref={listRef}>
          {results.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {renderIcon?.(o)}
              <span className="combobox-name">{o.ko}</span>
              {o.ko !== o.en && <span className="combobox-en">{o.en}</span>}
              {o.hint && <span className="combobox-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
