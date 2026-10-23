import { useCallback, useEffect, useMemo } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useStoredState } from './lib/hooks';
import { initialPartyStore, PartyContext, type Party, type PartyApi, type PartyStore } from './lib/party';
import { isMegaForm, normalizeSet, type PokemonSet } from './lib/sets';
import { MetaPage } from './pages/MetaPage';
import { PokemonPage } from './pages/PokemonPage';
import { PartyPage } from './pages/PartyPage';
import { CalcPage } from './pages/CalcPage';
import { MatchupPage } from './pages/MatchupPage';

const NAV = [
  { to: '/', label: '메타', end: true },
  { to: '/party', label: '내 파티' },
  { to: '/calc', label: '결정력 계산' },
  { to: '/matchup', label: '대면표' },
];

function resolveCurrentId(s: PartyStore): string {
  return s.parties.some((p) => p.id === s.currentId) ? s.currentId : s.parties[0].id;
}

// Storage that lost its parties (hand-edited, older format) starts over instead of crashing.
const isUsableStore = (s: PartyStore) => Array.isArray(s?.parties) && s.parties.length > 0;
const usable = (s: PartyStore) => (isUsableStore(s) ? s : initialPartyStore());

export function App() {
  const [storeRaw, setStoreRaw] = useStoredState<PartyStore>('pochamps.parties.v1', initialPartyStore);
  const store = useMemo(() => usable(storeRaw), [storeRaw]);

  const setStore = useCallback(
    (update: (s: PartyStore) => PartyStore) => setStoreRaw((s) => update(usable(s))),
    [setStoreRaw],
  );

  // Older saves could hold a mega form as the species; store it as base species + stone.
  useEffect(() => {
    if (!store.parties.some((p) => p.slots.some((s) => s && isMegaForm(s.species)))) return;
    setStoreRaw((raw) => {
      const s = usable(raw);
      return { ...s, parties: s.parties.map((p) => ({ ...p, slots: p.slots.map(normalizeSet) })) };
    });
  }, [store, setStoreRaw]);
  // Shown and edited party must be the same one: a stale or missing currentId falls back to the
  // first party everywhere, and is rewritten so storage agrees with what is on screen.
  const currentId = resolveCurrentId(store);
  const current = store.parties.find((p) => p.id === currentId)!;
  useEffect(() => {
    if (storeRaw !== store || store.currentId !== currentId) {
      setStoreRaw((s) => {
        const fixed = usable(s);
        return { ...fixed, currentId: resolveCurrentId(fixed) };
      });
    }
  }, [storeRaw, store, currentId, setStoreRaw]);

  const updateCurrent = useCallback(
    (update: (p: Party) => Party) =>
      setStoreRaw((raw) => {
        const s = usable(raw);
        const id = resolveCurrentId(s);
        return { ...s, parties: s.parties.map((p) => (p.id === id ? update(p) : p)) };
      }),
    [setStoreRaw],
  );

  const addToParty = useCallback(
    (set: PokemonSet) => {
      const free = current.slots.findIndex((x) => !x);
      if (free < 0) return false;
      updateCurrent((p) => ({ ...p, slots: p.slots.map((x, i) => (i === free ? set : x)) }));
      return true;
    },
    [current, updateCurrent],
  );

  const api = useMemo<PartyApi>(
    () => ({
      store,
      current,
      members: current.slots.filter((s): s is PokemonSet => !!s?.species),
      setStore,
      updateCurrent,
      addToParty,
    }),
    [store, current, setStore, updateCurrent, addToParty],
  );

  return (
    <PartyContext.Provider value={api}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <NavLink to="/" className="brand">
              <span className="brand-mark" aria-hidden />
              포챔스 외장두뇌
            </NavLink>
            <nav className="nav">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <main className="page">
          <Routes>
            <Route path="/" element={<MetaPage />} />
            <Route path="/pokemon/:id" element={<PokemonPage />} />
            <Route path="/party" element={<PartyPage />} />
            <Route path="/calc" element={<CalcPage />} />
            <Route path="/matchup" element={<MatchupPage />} />
          </Routes>
        </main>
        <footer className="footer">
          Battle data provided by{' '}
          <a href="https://championsbattledata.com/" target="_blank" rel="noreferrer">
            Pokemon Champions Battle Data
          </a>
          · 한국어 이름·이미지{' '}
          <a href="https://pokeapi.co/" target="_blank" rel="noreferrer">
            PokéAPI
          </a>
          · 데미지 계산{' '}
          <a href="https://github.com/smogon/damage-calc" target="_blank" rel="noreferrer">
            @smogon/calc
          </a>
          <br />
          Pokémon 및 관련 명칭·이미지의 권리는 The Pokémon Company, Nintendo, Creatures, GAME FREAK에 있습니다. 비공식 개인 프로젝트입니다.
        </footer>
      </div>
    </PartyContext.Provider>
  );
}
