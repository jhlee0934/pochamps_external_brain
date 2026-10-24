import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gen, ko, toID } from '../lib/data';
import { MAX_PARTIES, newParty, useParty } from '../lib/party';
import { battleSpecies, newSet, spTotal, SP_MAX_TOTAL, type PokemonSet } from '../lib/sets';
import { exportTeam, importTeam } from '../lib/showdown';
import { multiplier, multiplierLabel, TYPES } from '../lib/typechart';
import { SetEditor } from '../components/SetEditor';
import { SpeedLine } from '../components/SpeedLine';
import { SpreadInsights } from '../components/SpreadInsights';
import { Card, Sprite, TypeBadge } from '../components/ui';

function TypeChart({ members }: { members: PokemonSet[] }) {
  const cols = members.map((m) => {
    const species = battleSpecies(m);
    const mega = species !== m.species;
    return {
      set: m,
      species,
      types: [...(gen.species.get(toID(species))?.types ?? [])],
      ability: mega ? Object.values(gen.species.get(toID(species))?.abilities ?? {})[0] : m.ability,
    };
  });
  return (
    <div className="table-wrap">
      <table className="table type-chart">
        <thead>
          <tr>
            <th>공격 타입</th>
            {cols.map((c, i) => (
              <th key={i} className="num">
                <Sprite species={c.species} size={32} />
              </th>
            ))}
            <th className="num">약점</th>
            <th className="num">반감</th>
          </tr>
        </thead>
        <tbody>
          {TYPES.map((t) => {
            const ms = cols.map((c) => multiplier(t, c.types, c.ability as string | undefined));
            const weak = ms.filter((m) => m > 1).length;
            const resist = ms.filter((m) => m < 1).length;
            return (
              <tr key={t}>
                <td>
                  <TypeBadge type={t} />
                </td>
                {ms.map((m, i) => (
                  <td key={i} className={`num eff eff-${m === 0 ? 'immune' : m > 1 ? 'weak' : m < 1 ? 'resist' : 'neutral'}`}>
                    {m === 1 ? '' : multiplierLabel(m)}
                  </td>
                ))}
                <td className={`num ${weak >= 3 ? 'bad strong' : ''}`}>{weak || ''}</td>
                <td className="num">{resist || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PartyPage() {
  const { store, current, members, setStore, updateCurrent } = useParty();
  const [selected, setSelected] = useState(0);
  const [io, setIo] = useState<'import' | 'export' | null>(null);
  const [text, setText] = useState('');
  const [importNote, setImportNote] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);

  const slot = current.slots[selected];
  const setSlot = (set: PokemonSet | null) =>
    updateCurrent((p) => ({ ...p, slots: p.slots.map((s, i) => (i === selected ? set : s)) }));

  const openIo = (mode: 'import' | 'export') => {
    setIo(mode);
    setImportNote([]);
    setText(mode === 'export' ? exportTeam(members) : '');
    dialog.current?.showModal();
  };

  const doImport = () => {
    const { sets, warnings } = importTeam(text);
    if (!sets.length) {
      setImportNote(['가져올 포켓몬을 찾지 못했습니다.']);
      return;
    }
    updateCurrent((p) => ({ ...p, slots: [...sets.slice(0, 6), null, null, null, null, null, null].slice(0, 6) }));
    setSelected(0);
    if (warnings.length) setImportNote(warnings);
    else dialog.current?.close();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>내 파티</h1>
          <p className="muted">파티는 이 브라우저에만 저장됩니다.</p>
        </div>
        <div className="row gap wrap">
          <select
            className="input"
            aria-label="파티 선택"
            value={current.id}
            onChange={(e) => setStore((s) => ({ ...s, currentId: e.target.value }))}
          >
            {store.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={store.parties.length >= MAX_PARTIES}
            title={store.parties.length >= MAX_PARTIES ? `파티는 ${MAX_PARTIES}개까지 저장할 수 있습니다.` : undefined}
            onClick={() => {
              const p = newParty(`파티 ${store.parties.length + 1}`);
              setStore((s) => (s.parties.length >= MAX_PARTIES ? s : { parties: [...s.parties, p], currentId: p.id }));
              setSelected(0);
            }}
          >
            새 파티 ({store.parties.length}/{MAX_PARTIES})
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const name = prompt('파티 이름', current.name);
              if (name) updateCurrent((p) => ({ ...p, name }));
            }}
          >
            이름 변경
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={store.parties.length < 2}
            onClick={() => {
              if (!confirm(`"${current.name}" 파티를 삭제할까요?`)) return;
              setStore((s) => {
                const parties = s.parties.filter((p) => p.id !== current.id);
                return { parties, currentId: parties[0].id };
              });
            }}
          >
            삭제
          </button>
          <button type="button" className="btn" onClick={() => openIo('import')}>
            가져오기
          </button>
          <button type="button" className="btn" onClick={() => openIo('export')} disabled={!members.length}>
            내보내기
          </button>
        </div>
      </div>

      <div className="slots">
        {current.slots.map((s, i) => {
          const over = s && spTotal(s.sp) > SP_MAX_TOTAL;
          return (
            <button
              type="button"
              key={i}
              className={`slot ${i === selected ? 'active' : ''} ${s?.species ? '' : 'empty'}`}
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
            >
              {s?.species ? (
                <>
                  <Sprite species={battleSpecies(s)} size={48} />
                  <span className="slot-name">{ko('species', s.species)}</span>
                  <span className="slot-item">{s.item ? ko('items', s.item) : '도구 없음'}</span>
                  {over && <span className="chip small bad">SP 초과</span>}
                </>
              ) : (
                <span className="slot-add">+ 추가</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid-editor">
        <Card
          title={`슬롯 ${selected + 1}`}
          actions={
            slot?.species && (
              <>
                <Link className="btn btn-small" to="/calc" state={{ attacker: slot }}>
                  계산기로
                </Link>
                <button type="button" className="btn btn-small btn-danger" onClick={() => setSlot(null)}>
                  비우기
                </button>
              </>
            )
          }
        >
          <SetEditor set={slot ?? newSet()} onChange={setSlot} showMovePower />
        </Card>

        <div className="stack">
          {slot?.species && <SpreadInsights set={slot} baselineKey={`${current.id}:${selected}:${slot.species}`} />}
          <Card title="타입 상성">
            {members.length ? <TypeChart members={members} /> : <p className="muted">파티에 포켓몬을 추가하면 상성표가 나옵니다.</p>}
            <p className="fine">메가스톤을 든 포켓몬은 메가진화 후 타입·특성으로 계산합니다. 부유·저수 같은 특성 무효도 반영합니다.</p>
          </Card>
          <Card title="스피드 라인" actions={<Link className="btn btn-small" to="/speed">전체 보기</Link>}>
            <SpeedLine members={members} ranges={['30', '50', '100']} rangeKey="pochamps.speed.count" defaultRange="50" />
          </Card>
        </div>
      </div>

      <dialog ref={dialog} className="dialog" onClose={() => setIo(null)}>
        <h2>{io === 'export' ? '파티 내보내기' : '파티 가져오기'}</h2>
        <p className="fine">
          Showdown 형식 텍스트입니다. SP는 "EVs:" 줄에 적습니다. 가져오기는 한국어 이름도 받으며, 현재 파티를 덮어씁니다.
        </p>
        <textarea
          className="input textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={io === 'export'}
          rows={16}
          aria-label="파티 텍스트"
          placeholder={'Garchomp @ Choice Scarf\nAbility: Rough Skin\nEVs: 32 Atk / 2 HP / 32 Spe\nJolly Nature\n- Earthquake'}
        />
        {importNote.length > 0 && (
          <ul className="error-note">
            {importNote.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <div className="row gap end">
          {io === 'export' ? (
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(text)}>
              복사
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={doImport}>
              가져오기
            </button>
          )}
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            닫기
          </button>
        </div>
      </dialog>
    </>
  );
}
