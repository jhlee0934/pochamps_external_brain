import { useMemo } from 'react';
import { categoryKo, ko } from '../lib/data';
import { autoWeather, movePower, type CalcField, type MoveResult } from '../lib/calc';
import { useAsync, useStoredState } from '../lib/hooks';
import { loadMetaTargets, shareLabel, type MetaTarget } from '../lib/meta';
import { battleSpecies, newSet, type PokemonSet, type SideExtras } from '../lib/sets';
import { useWorkerJob } from '../lib/workerJob';
import type { CoverageRequest, CoverageResult } from '../workers/coverage.worker';
import { Card, Loading, Segmented, Sprite, TypeBadge } from './ui';

type Target = MetaTarget;

type Bucket = 'ohko' | 'ohkoChance' | 'twohko' | 'twohkoChance' | 'rest';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'ohko', label: '확정 1타' },
  { key: 'ohkoChance', label: '난수 1타' },
  { key: 'twohko', label: '확정 2타' },
  { key: 'twohkoChance', label: '난수 2타' },
];

function bucketOf(r: MoveResult): Bucket {
  const sure = r.koText?.startsWith('guaranteed');
  if (r.hits === 1) return sure ? 'ohko' : 'ohkoChance';
  if (r.hits === 2) return sure ? 'twohko' : 'twohkoChance';
  return 'rest';
}

const createWorker = () => new Worker(new URL('../workers/coverage.worker.ts', import.meta.url), { type: 'module' });

/**
 * How far each of the attacker's moves reaches against the meta, with no defender chosen:
 * every top-N ladder Pokemon on its most used set, grouped by hits to KO.
 */
export function MetaCoverage({
  attacker,
  extras,
  field,
  isCrit,
  onPick,
}: {
  attacker: PokemonSet;
  extras: SideExtras;
  field: CalcField;
  isCrit: boolean;
  onPick: (defender: PokemonSet) => void;
}) {
  const [count, setCount] = useStoredState<'30' | '50' | '100'>('pochamps.coverage.count', '30');
  const targets = useAsync(() => loadMetaTargets(Number(count)), [count]);
  const request = useMemo<CoverageRequest | null>(
    () => (targets.data && attacker.species ? { attacker, extras, field, isCrit, targets: targets.data } : null),
    [targets.data, attacker, extras, field, isCrit],
  );
  const { output, pending } = useWorkerJob<CoverageRequest, CoverageResult>(createWorker, request);

  // Weather for the 결정력 number: the one picked by hand, else the attacker's own weather ability.
  const attackerWeather = field.weather ?? autoWeather(field, attacker, extras, newSet(), {})?.weather;

  const rows = useMemo(() => {
    if (!targets.data || !output || !attacker.species) return [];
    const byKey = new Map(targets.data.map((t) => [t.key, t]));
    const byMove = new Map<string, { result: MoveResult; target: Target }[]>();
    for (const { key, results } of output) {
      const target = byKey.get(key);
      if (!target) continue;
      for (const result of results) {
        if (result.error) continue;
        byMove.set(result.move, [...(byMove.get(result.move) ?? []), { result, target }]);
      }
    }
    return [...byMove.entries()].map(([move, hits]) => {
      const groups = Object.fromEntries(BUCKETS.map((b) => [b.key, [] as typeof hits])) as Record<Bucket, typeof hits>;
      groups.rest = [];
      for (const h of hits) groups[bucketOf(h.result)].push(h);
      for (const list of Object.values(groups)) list.sort((a, b) => b.result.maxPercent - a.result.maxPercent);
      const power = movePower(attacker, extras, move, { weather: attackerWeather, terrain: field.terrain });
      const blocked = hits.filter((h) => h.result.note);
      return { move, first: hits[0]?.result, power, blocked, groups, total: hits.length };
    });
  }, [targets.data, output, attacker, extras, attackerWeather, field.terrain]);

  return (
    <Card
      title="메타 상대 결정력 범위"
      actions={
        <Segmented
          label="상대 범위"
          value={count}
          onChange={setCount}
          options={[
            { value: '30', label: '상위 30' },
            { value: '50', label: '상위 50' },
            { value: '100', label: '상위 100' },
          ]}
        />
      }
    >
      <p className="fine coverage-note">
        방어 측을 정하지 않아도, 싱글 메타 상위 포켓몬(사용률 1위 성격·SP·도구, 메가스톤이면 메가진화)을 상대로 기술마다 몇 타에
        잡는지 보여줍니다. 위의 날씨·필드·해저드·급소 설정이 그대로 적용되고, 날씨를 고르지 않으면 가뭄·모래날림 같은 날씨 특성(공격 측 우선)이 자동으로 적용됩니다. 아이콘을 누르면 방어 측으로 설정합니다.
      </p>
      {targets.loading && !targets.data && <Loading label="메타 포켓몬 세팅을 불러오는 중…" />}
      {!attacker.species && <p className="muted">공격 측 포켓몬을 먼저 정하세요.</p>}
      {targets.data && attacker.species && rows.length === 0 && <p className="muted">공격 기술이 없습니다.</p>}
      <div className="coverage" aria-busy={pending}>
        {rows.map((row) => (
          <section key={row.move} className="coverage-move">
            <header className="coverage-head">
              {/* The attacker-side type (Weather Ball, Terrain Pulse, -ate) is the same for every target. */}
              {(row.power?.type ?? row.first?.type) && <TypeBadge type={(row.power?.type ?? row.first?.type)!} />}
              <strong>{ko('moves', row.move)}</strong>
              <span className="muted small">{categoryKo(row.first?.category)}</span>
              <span className="grow" />
              {row.power !== undefined && (
                <span className="power" title="공격 실수치 × 위력 × 자속·도구·특성·날씨·필드 보정 (데미지 계산기 기준)">
                  결정력 <strong>{row.power.power.toLocaleString()}</strong>
                </span>
              )}
            </header>
            <div className="coverage-summary">
              {BUCKETS.map((b) => (
                <span key={b.key} className={`count count-${b.key}`}>
                  {b.label} <strong>{row.groups[b.key].length}</strong>
                </span>
              ))}
              <span className="count">
                그 외 <strong>{row.groups.rest.length}</strong>
              </span>
              <span className="muted small">/ {row.total}마리</span>
            </div>
            {row.blocked.length > 0 && (
              <p className="field-note">
                {row.blocked[0].result.note} — {row.blocked.length}마리에게 0 데미지
              </p>
            )}
            {BUCKETS.filter((b) => row.groups[b.key].length).map((b) => (
              <div key={b.key} className="coverage-row">
                <span className={`coverage-label count-${b.key}`}>{b.label}</span>
                <div className="coverage-mons">
                  {row.groups[b.key].map(({ result, target }) => {
                    const name = ko('species', battleSpecies(target.set));
                    return (
                      <button
                        type="button"
                        key={target.key}
                        className="coverage-mon"
                        title={`${target.rank}위 ${name}${shareLabel(target)}: ${result.minPercent}–${result.maxPercent}%`}
                        aria-label={`${name} ${result.minPercent}–${result.maxPercent}%, 방어 측으로 설정`}
                        onClick={() => onPick(target.set)}
                      >
                        <Sprite species={battleSpecies(target.set)} size={32} />
                        <span className="coverage-pct">{Math.round(result.maxPercent)}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}
