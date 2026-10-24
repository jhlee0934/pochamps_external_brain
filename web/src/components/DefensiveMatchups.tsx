import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ko, speciesTypes, type Format, type UsageSummary } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { battleSpecies, defaultAbility } from '../lib/sets';
import { TYPES, multiplierLabel } from '../lib/typechart';
import { defenseAbilityOptions, defensiveMultiplier, findWeaknessAttackers, loadWeaknessSample } from '../lib/weakness';
import { Card, ErrorNote, Loading, Segmented, Sprite, TypeBadge } from './ui';

const ABILITY_NOTES: Record<string, string> = {
  Bulletproof: '방탄은 개별 기술의 탄환 여부에 따라 상대 목록에 반영합니다.',
  Soundproof: '방음은 개별 기술의 소리 여부에 따라 상대 목록에 반영합니다.',
  'Queenly Majesty': '여왕의위엄으로 막는 선공기는 상대 목록에서 제외합니다.',
  'Armor Tail': '테일아머로 막는 선공기는 상대 목록에서 제외합니다.',
  'Aura Guard': '파동의방호의 접촉 기술 반감은 상대 목록에 반영합니다.',
  Fluffy: '복슬복슬의 불꽃 보정은 표에, 접촉 기술 반감은 상대 목록에 반영합니다.',
  'Punk Rock': '펑크록의 소리 기술 반감은 상대 목록에 반영합니다.',
  'Fur Coat': '퍼코트의 방어 상승은 타입 상성을 바꾸지 않습니다. 실제 피해량은 계산기에서 확인하세요.',
  'Marvel Scale': '이상한비늘의 상태이상 조건에 따른 방어 상승은 이 표에 반영하지 않습니다.',
  'Grass Pelt': '풀모피의 그래스필드 조건에 따른 방어 상승은 이 표에 반영하지 않습니다.',
  Disguise: '탈의 첫 공격 방어는 타입 무효가 아니므로 이 표에 반영하지 않습니다.',
  Sturdy: '옹골참의 기절 방지는 타입 무효가 아니므로 이 표에 반영하지 않습니다.',
};

export function DefensiveMatchups({ species, usage, format = 'Singles' }: { species: string; usage?: UsageSummary; format?: Format }) {
  const abilities = defenseAbilityOptions(species, usage);
  const [selectedAbility, setSelectedAbility] = useState<string | null>(null);
  const popular = usage?.abilities[0]?.name;
  const ability = selectedAbility !== null && (!selectedAbility || abilities.includes(selectedAbility))
    ? selectedAbility : popular && abilities.includes(popular) ? popular : defaultAbility(species);
  const [fullHp, setFullHp] = useState(false);
  const [count, setCount] = useState<'30' | '50' | '100'>('30');
  const [minimumPct, setMinimumPct] = useState('10');
  const types = speciesTypes(species);
  const sample = useAsync(async () => ({ ...await loadWeaknessSample(Number(count), format), count, format }), [count, format]);
  const currentSample = sample.data?.count === count && sample.data.format === format ? sample.data : undefined;
  const threats = useMemo(
    () => findWeaknessAttackers(currentSample?.targets ?? [], types, ability, Number(minimumPct), fullHp),
    [currentSample, species, ability, minimumPct, fullHp],
  );
  const groups = [...new Set(TYPES.map((type) => defensiveMultiplier(type, types, ability, fullHp)))].sort((a, b) => b - a);
  const threatGroups = [...new Set(threats.flatMap((row) => row.moves.map((move) => move.multiplier)))].sort((a, b) => b - a);
  // Multipliers whose list is folded; every group starts open.
  const [folded, setFolded] = useState<number[]>([]);
  const allFolded = threatGroups.length > 0 && threatGroups.every((value) => folded.includes(value));
  const setGroupOpen = (value: number, open: boolean) =>
    setFolded((current) => (open ? current.filter((v) => v !== value) : current.includes(value) ? current : [...current, value]));

  return (
    <>
      <Card title="방어 상성" actions={
        <label className="check">
          특성
          <select className="input input-small" aria-label="방어 상성 특성" value={ability} onChange={(event) => setSelectedAbility(event.target.value)}>
            <option value="">타입만 보기</option>
            {abilities.map((name) => <option key={name} value={name}>{ko('abilities', name)}</option>)}
          </select>
        </label>
      }>
        {ability === 'Multiscale' && <label className="check defense-condition"><input type="checkbox" checked={fullHp} onChange={(event) => setFullHp(event.target.checked)} />HP 가득 참 (멀티스케イル 적용 · 첫 타격 기준)</label>}
        <dl className="defensive-matchups">
          {groups.map((value) => {
            const attacks = TYPES.filter((type) => defensiveMultiplier(type, types, ability, fullHp) === value);
            const tone = value > 1 ? 'weak' : value === 0 ? 'immune' : value < 1 ? 'resist' : 'neutral';
            return <div key={value} className={`defensive-matchup defensive-matchup-${tone}`}>
              <dt>{value === 0 ? '무효' : `${multiplierLabel(value)}배${value > 1 ? ' 약점' : value < 1 ? ' 반감' : ''}`}</dt>
              <dd>{attacks.map((type) => <TypeBadge key={type} type={type} format={format} />)}</dd>
            </div>;
          })}
        </dl>
        <p className="fine">현재 폼의 타입{ability && `과 ${ko('abilities', ability)}`} 기준입니다. 특성의 상시 배율 보정을 포함하며 도구·날씨·필드는 제외합니다. 여러 특성이 있으면 선택해 비교할 수 있습니다.</p>
        {ABILITY_NOTES[ability] && <p className="fine">{ABILITY_NOTES[ability]}</p>}
      </Card>

      <Card title="약점을 찌르는 메타 포켓몬">
        <div className="toolbar">
          <Segmented label="약점 상대 메타 범위" value={count} onChange={setCount} options={[{ value: '30', label: '상위 30' }, { value: '50', label: '상위 50' }, { value: '100', label: '상위 100' }]} />
          {threatGroups.length > 0 && <button type="button" className="btn btn-small" onClick={() => setFolded(allFolded ? [] : threatGroups)}>{allFolded ? '모두 펼치기' : '모두 접기'}</button>}
          <label className="check">기술 채용률<select className="input input-small" aria-label="약점 기술 최소 채용률" value={minimumPct} onChange={(event) => setMinimumPct(event.target.value)}>{['5', '10', '20'].map((value) => <option key={value} value={value}>{value}% 이상</option>)}</select></label>
        </div>
        <p className="fine coverage-note">{format === 'Singles' ? '싱글' : '더블'} 순위권 포켓몬이 채용한 공격 기술 중, 선택한 특성 조건에서 1배를 초과하는 기술을 표시합니다. 숫자는 각 기술의 채용률이며 동시에 사용하는 조합이나 승률을 뜻하지 않습니다.</p>
        {sample.loading && <Loading label="순위권 기술 사용률을 불러오는 중…" />}
        <ErrorNote error={sample.error} />
        {currentSample && currentSample.failed > 0 && <p className="error-note" role="status">샘플 {currentSample.total}마리 중 {currentSample.failed}마리의 데이터를 불러오지 못했습니다. 아래는 조회에 성공한 포켓몬만 포함합니다.</p>}
        {currentSample && !sample.loading && <div className="weakness-threats">
          {threatGroups.map((value) => <details key={value} className="weakness-threat-group" open={!folded.includes(value)} onToggle={(event) => setGroupOpen(value, event.currentTarget.open)}>
            <summary><h3>{multiplierLabel(value)}배 약점 <span className="muted small">{threats.filter((row) => row.moves.some((move) => move.multiplier === value)).length}마리</span></h3></summary>
            <ul className="weakness-threat-list">{threats.filter((row) => row.moves.some((move) => move.multiplier === value)).map(({ target, moves }) => <li key={target.key}>
              <Link className="mon-link" to={`/pokemon/${encodeURIComponent(battleSpecies(target.set))}?format=${format}`}><span className="muted small">{target.rank}위</span><Sprite species={battleSpecies(target.set)} size={32} /><strong>{ko('species', battleSpecies(target.set))}</strong></Link>
              <div className="weakness-moves">{moves.filter((move) => move.multiplier === value).map((move) => <span key={move.name} className="weakness-move"><TypeBadge type={move.type} format={format} /><span>{ko('moves', move.name)}</span><strong>{move.pct}%</strong></span>)}</div>
            </li>)}</ul>
          </details>)}
          {!threats.length && <p className="muted empty">조회한 범위에서 조건에 맞는 약점 공격 기술이 없습니다.</p>}
        </div>}
        <p className="fine">메가폼은 도구 채용률로 구분하며 기술 통계는 기본 포켓몬과 공유합니다. 상대는 폼별 인기 특성을 가정합니다. 타입 변환·틀깨기·방탄·방음·선공기 차단·접촉 및 소리 기술 반감을 반영합니다. 방어 실수치·위력·도구·날씨·필드·급소는 제외한 상성 비교이며, 실제 데미지와 확정수는 계산기로 확인하세요.</p>
      </Card>
    </>
  );
}
