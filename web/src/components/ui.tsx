import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Format } from '../lib/data';
import { ko, spriteUrl } from '../lib/data';
import { TYPE_COLOR } from '../lib/typechart';

export function Sprite({ species, variant = 'icon', size = 40 }: { species: string; variant?: 'icon' | 'art'; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = spriteUrl(species, variant);
  if (!url || failed) {
    return (
      <span className="sprite sprite-fallback" style={{ width: size, height: size }} aria-hidden>
        {ko('species', species).slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className="sprite"
      src={url}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Meta ranking filtered by `type`; without a format the meta page keeps the stored one. */
export const typeSearchUrl = (type: string, format?: Format) =>
  `/?type=${encodeURIComponent(type)}${format ? `&format=${format}` : ''}`;

/**
 * A type badge links to the meta ranking filtered by that type. `link={false}` only where the badge
 * already sits inside a control of its own (the meta page's type filter buttons).
 */
export function TypeBadge({ type, format, link = true }: { type: string; format?: Format; link?: boolean }) {
  const style = { background: TYPE_COLOR[type] ?? 'var(--text-muted)' };
  if (!link) {
    return (
      <span className="type-badge" style={style}>
        {ko('types', type)}
      </span>
    );
  }
  return (
    <Link
      to={typeSearchUrl(type, format)}
      className="type-badge type-link"
      style={style}
      title={`${ko('types', type)} 타입 메타 보기`}
    >
      {ko('types', type)}
    </Link>
  );
}

export function Types({ types, format }: { types: string[]; format?: Format }) {
  return (
    <span className="types">
      {types.map((t) => (
        <TypeBadge key={t} type={t} format={format} />
      ))}
    </span>
  );
}

export function PctBar({ pct, tone = 'accent' }: { pct: number | null | undefined; tone?: 'accent' | 'good' | 'bad' }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <span className={`pct-bar tone-${tone}`} aria-hidden>
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <p className="muted loading">{label}</p>;
}

export function ErrorNote({ error }: { error: Error | undefined }) {
  if (!error) return null;
  return <p className="error-note">데이터를 불러오지 못했습니다: {error.message}</p>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
