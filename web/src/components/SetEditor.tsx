import { useEffect, useId, useRef, useState } from 'react';
import {
  abilityOptionsFor,
  gen,
  getLearnset,
  getUsage,
  itemOptions,
  ko,
  learnsetOptions,
  natureOptions,
  speciesOptions,
  toID,
  usageKey,
} from '../lib/data';
import { useAsync } from '../lib/hooks';
import {
  commonSet,
  defaultAbility,
  megaForm,
  megaLabel,
  megaOptions,
  newSet,
  SP_MAX_PER_STAT,
  SP_MAX_TOTAL,
  spTotal,
  STAT_LABEL,
  STATS,
  statsOf,
  type PokemonSet,
} from '../lib/sets';
import { Combobox } from './Combobox';
import { Sprite, Types } from './ui';

export function SpEditor({ set, onChange, mega = true }: { set: PokemonSet; onChange: (s: PokemonSet) => void; mega?: boolean }) {
  const uid = useId();
  const total = spTotal(set.sp);
  const stats = statsOf(set, mega);
  const nature = set.nature ? gen.natures.get(toID(set.nature)) : undefined;
  // Each stat can only take what the 66-point total has left.
  const setSp = (stat: (typeof STATS)[number], raw: number) => {
    const room = SP_MAX_TOTAL - (total - set.sp[stat]);
    const v = Math.max(0, Math.min(SP_MAX_PER_STAT, room, Math.floor(raw) || 0));
    onChange({ ...set, sp: { ...set.sp, [stat]: v } });
  };
  return (
    <div className="sp-editor">
      <div className="sp-head">
        <span>스탯 포인트</span>
        <span className={total > SP_MAX_TOTAL ? 'sp-total over' : 'sp-total'}>
          {total} / {SP_MAX_TOTAL}
          {total < SP_MAX_TOTAL && ` · 남은 ${SP_MAX_TOTAL - total}`}
        </span>
      </div>
      {STATS.map((s) => {
        const mark = nature && nature.plus !== nature.minus ? (nature.plus === s ? 'up' : nature.minus === s ? 'down' : '') : '';
        return (
          <div className="sp-row" key={s}>
            <label htmlFor={`${uid}-${s}`} className={`sp-label ${mark}`}>
              {STAT_LABEL[s]}
              {mark === 'up' ? ' ↑' : mark === 'down' ? ' ↓' : ''}
            </label>
            <input
              id={`${uid}-${s}`}
              type="range"
              min={0}
              max={SP_MAX_PER_STAT}
              value={set.sp[s]}
              onChange={(e) => setSp(s, Number(e.target.value))}
              aria-label={`${STAT_LABEL[s]} SP`}
            />
            <input
              type="number"
              className="sp-num"
              min={0}
              max={SP_MAX_PER_STAT}
              value={set.sp[s]}
              onChange={(e) => setSp(s, Number(e.target.value))}
              aria-label={`${STAT_LABEL[s]} SP 값`}
            />
            <span className="sp-stat">{stats?.[s] ?? '–'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Picking a species and refilling it with the most used set (async, cancelled by a newer pick). */
export function useSetFiller(set: PokemonSet, onChange: (s: PokemonSet) => void) {
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState('');

  // The species the async fill below was started for; a slot switch or another pick cancels it.
  const latest = useRef(set.species);
  useEffect(() => {
    latest.current = set.species;
  }, [set.species]);

  const fillCommon = async (target = set.species) => {
    setFilling(true);
    setFillError('');
    try {
      const usage = await getUsage(usageKey(target));
      if (latest.current === target) onChange(commonSet(target, usage));
    } catch {
      if (latest.current === target) setFillError('이 포켓몬은 래더 데이터가 없어 기본값으로 두었습니다.');
    } finally {
      setFilling(false);
    }
  };

  // A new pick starts from the most used set; the user edits from there.
  const pickSpecies = (picked: string) => {
    latest.current = picked;
    onChange({ ...newSet(picked), ability: defaultAbility(picked) });
    void fillCommon(picked);
  };

  return { filling, fillError, fillCommon, pickSpecies };
}

/** Sprite, species picker, types and mega buttons. */
export function SetHeader({
  set,
  onChange,
  title,
  filler,
  actions,
}: {
  set: PokemonSet;
  onChange: (s: PokemonSet) => void;
  title?: string;
  filler: ReturnType<typeof useSetFiller>;
  actions?: React.ReactNode;
}) {
  const mega = megaForm(set);
  const megas = megaOptions(set.species);
  const species = set.species ? gen.species.get(toID(set.species)) : undefined;
  return (
    <div className="set-editor-head">
      {set.species ? <Sprite species={mega ?? set.species} size={56} /> : <span className="sprite-slot" />}
      <div className="grow">
        {(title || actions) && (
          <div className="set-head-top">
            {title && <div className="eyebrow">{title}</div>}
            {actions}
          </div>
        )}
        <Combobox
          label="포켓몬"
          options={speciesOptions()}
          value={set.species}
          allowEmpty={false}
          onChange={filler.pickSpecies}
          renderIcon={(o) => <Sprite species={o.en} size={28} />}
        />
        {species && (
          <div className="set-meta">
            <Types types={[...(gen.species.get(toID(mega ?? set.species))?.types ?? species.types)]} />
            {filler.filling && <span className="muted small">사용률 1위 세팅 불러오는 중…</span>}
          </div>
        )}
        {megas.length > 0 && (
          <div className="mega-toggle" role="group" aria-label="메가진화">
            {megas.map((m) => {
              const active = m.mega === mega;
              const label = megaLabel(m.mega);
              return (
                <button
                  type="button"
                  key={m.mega}
                  className={active ? 'mega-btn active' : 'mega-btn'}
                  aria-pressed={active}
                  title={`${ko('species', m.mega)} (${ko('items', m.stone)})`}
                  onClick={() => onChange({ ...set, item: active ? '' : m.stone })}
                >
                  <Sprite species={m.mega} size={24} />
                  메가{label && ` ${label}`}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SetEditor({
  set,
  onChange,
  title,
  showHeader = true,
}: {
  set: PokemonSet;
  onChange: (s: PokemonSet) => void;
  title?: string;
  /** Off when the page shows the species picker elsewhere (the calculator's top bar). */
  showHeader?: boolean;
}) {
  const filler = useSetFiller(set, onChange);
  const { filling, fillError, fillCommon } = filler;
  const learnset = useAsync(
    () => (set.species ? getLearnset(usageKey(set.species)) : Promise.resolve(undefined)),
    [set.species],
  );
  const moveOpts = learnsetOptions(learnset.data);
  const mega = megaForm(set);

  return (
    <div className="set-editor">
      {showHeader && <SetHeader set={set} onChange={onChange} title={title} filler={filler} />}

      {set.species && (
        <>
          <div className="field-grid">
            <label className="field">
              <span>도구</span>
              <Combobox label="도구" options={itemOptions()} value={set.item} onChange={(item) => onChange({ ...set, item })} />
            </label>
            <label className="field">
              <span>특성{mega && ' (메가진화)'}</span>
              {mega ? (
                // A mega has one fixed ability; the base ability stays stored for when mega is turned off.
                <input
                  className="input locked"
                  value={ko('abilities', defaultAbility(mega))}
                  readOnly
                  aria-label="메가진화 특성"
                  title="메가진화 후 특성은 고정입니다"
                />
              ) : (
                <Combobox
                  label="특성"
                  options={abilityOptionsFor(set.species)}
                  value={set.ability}
                  onChange={(ability) => onChange({ ...set, ability })}
                />
              )}
            </label>
            <label className="field">
              <span>성격</span>
              <Combobox label="성격" options={natureOptions()} value={set.nature} onChange={(nature) => onChange({ ...set, nature })} />
            </label>
          </div>

          <div className="moves-grid">
            {set.moves.map((m, i) => (
              <label className="field" key={i}>
                <span>기술 {i + 1}</span>
                <Combobox
                  label={`기술 ${i + 1}`}
                  options={moveOpts}
                  value={m}
                  onChange={(move) => onChange({ ...set, moves: set.moves.map((x, j) => (j === i ? move : x)) })}
                />
              </label>
            ))}
          </div>

          <SpEditor set={set} onChange={onChange} />

          <div className="row gap">
            <button type="button" className="btn" onClick={() => fillCommon()} disabled={filling}>
              {filling ? '불러오는 중…' : '사용률 1위 세팅으로 되돌리기'}
            </button>
            {fillError && <span className="muted">{fillError}</span>}
          </div>
          <p className="fine">
            사용률 1위 세팅은 기술·도구·성격·SP를 항목별로 따로 고른 값이라 실제로 쓰이는 조합과 다를 수 있습니다.
          </p>
        </>
      )}
    </div>
  );
}
