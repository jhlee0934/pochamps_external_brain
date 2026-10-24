import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCustomSamples } from '../lib/custom';
import { ko, toID } from '../lib/data';
import { battleSpecies, megaBase } from '../lib/sets';
import { SetEditor } from './SetEditor';
import { Card, Sprite } from './ui';

const summary = (set: Parameters<typeof battleSpecies>[0]) =>
  [set.item && ko('items', set.item), set.nature && ko('natures', set.nature)].filter(Boolean).join(' · ');

/**
 * Custom samples of one Pokemon (all its forms), edited in place. `openId` is the sample just
 * created on this page: it opens and scrolls into view.
 */
export function CustomSampleCard({ species, openId }: { species: string; openId?: string }) {
  const { samples, update, remove } = useCustomSamples();
  const mine = samples.filter((s) => toID(megaBase(s.set.species)) === toID(megaBase(species)));
  const opened = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    opened.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openId]);
  if (!mine.length) return null;

  return (
    <Card title={`커스텀 샘플 ${mine.length}개`}>
      <p className="fine">
        결정력 계산의 메타 범위, SP 배분 효과, 스피드 라인, 대면표에 순위와 관계없이 함께 표시됩니다. 이 브라우저에만 저장됩니다.
      </p>
      <div className="custom-samples">
        {mine.map((s, i) => (
          <details key={s.id} className="custom-sample" open={s.id === openId} ref={s.id === openId ? opened : undefined}>
            <summary>
              <Sprite species={battleSpecies(s.set)} size={32} />
              <strong>
                {ko('species', battleSpecies(s.set))} #{i + 1}
              </strong>
              <span className="muted small">{summary(s.set)}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm('이 커스텀 샘플을 삭제할까요?')) remove(s.id);
                }}
              >
                삭제
              </button>
            </summary>
            <SetEditor set={s.set} onChange={(set) => update(s.id, set)} />
          </details>
        ))}
      </div>
    </Card>
  );
}

/** Every custom sample, for finding and removing them from the meta page. */
export function CustomSampleList() {
  const { samples, remove } = useCustomSamples();
  if (!samples.length) return null;
  return (
    <Card title={`내 커스텀 샘플 ${samples.length}개`}>
      <ul className="custom-sample-list">
        {samples.map((s) => (
          <li key={s.id}>
            <Link className="mon-link" to={`/pokemon/${toID(battleSpecies(s.set))}`}>
              <Sprite species={battleSpecies(s.set)} size={28} />
              <span>{ko('species', battleSpecies(s.set))}</span>
              <span className="muted small">{summary(s.set)}</span>
            </Link>
            <button
              type="button"
              className="btn btn-small"
              aria-label={`${ko('species', battleSpecies(s.set))} 커스텀 샘플 삭제`}
              onClick={() => {
                if (confirm('이 커스텀 샘플을 삭제할까요?')) remove(s.id);
              }}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      <p className="fine">포켓몬을 누르면 상세 화면에서 수정할 수 있습니다. 메타 비교 화면에 순위와 관계없이 함께 표시됩니다.</p>
    </Card>
  );
}
