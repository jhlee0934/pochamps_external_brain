import { useStoredState } from '../lib/hooks';
import { useParty } from '../lib/party';
import { SpeedLine } from '../components/SpeedLine';
import { Card } from '../components/ui';

export function SpeedPage() {
  const { members, current } = useParty();
  const [showMine, setShowMine] = useStoredState('pochamps.speedpage.mine', true);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>스피드 라인</h1>
          <p className="muted">메타 포켓몬의 스피드를 상위 30마리부터 래더 전체까지 비교합니다.</p>
        </div>
      </div>
      <Card
        actions={
          members.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} />
              {current.name} 함께 보기
            </label>
          )
        }
      >
        <SpeedLine
          members={showMine ? members : []}
          ranges={['30', '50', '100', 'all']}
          rangeKey="pochamps.speedpage.range"
          defaultRange="all"
        />
      </Card>
    </>
  );
}
