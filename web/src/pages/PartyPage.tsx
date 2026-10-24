import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gen, ko, toID } from '../lib/data';
import { useStoredState } from '../lib/hooks';
import { MAX_PARTIES, newParty, useParty } from '../lib/party';
import { FORMAT_OPTIONS, roleLabel, setupsOf, SETUP_MIN_PCT, SETUP_TOP, useMetaFormat, useMetaTargets, type MetaTarget } from '../lib/meta';
import { battleSpecies, effectiveSpeed, groupBySpeed, newSet, setupName, spTotal, SPEED_SETUP, SP_MAX_TOTAL, type PokemonSet } from '../lib/sets';
import { exportTeam, importTeam } from '../lib/showdown';
import { multiplier, multiplierLabel, TYPES } from '../lib/typechart';
import { SetEditor } from '../components/SetEditor';
import { SpreadInsights } from '../components/SpreadInsights';
import { Card, Loading, Segmented, Sprite, TypeBadge } from '../components/ui';

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

interface SpeedEntry {
  set: PokemonSet;
  mine: boolean;
  speed: number;
  /** Choice Scarf usage % when this row is the scarf variant of a meta Pokemon. */
  scarfPct?: number | null;
  share?: number;
  role?: MetaTarget['role'];
  custom?: boolean;
  /** Set when this row is a meta Pokemon after a speed-raising move. */
  boost?: { move: string; stages: number; pct: number | null };
}

const SCARF = 'Choice Scarf';
// A scarf row needs the scarf in the top 5 items and at least this usage %.
const SCARF_TOP = 5;
const SCARF_MIN_PCT = 5;

interface MetaSpeedRow {
  set: PokemonSet;
  /** Build share when the ladder entry has several builds (forms, physical / special). */
  share?: number;
  role?: MetaTarget['role'];
  custom?: boolean;
  scarfRow?: { set: PokemonSet; pct: number | null };
  setups: { move: string; stages: number; pct: number | null }[];
}

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
        {r.share != null && !r.boost && <span className="muted small"> 비중 {r.share}%</span>}
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

function SpeedLine({ members }: { members: PokemonSet[] }) {
  const [showScarf, setShowScarf] = useStoredState('pochamps.speed.scarf', true);
  // Setup moves are off by default: one row per move per Pokemon adds up quickly.
  const [setupOn, setSetupOn] = useStoredState<string[]>('pochamps.speed.setup', []);
  const [count, setCount] = useStoredState<'30' | '50' | '100'>('pochamps.speed.count', '50');
  const [format, setFormat] = useMetaFormat();
  const targets = useMetaTargets(Number(count), format);
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
          share: f.share,
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
      const base = { mine: false, share: r.share, role: r.role, custom: r.custom };
      out.push({ ...base, set: r.set, speed: effectiveSpeed(r.set) ?? 0 });
      if (showScarf && r.scarfRow) {
        out.push({ ...base, share: undefined, set: r.scarfRow.set, speed: effectiveSpeed(r.scarfRow.set) ?? 0, scarfPct: r.scarfRow.pct });
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
            value={count}
            onChange={setCount}
            options={[
              { value: '30', label: '상위 30' },
              { value: '50', label: '상위 50' },
              { value: '100', label: '상위 100' },
            ]}
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
      {targets.loading && <Loading label={`메타 상위 ${count}마리 세팅을 불러오는 중…`} />}
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
        표시합니다. 내 파티와 커스텀 샘플의 도구는 항상 반영합니다. 랭업기는 스카프 없이 기술을 1회 사용한 기준이며, 기술 상위 {SETUP_TOP}위
        안이면서 채용률 {SETUP_MIN_PCT}% 이상인 포켓몬(커스텀 샘플은 기술에 있으면)만 추가로 표시합니다(버튼 옆 숫자는 해당 마릿수, 칩 옆
        숫자는 채용률). 날씨 특성·순풍 등은 반영하지 않았습니다.
      </p>
    </>
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
          <Card title="스피드 라인">
            <SpeedLine members={members} />
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
