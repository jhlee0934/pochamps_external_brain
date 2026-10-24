import { natureRole, roleBuild, spreadRole } from '@shared/calc/roles';
import { getUsage, ko, usageKey } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { formatKo, useMetaFormat } from '../lib/meta';
import { sameSp, spShort, type PokemonSet } from '../lib/sets';

/**
 * The ladder's most used SP spreads as one-click presets. A physical or special spread brings the
 * most used nature of that role with it, so a form switch (Mega Garchomp Z back to Garchomp) can be
 * set right in one click; a bulky spread keeps the current nature.
 */
export function SpreadPresets({ set, onChange }: { set: PokemonSet; onChange: (s: PokemonSet) => void }) {
  const [format] = useMetaFormat();
  const usage = useAsync(
    () => (set.species ? getUsage(usageKey(set.species), format) : Promise.resolve(undefined)),
    [set.species, format],
  );
  const spreads = usage.data?.spreads.filter((s) => s.sp) ?? [];
  if (!spreads.length) return null;

  const presets = spreads.map((s) => {
    const role = spreadRole(s.sp);
    const nature = role ? roleBuild(usage.data!, role).nature : '';
    return { ...s, role, nature: nature && natureRole(nature) === role ? nature : '' };
  });

  return (
    <div className="sp-presets">
      <div className="sp-head">
        <span>사용률 SP 배분 ({formatKo(format)})</span>
        <span className="muted small">누르면 SP와 같은 유형의 인기 성격을 적용</span>
      </div>
      <div className="sp-preset-list">
        {presets.map((p, i) => {
          const active = sameSp(p.sp, set.sp) && (!p.nature || p.nature === set.nature);
          return (
            <button
              type="button"
              key={i}
              className={active ? 'toggle-btn active' : 'toggle-btn'}
              aria-pressed={active}
              onClick={() => onChange({ ...set, sp: p.sp, nature: p.nature || set.nature })}
              title={p.nature ? `${spShort(p.sp)} · ${ko('natures', p.nature)}` : `${spShort(p.sp)} · 성격 유지`}
            >
              {spShort(p.sp)}
              {p.nature && <span className="chip small">{ko('natures', p.nature)}</span>}
              {p.pct != null && <span className="auto-tag">{p.pct}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
