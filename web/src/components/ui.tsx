import { useState, type ReactNode } from 'react';
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

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="type-badge" style={{ background: TYPE_COLOR[type] ?? 'var(--text-muted)' }}>
      {ko('types', type)}
    </span>
  );
}

export function Types({ types }: { types: string[] }) {
  return (
    <span className="types">
      {types.map((t) => (
        <TypeBadge key={t} type={t} />
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
