import { useEffect, useMemo, useState } from 'react';
import { ko, toID } from '../lib/data';
import { hitSummary, type MoveResult } from '../lib/calc';
import { useStoredState } from '../lib/hooks';
import { withEul, withRo } from '../lib/korean';
import {
  boostAffects,
  boostLabel,
  FORMAT_OPTIONS,
  formatKo,
  setupMoveCounts,
  SETUP_MIN_PCT,
  SETUP_TOP,
  targetName,
  useMetaFormat,
  useMetaTargets,
  withBoosted,
  type MetaTarget,
} from '../lib/meta';
import {
  battleSpecies,
  boostText,
  combineBoosts,
  effectiveSpeed,
  setupBoost,
  setupName,
  setupSourcesOf,
  SP_MAX_PER_STAT,
  SP_MAX_TOTAL,
  spTotal,
  type PokemonSet,
} from '../lib/sets';
import { useWorkerJob } from '../lib/workerJob';
import type { BenchmarkRequest, BenchmarkResult, BenchmarkRow } from '../workers/benchmark.worker';
import { Card, Loading, Segmented, Sprite } from './ui';

const createWorker = () => new Worker(new URL('../workers/benchmark.worker.ts', import.meta.url), { type: 'module' });

// Offense: 0 = guaranteed OHKO … 4 = 3HKO or worse.
function offTier(r: MoveResult | undefined): number {
  if (!r?.hits) return 4;
  const sure = r.koText?.startsWith('guaranteed');
  if (r.hits === 1) return sure ? 0 : 1;
  if (r.hits === 2) return sure ? 2 : 3;
  return 4;
}

// Bulk against the target's strongest move.
type DefTier = 'ko' | 'chance' | 'safe';
function defTier(r: MoveResult | undefined): DefTier {
  if (r?.hits !== 1) return 'safe';
  return r.koText?.startsWith('guaranteed') ? 'ko' : 'chance';
}

// A boosted target reads "망나뇽(용의춤)" so it never looks like the plain one.
const monName = (t: MetaTarget) => `${targetName(t)}${t.boost ? `(${setupName(t.boost.move)})` : ''}`;
const withNature = (t: MetaTarget) => `${t.set.nature ? `${ko('natures', t.set.nature)} ` : ''}${monName(t)}`;

interface Change {
  rank: number;
  good: boolean;
  text: string;
}

function diff(
  targets: Map<string, MetaTarget>,
  base: BenchmarkResult,
  cur: BenchmarkResult,
  baseSpeed: number,
  curSpeed: number,
  speeds: Map<string, number>,
): Change[] {
  const before = new Map(base.map((r) => [r.key, r]));
  const out: Change[] = [];
  for (const now of cur) {
    const prev = before.get(now.key);
    const t = targets.get(now.key);
    if (!prev || !t) continue;
    const b = offTier(prev.offense);
    const c = offTier(now.offense);
    const move = now.offense ? ko('moves', now.offense.move) : '';
    if (!boostAffects(t, 'offense')) {
      // Same numbers as the plain target, already reported there.
    } else if (c === 0 && b !== 0) out.push({ rank: t.rank, good: true, text: `${withRo(move)} ${monName(t)} 확정 1타` });
    else if (b === 0 && c !== 0) out.push({ rank: t.rank, good: false, text: `${monName(t)} 확정 1타 놓침` });
    else if (c === 2 && b > 2) out.push({ rank: t.rank, good: true, text: `${withRo(move)} ${monName(t)} 확정 2타` });
    else if (b === 2 && c > 2) out.push({ rank: t.rank, good: false, text: `${monName(t)} 확정 2타 놓침` });

    const db = defTier(prev.defense);
    const dc = defTier(now.defense);
    const theirs = now.defense ? ko('moves', now.defense.move) : '';
    if (!boostAffects(t, 'defense')) {
      // Same numbers as the plain target, already reported there.
    } else if (dc === 'safe' && db !== 'safe') {
      out.push({ rank: t.rank, good: true, text: `${withNature(t)}의 ${withEul(theirs)} 확정으로 버팀` });
    } else if (db === 'safe' && dc !== 'safe') {
      out.push({ rank: t.rank, good: false, text: `${withNature(t)}의 ${theirs}에 ${dc === 'ko' ? '확정' : '난수'} 1타` });
    }

    const s = speeds.get(t.key) ?? 0;
    if (!boostAffects(t, 'speed')) {
      // Same speed as the plain target.
    } else if (curSpeed > s && baseSpeed <= s) out.push({ rank: t.rank, good: true, text: `${withNature(t)}(${s}) 추월` });
    else if (baseSpeed > s && curSpeed <= s) out.push({ rank: t.rank, good: false, text: `${withNature(t)}(${s})에게 추월당함` });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

const targetSpeed = (t: MetaTarget) => effectiveSpeed(t.set, true, t.boosts?.spe ?? 0) ?? 0;

/** Speed SP needed to outspeed `target` at `stages`, or undefined if 32 SP is not enough. */
function speedSpNeeded(set: PokemonSet, target: number, stages = 0): number | undefined {
  for (let v = set.sp.spe + 1; v <= SP_MAX_PER_STAT; v++) {
    const s = effectiveSpeed({ ...set, sp: { ...set.sp, spe: v } }, true, stages) ?? 0;
    if (s > target) return v;
  }
  return undefined;
}

// The icon and its outline already say which Pokemon (and boost) it is; the tooltip adds the numbers.
function MonIcon({ t, title }: { t: MetaTarget; title: string }) {
  const label = `${monName(t)}${t.boost ? ` ${boostLabel(t)}` : ''}: ${title}`;
  return (
    <span className={t.boost ? 'bench-mon boosted' : t.custom ? 'bench-mon custom' : 'bench-mon'} title={title} aria-label={label}>
      <Sprite species={battleSpecies(t.set)} size={28} />
    </span>
  );
}

/**
 * What the current SP spread achieves against the meta sample: KOs, survivals, speed tiers,
 * and what changed since the slot was opened. Calcs run in a worker, so sliders never stall.
 */
export function SpreadInsights({ set, baselineKey }: { set: PokemonSet; baselineKey: string }) {
  const [count, setCount] = useStoredState<'30' | '50'>('pochamps.bench.count', '30');
  const [format, setFormat] = useMetaFormat();
  const sample = useMetaTargets(Number(count), format);
  // Opponents' setup moves are off by default; each one adds a boosted copy of every target running it.
  const [setupOn, setSetupOn] = useStoredState<string[]>('pochamps.bench.setup', []);
  // My own setup moves: only those in my move slots, their stages added up.
  const [mySetupOn, setMySetupOn] = useStoredState<string[]>('pochamps.bench.mysetup', []);
  const mySetups = setupSourcesOf(set);
  const myActive = mySetups.filter((m) => mySetupOn.includes(m));
  const myActiveKey = myActive.join('|');
  const myBoosts = useMemo(() => combineBoosts(myActiveKey ? myActiveKey.split('|') : []), [myActiveKey]);
  const toggleMySetup = (move: string) =>
    setMySetupOn(mySetupOn.includes(move) ? mySetupOn.filter((m) => m !== move) : [...mySetupOn, move]);
  // Only moves that change attack or bulk; Speed-only ones live in the speed line.
  const setupMoves = useMemo(
    () => setupMoveCounts(sample.data ?? [], (b) => Object.keys(b).some((stat) => stat !== 'spe')),
    [sample.data],
  );
  const activeSetups = useMemo(() => setupOn.filter((m) => setupMoves.some(([move]) => move === m)), [setupOn, setupMoves]);
  const targetList = useMemo(() => sample.data && withBoosted(sample.data, activeSetups), [sample.data, activeSetups]);
  const targets = { ...sample, data: targetList };
  const toggleSetup = (move: string) =>
    setSetupOn(setupOn.includes(move) ? setupOn.filter((m) => m !== move) : [...setupOn, move]);
  const request = useMemo<BenchmarkRequest | null>(
    () => (set.species && targets.data ? { me: set, meBoosts: myBoosts, targets: targets.data } : null),
    [set, myBoosts, targets.data],
  );
  const { output, outputFor, pending, error } = useWorkerJob<BenchmarkRequest, BenchmarkResult>(createWorker, request);
  const current =
    outputFor?.me.species === set.species && outputFor.targets === targets.data && outputFor.meBoosts === myBoosts ? output : undefined;

  const byKey = useMemo(() => new Map((targets.data ?? []).map((t) => [t.key, t])), [targets.data]);
  const speeds = useMemo(
    () => new Map((targets.data ?? []).map((t) => [t.key, targetSpeed(t)])),
    [targets.data],
  );
  const myStages = myBoosts.spe ?? 0;
  const mySpeed = effectiveSpeed(set, true, myStages) ?? 0;

  // Baseline: the first result for this slot + species + setup toggles, until reset by hand. Toggling
  // a setup move starts a new baseline, so the list only shows what SP and set edits change.
  const key = `${baselineKey}|${myActiveKey}|${activeSetups.join('|')}`;
  const [baseline, setBaseline] = useState<{ key: string; rows: BenchmarkResult; speed: number } | null>(null);
  useEffect(() => {
    if (current && outputFor && baseline?.key !== key) {
      setBaseline({ key, rows: current, speed: effectiveSpeed(outputFor.me, true, outputFor.meBoosts?.spe ?? 0) ?? 0 });
    }
  }, [current, outputFor, baseline?.key, key]);

  const changes = useMemo(
    () =>
      current && baseline?.key === key ? diff(byKey, baseline.rows, current, baseline.speed, mySpeed, speeds) : [],
    [current, baseline, key, byKey, mySpeed, speeds],
  );

  if (!set.species) return null;

  const rows = (current ?? []).map((r) => ({ r, t: byKey.get(r.key)! })).filter((x) => x.t);
  // Each section only takes the boosted copies whose stages change its numbers.
  const offRows = rows.filter((x) => boostAffects(x.t, 'offense'));
  const defRows = rows.filter((x) => boostAffects(x.t, 'defense'));
  const speedRows = rows.filter((x) => boostAffects(x.t, 'speed'));
  const off = (tier: number) => offRows.filter((x) => offTier(x.r.offense) === tier);
  const def = (tier: DefTier) => defRows.filter((x) => defTier(x.r.defense) === tier);
  const offTitle = (x: { r: BenchmarkRow; t: MetaTarget }) => hitSummary(x.r.offense!, x.r.offensePower);
  const defTitle = (x: { r: BenchmarkRow; t: MetaTarget }) => hitSummary(x.r.defense!, x.r.defensePower);

  // Close calls worth a few SP either way.
  const edgeSafe = def('safe')
    .filter((x) => x.r.defense && x.r.defense.maxPercent >= 85)
    .sort((a, b) => b.r.defense!.maxPercent - a.r.defense!.maxPercent);
  const edgeKo = defRows
    .filter((x) => x.r.defense && defTier(x.r.defense) !== 'safe' && x.r.defense.minPercent < 115)
    .sort((a, b) => a.r.defense!.minPercent - b.r.defense!.minPercent);

  const faster = speedRows.filter((x) => mySpeed > (speeds.get(x.t.key) ?? 0)).length;
  const ties = speedRows.filter((x) => mySpeed === (speeds.get(x.t.key) ?? 0)).length;
  const nextSpeedTargets = [...new Set(speedRows.map((x) => speeds.get(x.t.key) ?? 0).filter((s) => s >= mySpeed))]
    .sort((a, b) => a - b)
    .slice(0, 3)
    .map((s) => ({ speed: s, sp: speedSpNeeded(set, s, myStages), mons: speedRows.filter((x) => speeds.get(x.t.key) === s).map((x) => x.t) }));
  const spareSp = SP_MAX_TOTAL - spTotal(set.sp);

  return (
    <Card
      title="SP 배분 효과"
      className="bench"
      actions={
        <div className="row gap">
          <Segmented label="배틀 형식" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
          <Segmented
            label="메타 샘플"
            value={count}
            onChange={setCount}
            options={[
              { value: '30', label: '상위 30' },
              { value: '50', label: '상위 50' },
            ]}
          />
        </div>
      }
    >
      <p className="fine bench-note">
        {formatKo(format)} 메타 상위 포켓몬의 인기 세팅(물리형·특수형별 인기 성격·SP·기술과 도구, 메가스톤이면 메가진화)을 샘플로, 지금 배분으로 누구를 잡고 누구의 공격을
        버티는지 보여줍니다. 기술·도구를 바꿔도 바로 다시 계산합니다. 포켓몬 상세에서 만든 커스텀 샘플도 함께 비교합니다.
      </p>
      <div className="toggle-rows">
        {mySetups.length > 0 && (
          <div className="toggle-row">
            <span className="toggle-label">내 랭업기</span>
            {mySetups.map((move) => (
              <button
                type="button"
                key={move}
                className={myActive.includes(move) ? 'toggle-btn active mine' : 'toggle-btn mine'}
                aria-pressed={myActive.includes(move)}
                onClick={() => toggleMySetup(move)}
                title={boostText(setupBoost(move)!)}
              >
                {setupName(move)}
              </button>
            ))}
            {myActive.length > 0 && <span className="chip small accent">내 랭크 {boostText(myBoosts)}</span>}
          </div>
        )}
        {setupMoves.length > 0 && (
          <div className="toggle-row">
            <span className="toggle-label">상대 랭업기</span>
            {setupMoves.map(([move, n]) => (
              <button
                type="button"
                key={move}
                className={setupOn.includes(move) ? 'toggle-btn active opponent' : 'toggle-btn opponent'}
                aria-pressed={setupOn.includes(move)}
                onClick={() => toggleSetup(move)}
                title={`${boostText(setupBoost(move)!)} · 해당 ${n}마리`}
              >
                {setupName(move)} <span className="auto-tag">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {myActive.length > 0 && (
        <p className="fine">
          내 랭업기는 1회씩 사용한 랭크(여러 개면 합산, 최대 ±6)를 내 공격·내구·스피드 계산 전체에 적용합니다.
        </p>
      )}
      {activeSetups.length > 0 && (
        <p className="fine">
          테두리가 강조된 아이콘은 상대가 랭업기를 1회 사용한 상태입니다(기술 상위 {SETUP_TOP}위 안이면서 채용률 {SETUP_MIN_PCT}% 이상인
          포켓몬, 커스텀 샘플은 기술에 있으면 포함). 랭크가 바뀐 능력치에 해당하는 항목에만 추가됩니다: 방어·특방이 오르면 공격,
          공격·특공이 오르면 내구, 스피드가 오르면 스피드 비교에 나옵니다(예: 칼춤은 내구에만, 껍질깨기는 모두).
        </p>
      )}
      {error && <p className="error-note">계산 중 오류가 났습니다: {error}</p>}
      {!error && (targets.loading || !current) && <Loading label={targets.loading ? '메타 샘플을 불러오는 중…' : '계산 중…'} />}

      {current && (
        <div className="bench-body" aria-busy={pending}>
          <section>
            <header className="bench-head">
              <h3>기준 대비 변화</h3>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setBaseline({ key, rows: current, speed: mySpeed })}
                disabled={!changes.length}
              >
                지금 배분을 기준으로
              </button>
            </header>
            {changes.length ? (
              <ul className="bench-changes">
                {changes.map((c, i) => (
                  <li key={i} className={c.good ? 'good' : 'bad'}>
                    <span aria-hidden>{c.good ? '＋' : '－'}</span> {c.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">슬롯을 연 시점의 배분과 결과가 같습니다. SP를 조정하면 여기 바로 표시됩니다.</p>
            )}
          </section>

          <section>
            <h3>공격</h3>
            {[
              { tier: 0, label: '확정 1타', cls: 'good' },
              { tier: 1, label: '난수 1타', cls: 'good-soft' },
              { tier: 2, label: '확정 2타', cls: 'even' },
            ].map(({ tier, label, cls }) => {
              const list = off(tier);
              return (
                <div key={tier} className="bench-row">
                  <span className={`bench-label ${cls}`}>
                    {label} <strong>{list.length}</strong>
                  </span>
                  <div className="bench-mons">
                    {list.map((x) => (
                      <MonIcon key={x.t.key} t={x.t} title={offTitle(x)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <section>
            <h3>내구 (상대의 가장 센 기술 기준)</h3>
            {[
              { tier: 'ko' as const, label: '확정 1타 당함', cls: 'bad' },
              { tier: 'chance' as const, label: '난수 1타 당함', cls: 'even' },
            ].map(({ tier, label, cls }) => {
              const list = def(tier);
              return (
                <div key={tier} className="bench-row">
                  <span className={`bench-label ${cls}`}>
                    {label} <strong>{list.length}</strong>
                  </span>
                  <div className="bench-mons">
                    {list.map((x) => (
                      <MonIcon key={x.t.key} t={x.t} title={defTitle(x)} />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="small">
              <span className="good strong">확정으로 버팀 {def('safe').length}마리</span>
              <span className="muted"> / {defRows.length}마리</span>
            </p>
            {(edgeSafe.length > 0 || edgeKo.length > 0) && (
              <ul className="bench-edges labeled">
                {edgeSafe.slice(0, 3).map((x) => (
                  <li key={`s${x.t.key}`}>
                    <span className="good">아슬아슬하게 버팀</span> {withNature(x.t)}의 {ko('moves', x.r.defense!.move)} 최대{' '}
                    {x.r.defense!.maxPercent}%
                  </li>
                ))}
                {edgeKo.slice(0, 3).map((x) => (
                  <li key={`k${x.t.key}`}>
                    <span className="bad">조금 모자람</span> {withNature(x.t)}의 {ko('moves', x.r.defense!.move)} 최소{' '}
                    {x.r.defense!.minPercent}%
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>스피드 {mySpeed}</h3>
            <p className="small">
              샘플 {speedRows.length}마리 중 <strong>{faster}마리</strong>보다 빠름{ties > 0 && `, ${ties}마리와 동속`}
            </p>
            {nextSpeedTargets.length > 0 && (
              <ul className="bench-edges with-icons">
                {nextSpeedTargets.map((n) => (
                  <li key={n.speed}>
                    <span className="bench-mons inline">
                      {n.mons.slice(0, 4).map((t) => (
                        <MonIcon key={t.key} t={t} title={`스피드 ${n.speed}`} />
                      ))}
                    </span>
                    <span>
                      {n.mons.slice(0, 2).map(withNature).join(', ')}
                      {n.mons.length > 2 && ` 외 ${n.mons.length - 2}`} ({n.speed}){' '}
                      {n.sp === undefined ? (
                        <span className="muted">— 스피드 SP로는 추월 불가</span>
                      ) : (
                        <>
                          — 스피드 SP <strong>{n.sp}</strong>이면 추월
                          {n.sp - set.sp.spe > spareSp && (
                            <span className="muted"> (다른 스탯에서 {n.sp - set.sp.spe - spareSp} 줄여야 함)</span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}
