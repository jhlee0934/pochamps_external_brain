// Custom samples: sets the user writes on a Pokemon page that join every meta comparison, whether
// or not the Pokemon makes the ranked sample (e.g. Alolan Persian outside the top 50).
import { useCallback, useMemo } from 'react';
import { toID, type UsageSummary } from './data';
import { useSharedStoredState } from './hooks';
import type { MetaTarget } from './meta';
import { battleSpecies, isSetEmpty, normalizeSet, type PokemonSet } from './sets';

export interface CustomSample {
  id: string;
  set: PokemonSet;
}

const KEY = 'pochamps.custom.v1';

/** Shown after every ranked target; also the sort key that keeps them last. */
export const CUSTOM_RANK = 1000;

/** Stored samples, cleaned of anything a hand-edited or older store could hold. */
function usable(samples: unknown): CustomSample[] {
  return Array.isArray(samples)
    ? samples.filter((s): s is CustomSample => typeof s?.id === 'string' && !isSetEmpty(s?.set))
    : [];
}

export function useCustomSamples() {
  const [raw, setRaw] = useSharedStoredState<CustomSample[]>(KEY, []);
  // Stable between renders, so meta target lists built from it don't restart worker jobs.
  const samples = useMemo(() => usable(raw), [raw]);
  const add = useCallback(
    (set: PokemonSet) => {
      const sample = { id: Math.random().toString(36).slice(2, 10), set: normalizeSet(set) };
      setRaw([...usable(raw), sample]);
      return sample.id;
    },
    [raw, setRaw],
  );
  const update = useCallback(
    (id: string, set: PokemonSet) => setRaw(usable(raw).map((s) => (s.id === id ? { ...s, set: normalizeSet(set) } : s))),
    [raw, setRaw],
  );
  const remove = useCallback((id: string) => setRaw(usable(raw).filter((s) => s.id !== id)), [raw, setRaw]);
  return { samples, add, update, remove };
}

// Custom sets have no ladder data; this stands in so code reading a target's usage sees the set itself.
function setUsage(set: PokemonSet): UsageSummary {
  const one = (name: string) => (name ? [{ name, pct: null }] : []);
  return {
    pokemon: set.species,
    showdownId: toID(set.species),
    format: 'Custom',
    season: '',
    moves: set.moves.filter(Boolean).map((name) => ({ name, pct: null })),
    items: one(set.item),
    abilities: one(set.ability),
    natures: [],
    spreads: [{ sp: set.sp, pct: null }],
    teammates: [],
  };
}

export function customTargets(samples: CustomSample[]): MetaTarget[] {
  return samples.map((s) => ({
    key: `custom-${s.id}-${toID(battleSpecies(s.set))}`,
    rank: CUSTOM_RANK,
    set: s.set,
    custom: true,
    usage: setUsage(s.set),
  }));
}
