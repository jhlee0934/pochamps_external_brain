import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CONDITIONAL_DOUBLE, LAST_RESPECTS_DEFAULT_FAINTED, type Stacks } from '@shared/calc/champions';
import { categoryKo, getUsage, ko, toID, usageKey } from '../lib/data';
import { autoWeather, battleAbility, calcMoves, koTextKo, type AutoWeather, type CalcField, type FieldInput } from '../lib/calc';
import { useStoredState } from '../lib/hooks';
import { useParty } from '../lib/party';
import {
  activeSetups,
  boostText,
  combineBoosts,
  commonSet,
  isMegaForm,
  megaForm,
  newSet,
  normalizeSet,
  SETUP_BOOSTS,
  setupMovesOf,
  STAT_LABEL,
  withSetups,
  type PokemonSet,
  type SideExtras,
} from '../lib/sets';
import { MetaCoverage } from '../components/MetaCoverage';
import { SetEditor, SetHeader, useSetFiller } from '../components/SetEditor';
import { Card, TypeBadge } from '../components/ui';

interface CalcState {
  attacker: PokemonSet;
  defender: PokemonSet;
  aExtras: SideExtras;
  dExtras: SideExtras;
  field: CalcField;
  isCrit: boolean;
}

const initial: CalcState = {
  attacker: newSet('Garchomp'),
  defender: newSet('Primarina'),
  aExtras: { mega: true },
  dExtras: { mega: true },
  field: {},
  isCrit: false,
};

// Also recognizes empty defaults saved by versions that did not load initial usage.
function isEmptyDefault(set: PokemonSet, side: 'attacker' | 'defender') {
  return set.species === initial[side].species && !set.item && !set.ability && !set.nature &&
    set.moves.every((move) => !move) && Object.values(set.sp).every((points) => points === 0);
}

const BOOST_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
const STATUS: { value: string; label: string }[] = [
  { value: '', label: '정상' },
  { value: 'brn', label: '화상' },
  { value: 'par', label: '마비' },
  { value: 'psn', label: '독' },
  { value: 'tox', label: '맹독' },
  { value: 'slp', label: '잠듦' },
  { value: 'frz', label: '얼음' },
];

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="stepper-label">{label}</span>
      <button type="button" className="btn btn-small" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`${label} 줄이기`}>
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" className="btn btn-small" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} 늘리기`}>
        +
      </button>
    </div>
  );
}

/** Stack inputs, shown only when the set has a move, ability or item that uses them. */
function StacksEditor({ set, extras, onChange }: { set: PokemonSet; extras: SideExtras; onChange: (e: SideExtras) => void }) {
  const moves = new Set<string>(set.moves.map(toID));
  const ability = toID(battleAbility(set, extras));
  const stacks = extras.stacks ?? {};
  const put = (p: Partial<Stacks>) => onChange({ ...extras, stacks: { ...stacks, ...p } });
  const conditional = set.moves.filter((m) => CONDITIONAL_DOUBLE.has(toID(m)));
  const rows = [
    moves.has('ragefist') && (
      <Stepper key="hit" label="맞은 횟수 (분노의주먹)" value={stacks.hitsTaken ?? 0} max={6} onChange={(hitsTaken) => put({ hitsTaken })} />
    ),
    (moves.has('lastrespects') || ability === 'supremeoverlord') && (
      <Stepper
        key="faint"
        label={`쓰러진 아군 (${[moves.has('lastrespects') && '성묘', ability === 'supremeoverlord' && '총대장'].filter(Boolean).join('·')})`}
        value={stacks.alliesFainted ?? (moves.has('lastrespects') ? LAST_RESPECTS_DEFAULT_FAINTED : 0)}
        max={5}
        onChange={(alliesFainted) => put({ alliesFainted })}
      />
    ),
    toID(set.item) === 'metronome' && (
      <Stepper key="metro" label="연속 사용 (메트로놈)" value={stacks.metronomeUses ?? 0} max={5} onChange={(metronomeUses) => put({ metronomeUses })} />
    ),
    conditional.length > 0 && (
      <label key="cond" className="check">
        <input type="checkbox" checked={!!stacks.conditionMet} onChange={(e) => put({ conditionMet: e.target.checked })} />
        위력 2배 조건 충족 ({conditional.map((m) => ko('moves', m)).join('·')})
      </label>
    ),
  ].filter(Boolean);
  if (!rows.length) return null;
  return <div className="stacks">{rows}</div>;
}

function ExtrasEditor({ set, extras, onChange }: { set: PokemonSet; extras: SideExtras; onChange: (e: SideExtras) => void }) {
  const mega = megaForm(set);
  // Ranks show hand-set + toggled setup stages; a pick sets the total, so the hand-set part absorbs the difference.
  const shown = withSetups(set, extras).boosts ?? {};
  const fromSetups = combineBoosts(activeSetups(set, extras));
  return (
    <div className="extras">
      <StacksEditor set={set} extras={extras} onChange={onChange} />
      {mega && (
        <label className="check">
          <input type="checkbox" checked={extras.mega ?? true} onChange={(e) => onChange({ ...extras, mega: e.target.checked })} />
          메가진화 상태로 계산 ({ko('species', mega)})
        </label>
      )}
      <div className="boosts">
        {BOOST_STATS.map((s) => (
          <label key={s} className="field small">
            <span>{STAT_LABEL[s]} 랭크</span>
            <select
              className="input"
              value={shown[s] ?? 0}
              onChange={(e) =>
                onChange({ ...extras, boosts: { ...extras.boosts, [s]: Number(e.target.value) - (fromSetups[s] ?? 0) } })
              }
            >
              {Array.from({ length: 13 }, (_, i) => i - 6).map((v) => (
                <option key={v} value={v}>
                  {v > 0 ? `+${v}` : v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="row gap wrap">
        <label className="field small">
          <span>상태이상</span>
          <select
            className="input"
            value={extras.status ?? ''}
            onChange={(e) => onChange({ ...extras, status: (e.target.value || undefined) as SideExtras['status'] })}
          >
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field small">
          <span>남은 HP %</span>
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            value={extras.curHpPercent ?? 100}
            onChange={(e) => onChange({ ...extras, curHpPercent: Math.max(1, Math.min(100, Number(e.target.value) || 100)) })}
          />
        </label>
      </div>
    </div>
  );
}

function PartyLoader({ onLoad }: { onLoad: (s: PokemonSet) => void }) {
  const { members } = useParty();
  if (!members.length) return null;
  return (
    <select className="input input-small" value="" onChange={(e) => e.target.value && onLoad(members[Number(e.target.value)])} aria-label="파티에서 불러오기">
      <option value="">파티에서 불러오기</option>
      {members.map((m, i) => (
        <option key={i} value={i}>
          {ko('species', m.species)}
        </option>
      ))}
    </select>
  );
}

/** Species picker (with mega buttons and party loader) for one side, shown at the top of the page. */
function SidePicker({ title, set, onChange }: { title: string; set: PokemonSet; onChange: (s: PokemonSet) => void }) {
  const filler = useSetFiller(set, onChange);
  return (
    <div className="side-picker">
      <SetHeader set={set} onChange={onChange} title={title} filler={filler} actions={<PartyLoader onLoad={onChange} />} />
      {filler.fillError && <p className="fine">{filler.fillError}</p>}
    </div>
  );
}

const FRESH_EXTRAS: SideExtras = { mega: true };

/** One button per setup move in the side's moves; shown only when it has any. */
function SetupToggles({ label, set, extras, onChange }: { label: string; set: PokemonSet; extras: SideExtras; onChange: (e: SideExtras) => void }) {
  const moves = setupMovesOf(set);
  if (!moves.length) return null;
  const on = activeSetups(set, extras);
  const toggle = (move: string) =>
    onChange({ ...extras, setups: on.includes(move) ? on.filter((m) => m !== move) : [...on, move] });
  return (
    <div className="toggle-row">
      <span className="toggle-label">{label} 랭업기</span>
      {moves.map((move) => (
        <button
          type="button"
          key={move}
          className={on.includes(move) ? 'toggle-btn active' : 'toggle-btn'}
          aria-pressed={on.includes(move)}
          onClick={() => toggle(move)}
          title={`1회 사용: ${boostText(SETUP_BOOSTS[toID(move)])}`}
        >
          {ko('moves', move)}
        </button>
      ))}
    </div>
  );
}

const STATUS_KO: Record<string, string> = { brn: '화상', par: '마비', psn: '독', tox: '맹독', slp: '잠듦', frz: '얼음' };

/** Non-default battle conditions of one side, as short Korean labels. */
function extrasLabels(set: PokemonSet, extras: SideExtras): string[] {
  const out: string[] = activeSetups(set, extras).map((m) => `${ko('moves', m)} 사용`);
  for (const [stat, v] of Object.entries(withSetups(set, extras).boosts ?? {})) {
    if (v) out.push(`${STAT_LABEL[stat as keyof typeof STAT_LABEL]} ${v > 0 ? '+' : ''}${v}`);
  }
  if (extras.status) out.push(STATUS_KO[extras.status]);
  if (extras.curHpPercent !== undefined && extras.curHpPercent < 100) out.push(`HP ${extras.curHpPercent}%`);
  if (megaForm(set) && extras.mega === false) out.push('메가진화 안 함');
  const st = extras.stacks ?? {};
  if (st.hitsTaken) out.push(`맞은 횟수 ${st.hitsTaken}`);
  // Last Respects already assumes two fainted allies, so only a different count is worth flagging.
  const faintDefault = set.moves.some((m) => toID(m) === 'lastrespects') ? LAST_RESPECTS_DEFAULT_FAINTED : 0;
  if (st.alliesFainted !== undefined && st.alliesFainted !== faintDefault) out.push(`쓰러진 아군 ${st.alliesFainted}`);
  if (st.metronomeUses) out.push(`메트로놈 ${st.metronomeUses}회`);
  if (st.conditionMet) out.push('위력 2배 조건');
  return out;
}

/** Ranks and other side conditions, shown above the results so they are never a hidden cause. */
function ConditionChips({ label, set, extras, onReset }: { label: string; set: PokemonSet; extras: SideExtras; onReset: () => void }) {
  const items = extrasLabels(set, extras);
  if (!items.length) return null;
  return (
    <div className="condition-chips">
      <span className="toggle-label">{label}</span>
      {items.map((t) => (
        <span key={t} className="chip small cond">
          {t}
        </span>
      ))}
      <button type="button" className="btn btn-small" onClick={onReset}>
        초기화
      </button>
    </div>
  );
}

export function CalcPage() {
  const [state, setState] = useStoredState<CalcState>('pochamps.calc.v1', initial);
  const location = useLocation();
  const navigate = useNavigate();
  const [initialSetError, setInitialSetError] = useState('');

  // Initial examples need the same usage fill as a species chosen in the picker.
  // Keep the original object reference so a late response cannot replace user edits.
  useEffect(() => {
    let active = true;
    const incoming = location.state as Partial<Pick<CalcState, 'attacker' | 'defender'>> | null;
    for (const side of ['attacker', 'defender'] as const) {
      const original = state[side];
      if (incoming?.[side] || !isEmptyDefault(original, side)) continue;
      void getUsage(usageKey(original.species)).then(
        (usage) => {
          if (!active) return;
          const filled = commonSet(original.species, usage);
          setState((current) => current[side] === original ? { ...current, [side]: filled } : current);
        },
        () => {
          if (active) setInitialSetError('기본 인기 세팅을 불러오지 못했습니다. 아래 세부 설정의 “사용률 1위 세팅으로 되돌리기”로 다시 시도해 주세요.');
        },
      );
    }
    return () => { active = false; };
    // Only initialize on entry. Later selections and edits are handled by the set editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState]);

  // Sets handed over from other pages (Pokemon detail, party, matchup).
  useEffect(() => {
    const incoming = location.state as Partial<Pick<CalcState, 'attacker' | 'defender'>> | null;
    if (incoming?.attacker || incoming?.defender) {
      // A set handed over starts clean: ranks, status and stacks left from earlier calcs don't carry over.
      setState((s) => ({
        ...s,
        attacker: incoming.attacker ?? s.attacker,
        defender: incoming.defender ?? s.defender,
        aExtras: incoming.attacker ? FRESH_EXTRAS : s.aExtras,
        dExtras: incoming.defender ? FRESH_EXTRAS : s.dExtras,
      }));
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate, setState]);

  // Mega forms are kept as base species + stone (also fixes inputs saved by older versions).
  useEffect(() => {
    if (isMegaForm(state.attacker.species) || isMegaForm(state.defender.species)) {
      setState((s) => ({ ...s, attacker: normalizeSet(s.attacker), defender: normalizeSet(s.defender) }));
    }
  }, [state.attacker.species, state.defender.species, setState]);

  const patch = (p: Partial<CalcState>) => setState((s) => ({ ...s, ...p }));
  // Picking another Pokemon for a side also clears that side's ranks, status and stacks.
  const setAttacker = (attacker: PokemonSet) =>
    setState((s) => ({ ...s, attacker, aExtras: attacker.species === s.attacker.species ? s.aExtras : FRESH_EXTRAS }));
  const setDefender = (defender: PokemonSet) =>
    setState((s) => ({ ...s, defender, dExtras: defender.species === s.defender.species ? s.dExtras : FRESH_EXTRAS }));
  const setField = (p: Partial<CalcField>) => setState((s) => ({ ...s, field: { ...s.field, ...p } }));
  // Ranks the calcs use: hand-set ranks plus toggled setup moves.
  const aExtras = useMemo(() => withSetups(state.attacker, state.aExtras), [state.attacker, state.aExtras]);
  const dExtras = useMemo(() => withSetups(state.defender, state.dExtras), [state.defender, state.dExtras]);
  const auto = autoWeather(state.field, state.attacker, aExtras, state.defender, dExtras);

  const results = useMemo(
    () => (state.attacker.species && state.defender.species ? calcMoves(state.attacker, aExtras, state.defender, dExtras, state.field, state.isCrit) : []),
    [state, aExtras, dExtras],
  );
  const reverse = useMemo(
    () => (state.attacker.species && state.defender.species ? calcMoves(state.defender, dExtras, state.attacker, aExtras, swapSides(state.field), state.isCrit) : []),
    [state, aExtras, dExtras],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>결정력 계산</h1>
          <p className="muted">챔피언스 규칙(Lv50, 개체값 31, SP)으로 계산합니다. 공격 측 기술 4개를 한 번에 보여줍니다.</p>
        </div>
      </div>

      <Card className="matchup-bar">
        {initialSetError && <p className="error-note" role="status">{initialSetError}</p>}
        <div className="matchup-sides">
          <SidePicker title="공격 측" set={state.attacker} onChange={setAttacker} />
          <button
            type="button"
            className="btn swap-btn"
            aria-label="공수 교대"
            title="공수 교대"
            onClick={() => patch({ attacker: state.defender, defender: state.attacker, aExtras: state.dExtras, dExtras: state.aExtras })}
          >
            ⇄
          </button>
          <SidePicker title="방어 측" set={state.defender} onChange={setDefender} />
        </div>
      </Card>

      <Card>
        <FieldBar state={state} auto={auto} setField={setField} setCrit={(isCrit) => patch({ isCrit })} />
      </Card>

      <Card title={`${ko('species', state.attacker.species) || '공격'} → ${ko('species', state.defender.species) || '방어'}`} className="results-card">
        <SetupToggles label="공격 측" set={state.attacker} extras={state.aExtras} onChange={(aExtras) => patch({ aExtras })} />
        <SetupToggles label="방어 측" set={state.defender} extras={state.dExtras} onChange={(dExtras) => patch({ dExtras })} />
        <ConditionChips label="공격 측" set={state.attacker} extras={state.aExtras} onReset={() => patch({ aExtras: FRESH_EXTRAS })} />
        <ConditionChips label="방어 측" set={state.defender} extras={state.dExtras} onReset={() => patch({ dExtras: FRESH_EXTRAS })} />
        <MoveResults results={results} empty="공격 측에 공격 기술을 넣으면 결과가 나옵니다." />
        {reverse.length > 0 && (
          <details className="reverse">
            <summary>반대 방향: {ko('species', state.defender.species)}의 공격</summary>
            <MoveResults results={reverse} empty="" />
          </details>
        )}
      </Card>

      <MetaCoverage
        attacker={state.attacker}
        extras={aExtras}
        field={state.field}
        isCrit={state.isCrit}
        onPick={(defender) => {
          patch({ defender, dExtras: FRESH_EXTRAS });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <div className="grid-2">
        <Card title={`공격 측 세부 설정 · ${ko('species', state.attacker.species) || '미선택'}`}>
          <SetEditor set={state.attacker} onChange={setAttacker} showHeader={false} spreadPresets />
          <ExtrasEditor set={state.attacker} extras={state.aExtras} onChange={(aExtras) => patch({ aExtras })} />
        </Card>
        <Card title={`방어 측 세부 설정 · ${ko('species', state.defender.species) || '미선택'}`}>
          <SetEditor set={state.defender} onChange={setDefender} showHeader={false} spreadPresets />
          <ExtrasEditor set={state.defender} extras={state.dExtras} onChange={(dExtras) => patch({ dExtras })} />
        </Card>
      </div>

    </>
  );
}

const WEATHERS: { value: NonNullable<FieldInput['weather']>; label: string }[] = [
  { value: 'Sun', label: '☀ 쾌청' },
  { value: 'Rain', label: '☂ 비' },
  { value: 'Sand', label: '모래바람' },
  { value: 'Snow', label: '❄ 설경' },
];
const TERRAINS: { value: NonNullable<FieldInput['terrain']>; label: string }[] = [
  { value: 'Electric', label: '일렉트릭필드' },
  { value: 'Grassy', label: '그래스필드' },
  { value: 'Psychic', label: '사이코필드' },
  { value: 'Misty', label: '미스트필드' },
];

function Toggle({
  on,
  auto,
  onClick,
  children,
  label,
}: {
  on: boolean;
  auto?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  const cls = on ? 'toggle-btn active' : auto ? 'toggle-btn auto' : 'toggle-btn';
  return (
    <button type="button" className={cls} aria-pressed={on} onClick={onClick} title={label}>
      {children}
    </button>
  );
}

/** Field conditions as press-to-toggle buttons; pressing the active one turns it off. */
function FieldBar({
  state,
  auto,
  setField,
  setCrit,
}: {
  state: CalcState;
  auto: AutoWeather | undefined;
  setField: (p: Partial<CalcField>) => void;
  setCrit: (v: boolean) => void;
}) {
  const f = state.field;
  const autoOn = f.autoWeather !== false;
  return (
    <div className="field-bar">
      <div className="toggle-row">
        <span className="toggle-label">날씨</span>
        {WEATHERS.map((w) => (
          <Toggle
            key={w.value}
            on={f.weather === w.value}
            auto={auto?.weather === w.value}
            label={auto?.weather === w.value ? `${ko('abilities', auto.ability)} 특성으로 자동 적용 중` : undefined}
            onClick={() => setField({ weather: f.weather === w.value ? undefined : w.value })}
          >
            {w.label}
            {auto?.weather === w.value && <span className="auto-tag"> · {ko('abilities', auto.ability)}</span>}
          </Toggle>
        ))}
        <Toggle on={autoOn} onClick={() => setField({ autoWeather: !autoOn })} label="가뭄·잔비·모래날림·눈퍼뜨리기 등으로 생기는 날씨를 자동 적용">
          특성 날씨 자동
        </Toggle>
      </div>
      <div className="toggle-row">
        <span className="toggle-label">필드</span>
        {TERRAINS.map((t) => (
          <Toggle key={t.value} on={f.terrain === t.value} onClick={() => setField({ terrain: f.terrain === t.value ? undefined : t.value })}>
            {t.label}
          </Toggle>
        ))}
      </div>
      <div className="toggle-row">
        <span className="toggle-label">방어 측</span>
        <Toggle on={!!f.defenderReflect} onClick={() => setField({ defenderReflect: !f.defenderReflect })}>
          리플렉터
        </Toggle>
        <Toggle on={!!f.defenderLightScreen} onClick={() => setField({ defenderLightScreen: !f.defenderLightScreen })}>
          빛의장막
        </Toggle>
        <Toggle on={!!f.defenderStealthRock} onClick={() => setField({ defenderStealthRock: !f.defenderStealthRock })}>
          스텔스록
        </Toggle>
        {([1, 2, 3] as const).map((n) => (
          <Toggle key={n} on={f.defenderSpikes === n} onClick={() => setField({ defenderSpikes: f.defenderSpikes === n ? 0 : n })}>
            압정 {n}단
          </Toggle>
        ))}
      </div>
      <div className="toggle-row">
        <span className="toggle-label">공격</span>
        <Toggle on={state.isCrit} onClick={() => setCrit(!state.isCrit)}>
          급소
        </Toggle>
      </div>
      <p className="fine">스텔스록·압정 피해는 교체로 들어온 방어 측이 받는 것으로 보고 확정수에 포함합니다.</p>
    </div>
  );
}

// Screens and hazards belong to whoever is defending, so the reverse calc keeps none of them.
function swapSides(field: CalcField): CalcField {
  return { weather: field.weather, terrain: field.terrain, autoWeather: field.autoWeather };
}

function MoveResults({ results, empty }: { results: ReturnType<typeof calcMoves>; empty: string }) {
  if (!results.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="move-results">
      {results.map((r) => (
        <li key={r.move}>
          <div className="move-head">
            {r.type && <TypeBadge type={r.type} />}
            <strong>{ko('moves', r.move)}</strong>
            <span className="muted small">{categoryKo(r.category)}</span>
            <span className="grow" />
            {!r.error && (
              <span className={`ko-text ${r.hits === 1 ? 'good' : ''}`}>
                {koTextKo(r.koText)}
              </span>
            )}
          </div>
          {r.error ? (
            <p className="error-note">{r.error}</p>
          ) : (
            <>
              <div className="dmg-row">
                <span className="dmg-range" aria-hidden>
                  <span className="dmg-min" style={{ width: `${Math.min(100, r.minPercent)}%` }} />
                  <span className="dmg-max" style={{ width: `${Math.min(100, r.maxPercent)}%` }} />
                </span>
                <span className="dmg-pct">
                  {r.minPercent} – {r.maxPercent}%
                </span>
              </div>
              {r.note && <p className="field-note">{r.note}</p>}
              <p className="desc">{r.description}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

