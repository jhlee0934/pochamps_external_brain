import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { gen, getRanking, getTrend, getUsage, ko, toID, usageKey, type Format, type Kind } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { useParty } from '../lib/party';
import { useCustomSamples } from '../lib/custom';
import { commonSet, defaultAbility, megaBase, megaLabel, megaOptions, newSet, normalizeSet, STAT_LABEL, STATS } from '../lib/sets';
import { Card, ErrorNote, Loading, PctBar, Sprite, Types } from '../components/ui';
import { CustomSampleCard } from '../components/CustomSamples';
import { DefensiveMatchups } from '../components/DefensiveMatchups';

function UsageList({ title, kind, entries }: { title: string; kind: Kind; entries: { name: string; pct: number | null }[] }) {
  return (
    <Card title={title}>
      <ul className="usage-list">
        {entries.map((e) => (
          <li key={e.name}>
            <span className="usage-name">{ko(kind, e.name)}</span>
            <PctBar pct={e.pct} />
            <span className="usage-pct">{e.pct != null ? `${e.pct}%` : '–'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RankChart({ points }: { points: { date: string; rank: number | null }[] }) {
  const data = points.filter((p) => p.rank != null) as { date: string; rank: number }[];
  if (data.length < 2) return <p className="muted">추이를 그릴 데이터가 부족합니다.</p>;
  const W = 600;
  const H = 160;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const ranks = data.map((d) => d.rank);
  const lo = Math.max(1, Math.min(...ranks) - 2);
  const hi = Math.max(...ranks) + 2;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (r: number) => pad.t + ((r - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.rank).toFixed(1)}`).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일별 순위 추이 (위쪽이 높은 순위)">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-label">
            {t}위
          </text>
        </g>
      ))}
      <path d={path} className="chart-line" />
      {data.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.rank)} r={3} className="chart-dot">
          <title>
            {d.date}: {d.rank}위
          </title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} className="chart-label">
        {data[0].date.slice(5)}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" className="chart-label">
        {data.at(-1)!.date.slice(5)}
      </text>
    </svg>
  );
}

export function PokemonPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const format = (params.get('format') as Format) || 'Singles';
  const navigate = useNavigate();
  const { addToParty } = useParty();
  const [notice, setNotice] = useState('');

  const species = gen.species.get(toID(id));
  const name = species?.name ?? id;
  const usage = useAsync(() => getUsage(usageKey(name), format), [name, format]);
  const trend = useAsync(() => getTrend(usageKey(name), format, 31), [name, format]);
  const ranking = useAsync(() => getRanking(format), [format]);
  const entry = ranking.data?.entries.find((e) => e.showdownId === usageKey(name));
  // Base and mega forms share one page family; buttons switch between them both ways.
  const base = megaBase(name);
  const megas = megaOptions(base);

  const add = () => {
    if (!usage.data) return;
    setNotice(addToParty(commonSet(name, usage.data)) ? '현재 파티에 추가했습니다.' : '파티가 가득 찼습니다 (6마리).');
  };
  // A new custom sample starts from the popular set of the shown format, or a blank set off the ladder.
  const { add: addCustom } = useCustomSamples();
  const [openCustom, setOpenCustom] = useState<string>();
  const createCustom = () => {
    const fromUsage = usage.data?.showdownId === usageKey(name) && usage.data.format === format ? usage.data : undefined;
    const set = fromUsage ? commonSet(name, fromUsage) : normalizeSet({ ...newSet(name), ability: defaultAbility(megaBase(name)) });
    setOpenCustom(addCustom(set));
  };
  const toCalc = (side: 'attacker' | 'defender') => {
    if (!usage.data) return;
    navigate('/calc', { state: { [side]: commonSet(name, usage.data) } });
  };

  return (
    <>
      <div className="mon-hero">
        <Sprite species={name} variant="art" size={128} />
        <div className="grow">
          <div className="eyebrow">
            {format === 'Singles' ? '싱글' : '더블'} {entry ? `${entry.rank}위` : '순위 없음'}
          </div>
          <h1>{ko('species', name)}</h1>
          <p className="en">{name}</p>
          {species && <Types types={[...species.types]} />}
          {megas.length > 0 && (
            <nav className="mega-toggle" aria-label="폼 전환">
              {[{ mega: base, label: '기본' }, ...megas.map((m) => ({ mega: m.mega, label: `메가${megaLabel(m.mega) && ` ${megaLabel(m.mega)}`}` }))].map(
                (f) => {
                  const active = toID(f.mega) === toID(name);
                  return (
                    <Link
                      key={f.mega}
                      to={`/pokemon/${toID(f.mega)}?format=${format}`}
                      replace
                      className={active ? 'mega-btn active' : 'mega-btn'}
                      aria-current={active ? 'page' : undefined}
                      title={ko('species', f.mega)}
                    >
                      <Sprite species={f.mega} size={24} />
                      {f.label}
                    </Link>
                  );
                },
              )}
            </nav>
          )}
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={add} disabled={!usage.data}>
            파티에 추가
          </button>
          <button type="button" className="btn" onClick={() => toCalc('defender')} disabled={!usage.data}>
            계산기: 상대로
          </button>
          <button type="button" className="btn" onClick={() => toCalc('attacker')} disabled={!usage.data}>
            계산기: 공격자로
          </button>
          <button
            type="button"
            className="btn"
            onClick={createCustom}
            disabled={!species || usage.loading}
            title="메타 비교 화면에 순위와 관계없이 함께 나오는 샘플을 만듭니다."
          >
            커스텀 샘플 작성
          </button>
          {notice && <p className="muted">{notice}</p>}
        </div>
      </div>

      {species && <CustomSampleCard species={name} openId={openCustom} />}

      {species && (
        <Card title="종족값">
          <ul className="stat-list">
            {STATS.map((s) => (
              <li key={s}>
                <span>{STAT_LABEL[s]}</span>
                <strong>{species.baseStats[s]}</strong>
                <PctBar pct={(species.baseStats[s] / 200) * 100} />
              </li>
            ))}
            <li className="stat-total">
              <span>합계</span>
              <strong>{STATS.reduce((sum, s) => sum + species.baseStats[s], 0)}</strong>
            </li>
          </ul>
        </Card>
      )}

      {species && <DefensiveMatchups key={name} species={name} usage={usage.data?.showdownId === usageKey(name) && usage.data.format === format ? usage.data : undefined} format={format} />}

      {usage.loading && !usage.data && <Loading />}
      {usage.error && <p className="muted">이 포켓몬은 {format === 'Singles' ? '싱글' : '더블'} 래더 데이터가 없습니다.</p>}

      {usage.data && (
        <>
          {usage.data.pokemon !== name && (
            <p className="fine">메가진화 폼은 사용률이 따로 집계되지 않아 {ko('species', usage.data.pokemon)} 데이터를 보여줍니다.</p>
          )}
          <div className="grid-3">
            <UsageList title="기술" kind="moves" entries={usage.data.moves} />
            <UsageList title="도구" kind="items" entries={usage.data.items} />
            <div className="stack">
              <UsageList title="특성" kind="abilities" entries={usage.data.abilities} />
              <UsageList title="성격" kind="natures" entries={usage.data.natures} />
            </div>
          </div>
          <div className="grid-2">
            <Card title="SP 배분">
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      {STATS.map((s) => (
                        <th key={s} className="num">
                          {STAT_LABEL[s]}
                        </th>
                      ))}
                      <th className="num">비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.data.spreads.map((sp, i) => (
                      <tr key={i}>
                        {STATS.map((s) => (
                          <td key={s} className={`num ${sp.sp[s] >= 32 ? 'strong' : sp.sp[s] === 0 ? 'muted' : ''}`}>
                            {sp.sp[s]}
                          </td>
                        ))}
                        <td className="num">{sp.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="함께 쓰는 포켓몬">
              <p className="fine">데이터에 비율은 없고 순서만 있습니다.</p>
              <ol className="teammates">
                {usage.data.teammates.map((t) => (
                  <li key={t}>
                    <Link to={`/pokemon/${toID(t)}?format=${format}`} className="mon-link">
                      <Sprite species={t} size={32} />
                      {ko('species', t)}
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </>
      )}

      <Card title="순위 추이 (최근 31일)">
        {trend.loading && !trend.data && <Loading />}
        <ErrorNote error={trend.error} />
        {trend.data && <RankChart points={trend.data.points} />}
        <p className="fine">일별 스냅샷은 시즌 시작부터의 누적값이라 시즌 초반에 크게 움직이고 이후 안정됩니다.</p>
      </Card>
    </>
  );
}
