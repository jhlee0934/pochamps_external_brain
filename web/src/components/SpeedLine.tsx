// The speed line: my Pokemon against the meta sample, one line per speed value. Shared by the party
// page (top 30/50/100) and the speed-line page (whole ladder); only the sample ranges differ.
import { useMemo } from 'react';
import { ko, toID } from '../lib/data';
import { useStoredState } from '../lib/hooks';
import { FORMAT_OPTIONS, roleLabel, setupsOf, SETUP_MIN_PCT, SETUP_TOP, useMetaFormat, useMetaTargets, type MetaTarget } from '../lib/meta';
import { battleSpecies, effectiveSpeed, groupBySpeed, setupName, SPEED_SETUP, type PokemonSet } from '../lib/sets';
import { Loading, Segmented, Sprite } from './ui';

interface SpeedEntry {
  set: PokemonSet;
  mine: boolean;
  speed: number;
  /** Choice Scarf usage % when this row is the scarf variant of a meta Pokemon. */
  scarfPct?: number | null;
  role?: MetaTarget['role'];
  custom?: boolean;
  /** Set when this row is a meta Pokemon after a speed-raising move or ability. */
  boost?: { move: string; stages: number; pct: number | null };
}

const SCARF = 'Choice Scarf';
// A scarf row needs the scarf in the top 5 items and at least this usage %.
const SCARF_TOP = 5;
const SCARF_MIN_PCT = 5;

interface MetaSpeedRow {
  set: PokemonSet;
  role?: MetaTarget['role'];
  custom?: boolean;
  scarfRow?: { set: PokemonSet; pct: number | null };
  setups: { move: string; stages: number; pct: number | null }[];
}

/** A sample range: a top-N count, or the whole ladder. */
export type SpeedRange = '30' | '50' | '100' | 'all';

const RANGE_LABEL: Record<SpeedRange, string> = { '30': '상위 30', '50': '상위 50', '100': '상위 100', all: '전체' };

function SpeedChip({ r }: { r: SpeedEntry }) {
  const scarf = toID(r.set.item) === 'choicescarf';
  // A custom scarf sample is both: dashed custom outline and scarf chip.
  const kinds = [r.mine && 'mine', r.boost && 'boost', scarf && 'scarf', r.custom && 'custom'].filter(Boolean).join(' ');
  return (
    <span className={`speed-mon ${kinds}`}>
      <Sprite species={battleSpecies(r.set)} size={28} />
      <span>
        {ko('species', battleSpecies(r.set))}
        {roleLabel(r)}
        {scarf && <span className="chip small scarf">스카프{r.scarfPct != null && ` ${r.scarfPct}%`}</span>}
        {r.boost && (
          <span className="chip small boost">
            {setupName(r.boost.move)} +{r.boost.stages}
            {r.boost.pct != null && ` · ${r.boost.pct}%`}
          </span>
        )}
        {r.custom && <span className="chip small custom">커스텀</span>}
        {r.mine && <span className="chip small accent">내 파티</span>}
      </span>
    </span>
  );
}

export function SpeedLine({
  members,
  ranges,
  rangeKey,
  defaultRange,
}: {
  members: PokemonSet[];
  /** Sample ranges offered, in order. */
  ranges: SpeedRange[];
  /** Storage key for the chosen range, so each page keeps its own. */
  rangeKey: string;
  defaultRange: SpeedRange;
}) {
  const [showScarf, setShowScarf] = useStoredState('pochamps.speed.scarf', true);
  // Setup moves are off by default: one row per move per Pokemon adds up quickly.
  const [setupOn, setSetupOn] = useStoredState<string[]>('pochamps.speed.setup', []);
  const [storedRange, setRange] = useStoredState<SpeedRange>(rangeKey, defaultRange);
  const range = ranges.includes(storedRange) ? storedRange : defaultRange;
  const [format, setFormat] = useMetaFormat();
  const targets = useMetaTargets(range === 'all' ? Infinity : Number(range), format);
  // Base rows exclude Scarf, including when it is the most popular item.
  // The toggle adds every Scarf row; setup rows use the same unscarfed base.
  const meta = useMemo(() => {
    if (!targets.data) return { data: undefined };
    // Builds of one ladder entry share its usage; each custom sample stands alone.
    const groups = new Map<string, MetaTarget[]>();
    for (const t of targets.data) {
      const group = t.custom ? t.key : String(t.rank);
      groups.set(group, [...(groups.get(group) ?? []), t]);
    }
    const rows: MetaSpeedRow[] = [];
    for (const forms of groups.values()) {
      const { usage } = forms[0];
      const scarf = forms[0].custom
        ? undefined
        : usage.items.slice(0, SCARF_TOP).find((i) => i.name === SCARF && (i.pct ?? 0) >= SCARF_MIN_PCT);
      const setups = setupsOf(forms[0])
        .filter((s) => SPEED_SETUP[toID(s.move)])
        .map((s) => ({ ...s, stages: SPEED_SETUP[toID(s.move)] }));
      const hasScarf = forms.some((f) => f.set.item === SCARF);
      forms.forEach((f, i) => {
        // A custom sample keeps the item it was written with, Scarf included, whatever the toggle.
        const isScarf = f.set.item === SCARF && !f.custom;
        rows.push({
          set: isScarf ? { ...f.set, item: '' } : f.set,
          role: f.role,
          custom: f.custom,
          scarfRow: isScarf
            ? { set: f.set, pct: usage.items.find((item) => item.name === SCARF)?.pct ?? null }
            : i === 0 && scarf && !hasScarf ? { set: { ...f.set, item: SCARF }, pct: scarf.pct } : undefined,
          setups,
        });
      });
    }
    return { data: rows };
  }, [targets.data]);

  // Setup moves seen in the sample, with how many Pokemon qualify for each.
  const setupMoves = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of meta.data ?? []) for (const s of r.setups) counts.set(s.move, (counts.get(s.move) ?? 0) + 1);
    // Counts rows, so a Pokemon with two forms counts twice; that matches the rows the toggle adds.
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [meta.data]);

  // One line per speed value; Pokemon at the same speed sit side by side, my party first.
  const lines = useMemo(() => {
    const out: SpeedEntry[] = members.map((m) => ({ set: m, mine: true, speed: effectiveSpeed(m) ?? 0 }));
    for (const r of meta.data ?? []) {
      const base = { mine: false, role: r.role, custom: r.custom };
      out.push({ ...base, set: r.set, speed: effectiveSpeed(r.set) ?? 0 });
      if (showScarf && r.scarfRow) {
        out.push({ ...base, set: r.scarfRow.set, speed: effectiveSpeed(r.scarfRow.set) ?? 0, scarfPct: r.scarfRow.pct });
      }
      for (const s of r.setups) {
        if (!setupOn.includes(s.move)) continue;
        out.push({ ...base, set: r.set, speed: effectiveSpeed(r.set, true, s.stages) ?? 0, boost: s });
      }
    }
    return groupBySpeed(out);
  }, [members, meta.data, showScarf, setupOn]);

  const scarfCount = (meta.data ?? []).filter((r) => r.scarfRow).length;
  const toggleSetup = (move: string) =>
    setSetupOn(setupOn.includes(move) ? setupOn.filter((m) => m !== move) : [...setupOn, move]);

  return (
    <>
      <div className="speed-head">
        <div className="toggle-row">
          <span className="toggle-label">샘플</span>
          <Segmented label="배틀 형식" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
          <Segmented
            label="메타 샘플 범위"
            value={range}
            onChange={setRange}
            options={ranges.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          />
        </div>
        <div className="toggle-row">
          <span className="toggle-label">도구</span>
          <button
            type="button"
            className={showScarf ? 'toggle-btn active' : 'toggle-btn'}
            aria-pressed={showScarf}
            onClick={() => setShowScarf(!showScarf)}
          >
            구애스카프 {meta.data && <span className="auto-tag">{scarfCount}</span>}
          </button>
        </div>
        {setupMoves.length > 0 && (
          <div className="toggle-row">
            <span className="toggle-label">랭업기</span>
            {setupMoves.map(([move, n]) => (
              <button
                type="button"
                key={move}
                className={setupOn.includes(move) ? 'toggle-btn active' : 'toggle-btn'}
                aria-pressed={setupOn.includes(move)}
                onClick={() => toggleSetup(move)}
                title={`스피드 +${SPEED_SETUP[toID(move)]}랭크 · 해당 ${n}마리`}
              >
                {setupName(move)} <span className="auto-tag">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {targets.loading && (
        <Loading label={range === 'all' ? '메타 전체 세팅을 불러오는 중… (처음 한 번은 시간이 걸립니다)' : `메타 상위 ${range}마리 세팅을 불러오는 중…`} />
      )}
      <ol className="speed-line">
        {lines.map((line) => (
          <li key={line.speed} className={line.entries.some((e) => e.mine) ? 'mine' : ''}>
            <span className="speed-value">{line.speed}</span>
            <span className="speed-mons">
              {line.entries.map((e, i) => (
                <SpeedChip key={i} r={e} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="fine">
        같은 스피드의 포켓몬은 한 줄에 나란히 표시합니다. 메타 기본 줄은 인기 성격·SP·도구에서 구애스카프 배율을 제외한 스피드입니다.
        구애스카프 버튼을 켜면 원래 스카프 세팅과 도구 상위 {SCARF_TOP}위 안이면서 채용률 {SCARF_MIN_PCT}% 이상인 스카프 세팅을 따로
        표시합니다. 내 파티와 커스텀 샘플의 도구는 항상 반영합니다. 랭업기는 스카프 없이 기술을 1회 사용한(특성은 1회 발동한) 기준이며, 기술 상위{' '}
        {SETUP_TOP}위 안이면서 채용률 {SETUP_MIN_PCT}% 이상인 포켓몬(커스텀 샘플은 기술에 있으면)만 추가로 표시합니다(버튼 옆 숫자는 해당
        마릿수, 칩 옆 숫자는 채용률). 날씨 특성·순풍 등은 반영하지 않았습니다.
      </p>
    </>
  );
}
