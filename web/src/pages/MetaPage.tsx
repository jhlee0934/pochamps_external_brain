import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getRanking, ko, toID, type Format } from '../lib/data';
import { useAsync, useStoredState } from '../lib/hooks';
import { TYPES } from '../lib/typechart';
import { Card, ErrorNote, Loading, Segmented, Sprite, TypeBadge, Types } from '../components/ui';

const PAGE = 50;

export function MetaPage() {
  const [params, setParams] = useSearchParams();
  const [storedFormat, setStoredFormat] = useStoredState<Format>('pochamps.meta.format', 'Singles');
  const requestedFormat = params.get('format');
  const format = requestedFormat === 'Singles' || requestedFormat === 'Doubles' ? requestedFormat : storedFormat;
  const [query, setQuery] = useState('');
  const type = TYPES.find((t) => t === params.get('type')) ?? '';
  const [limit, setLimit] = useState(PAGE);
  const setType = (next: string) => {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      if (next) updated.set('type', next);
      else updated.delete('type');
      return updated;
    });
    setLimit(PAGE);
  };
  const setFormat = (next: Format) => {
    setStoredFormat(next);
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set('format', next);
      return updated;
    });
    setLimit(PAGE);
  };
  const ranking = useAsync(() => getRanking(format), [format]);

  const rows = useMemo(() => {
    const q = query.replace(/\s/g, '').toLowerCase();
    return (ranking.data?.entries ?? []).filter(
      (e) =>
        (!type || e.types.includes(type)) &&
        (!q || ko('species', e.pokemon).replace(/\s/g, '').includes(q) || toID(e.pokemon).includes(q)),
    );
  }, [ranking.data, query, type]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>메타 순위</h1>
          <p className="muted">
            랭크 배틀 사용률 순위입니다. 데이터에는 순위만 있고 포켓몬별 사용률 %는 없습니다.
            {ranking.data && <> · 갱신 {new Date(ranking.data.generatedAt).toLocaleString('ko-KR')}</>}
          </p>
        </div>
        <Segmented
          label="배틀 형식"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'Singles', label: '싱글' },
            { value: 'Doubles', label: '더블' },
          ]}
        />
      </div>

      <Card>
        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder="포켓몬 검색 (한국어/영어)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="포켓몬 검색"
          />
          <div className="type-filter" role="group" aria-label="타입 필터">
            <button type="button" className={!type ? 'chip active' : 'chip'} onClick={() => setType('')}>
              전체
            </button>
            {TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={type === t ? 'chip-type active' : 'chip-type'}
                onClick={() => setType(type === t ? '' : t)}
                aria-pressed={type === t}
              >
                <TypeBadge type={t} />
              </button>
            ))}
          </div>
        </div>

        {ranking.loading && !ranking.data && <Loading />}
        <ErrorNote error={ranking.error} />

        {ranking.data && (
          <div className="table-wrap">
            <table className="table meta-table">
              <thead>
                <tr>
                  <th className="num">순위</th>
                  <th>포켓몬</th>
                  <th className="hide-sm">타입</th>
                  <th>주력 기술</th>
                  <th className="hide-sm">도구</th>
                  <th className="hide-md">특성</th>
                  <th className="hide-md">성격</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((e) => (
                  <tr key={e.showdownId}>
                    <td className="num rank">{e.rank}</td>
                    <td>
                      <Link to={`/pokemon/${e.showdownId}?format=${format}`} className="mon-link">
                        <Sprite species={e.pokemon} size={36} />
                        <span>
                          <strong>{ko('species', e.pokemon)}</strong>
                          <span className="en">{e.pokemon}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="hide-sm">
                      <Types types={e.types} />
                    </td>
                    <td>{ko('moves', e.topMove)}</td>
                    <td className="hide-sm">{ko('items', e.topItem)}</td>
                    <td className="hide-md">{ko('abilities', e.topAbility)}</td>
                    <td className="hide-md">{ko('natures', e.topNature)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted empty">조건에 맞는 포켓몬이 없습니다.</p>}
            {rows.length > limit && (
              <button type="button" className="btn btn-block" onClick={() => setLimit(limit + PAGE)}>
                더 보기 ({rows.length - limit}마리 남음)
              </button>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
