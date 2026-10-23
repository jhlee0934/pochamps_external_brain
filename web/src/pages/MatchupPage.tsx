import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ko } from '../lib/data';
import { koTextKo, type MoveResult } from '../lib/calc';
import { useStoredState } from '../lib/hooks';
import { withRo } from '../lib/korean';
import { useParty } from '../lib/party';
import { loadMetaTargets } from '../lib/meta';
import { battleSpecies, effectiveSpeed, type PokemonSet } from '../lib/sets';
import { useWorkerJob } from '../lib/workerJob';
import type { BenchmarkRequest, BenchmarkResult } from '../workers/benchmark.worker';
import { Card, Segmented, Sprite } from '../components/ui';

interface Row {
  key: string;
  rank: number;
  set: PokemonSet;
  /** Form share when the ladder entry has several forms (Mega X / Mega Y / base). */
  share?: number;
  offense?: MoveResult;
  defense?: MoveResult;
  mySpeed: number;
  theirSpeed: number;
  verdict: 'good' | 'even' | 'bad';
}

// Fewer hits to KO wins; on a tie, the faster side wins.
function verdict(my: MoveResult | undefined, their: MoveResult | undefined, mySpeed: number, theirSpeed: number): Row['verdict'] {
  const a = my?.hits ?? 99;
  const b = their?.hits ?? 99;
  if (a < b) return 'good';
  if (a > b) return 'bad';
  if (a === 99) return 'even';
  return mySpeed > theirSpeed ? 'good' : mySpeed < theirSpeed ? 'bad' : 'even';
}

const VERDICT_LABEL = { good: '유리', even: '호각', bad: '불리' };

// The same worker as the party page's spread insights: my best move and theirs, per meta form.
const createWorker = () => new Worker(new URL('../workers/benchmark.worker.ts', import.meta.url), { type: 'module' });

function Hit({ r }: { r: MoveResult | undefined }) {
  if (!r) return <span className="muted">공격 기술 없음</span>;
  return (
    <span className="hit">
      <span>{ko('moves', r.move)}</span>
      <span className="muted small">
        {r.minPercent}–{r.maxPercent}% · {koTextKo(r.koText)}
      </span>
    </span>
  );
}

export function MatchupPage() {
  const { members } = useParty();
  const navigate = useNavigate();
  const [index, setIndex] = useStoredState('pochamps.matchup.member', 0);
  const [count, setCount] = useStoredState<'20' | '30' | '50'>('pochamps.matchup.count', '30');
  // Set by the button; the worker runs whenever it changes. Results stay tied to job.me, so
  // picking another member doesn't relabel them.
  const [job, setJob] = useState<BenchmarkRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { output, outputFor, pending, error: workerError } = useWorkerJob<BenchmarkRequest, BenchmarkResult>(createWorker, job);
  const me = members[Math.min(index, members.length - 1)];
  const computedFor = outputFor?.me ?? null;
  const error = loadError || workerError;

  const start = async () => {
    if (!me) return;
    setLoadError('');
    setLoading(true);
    try {
      // One target per form, so Mega Charizard X and Y are judged separately.
      setJob({ me, targets: await loadMetaTargets(Number(count)) });
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo<Row[] | null>(() => {
    if (!output || !outputFor) return null;
    const mySpeed = effectiveSpeed(outputFor.me) ?? 0;
    const results = new Map(output.map((r) => [r.key, r]));
    return outputFor.targets.map((t) => {
      const { offense, defense } = results.get(t.key) ?? {};
      const theirSpeed = effectiveSpeed(t.set) ?? 0;
      return {
        key: t.key,
        rank: t.rank,
        set: t.set,
        share: t.share,
        offense,
        defense,
        mySpeed,
        theirSpeed,
        verdict: verdict(offense, defense, mySpeed, theirSpeed),
      };
    });
  }, [output, outputFor]);
  const busy = loading || pending;

  const summary = rows && {
    good: rows.filter((r) => r.verdict === 'good').length,
    even: rows.filter((r) => r.verdict === 'even').length,
    bad: rows.filter((r) => r.verdict === 'bad').length,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>메타 대면표</h1>
          <p className="muted">내 포켓몬 하나와 싱글 메타 상위 포켓몬의 1:1 대면을 한 번에 계산합니다.</p>
        </div>
      </div>

      {!members.length ? (
        <Card>
          <p className="muted">
            먼저 <Link to="/party">내 파티</Link>에 포켓몬을 추가하세요.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="toolbar">
            <div className="member-pick" role="radiogroup" aria-label="내 포켓몬">
              {members.map((m, i) => (
                <button
                  type="button"
                  key={i}
                  role="radio"
                  aria-checked={m === me}
                  className={m === me ? 'member active' : 'member'}
                  onClick={() => setIndex(i)}
                >
                  <Sprite species={battleSpecies(m)} size={36} />
                  <span>{ko('species', m.species)}</span>
                </button>
              ))}
            </div>
            <div className="row gap">
              <Segmented
                label="상대 수"
                value={count}
                onChange={setCount}
                options={[
                  { value: '20', label: '상위 20' },
                  { value: '30', label: '상위 30' },
                  { value: '50', label: '상위 50' },
                ]}
              />
              <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
                {loading ? '메타 샘플 불러오는 중…' : pending ? '계산 중…' : '계산하기'}
              </button>
            </div>
          </div>
          <p className="fine">
            상대는 사용률 1위 성격·SP·도구·특성과 상위 기술 4개로 가정하고, 메가스톤을 들었으면 메가진화 상태로 계산합니다. 판정은 확정
            타수가 적은 쪽, 같으면 빠른 쪽이 유리입니다. 교체·보조기·랭크업은 반영하지 않습니다.
          </p>
          {error && <p className="error-note">{error}</p>}
          {rows && computedFor && me !== computedFor && (
            <p className="stale-note">
              아래 결과는 {ko('species', battleSpecies(computedFor))} 기준입니다. {withRo(ko('species', battleSpecies(me)))} 보려면 계산하기를 누르세요.
            </p>
          )}
        </Card>
      )}

      {rows && summary && computedFor && (
        <Card
          title={`${ko('species', battleSpecies(computedFor))} 대면 결과`}
          actions={
            <span className="verdict-summary">
              <span className="verdict good">유리 {summary.good}</span>
              <span className="verdict even">호각 {summary.even}</span>
              <span className="verdict bad">불리 {summary.bad}</span>
            </span>
          }
        >
          <div className="table-wrap">
            <table className="table matchup-table">
              <thead>
                <tr>
                  <th className="num">순위</th>
                  <th>상대</th>
                  <th>내 최고 화력</th>
                  <th>상대 최고 화력</th>
                  <th className="num">스피드</th>
                  <th>판정</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className="clickable"
                    onClick={() => navigate('/calc', { state: { attacker: computedFor, defender: r.set } })}
                    title="계산기에서 자세히 보기"
                  >
                    <td className="num rank">{r.rank}</td>
                    <td>
                      <span className="mon-link">
                        <Sprite species={battleSpecies(r.set)} size={32} />
                        <span>
                          <strong>{ko('species', battleSpecies(r.set))}</strong>
                          <span className="en">
                            {ko('items', r.set.item)}
                            {r.share != null && ` · 비중 ${r.share}%`}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <Hit r={r.offense} />
                    </td>
                    <td>
                      <Hit r={r.defense} />
                    </td>
                    <td className="num">
                      <span className={r.mySpeed > r.theirSpeed ? 'good' : r.mySpeed < r.theirSpeed ? 'bad' : ''}>
                        {r.mySpeed} : {r.theirSpeed}
                      </span>
                    </td>
                    <td>
                      <span className={`verdict ${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
