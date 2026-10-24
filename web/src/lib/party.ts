import { createContext, useContext } from 'react';
import type { PokemonSet } from './sets';

export interface Party {
  id: string;
  name: string;
  slots: (PokemonSet | null)[]; // always 6
}

export interface PartyStore {
  parties: Party[];
  currentId: string;
}

/** Party presets a browser keeps at most. */
export const MAX_PARTIES = 6;

export const newParty = (name = '새 파티'): Party => ({
  id: Math.random().toString(36).slice(2, 10),
  name,
  slots: [null, null, null, null, null, null],
});

export function initialPartyStore(): PartyStore {
  const party = newParty('내 파티');
  return { parties: [party], currentId: party.id };
}

export interface PartyApi {
  store: PartyStore;
  current: Party;
  members: PokemonSet[];
  setStore: (update: (s: PartyStore) => PartyStore) => void;
  updateCurrent: (update: (p: Party) => Party) => void;
  addToParty: (set: PokemonSet) => boolean;
}

export const PartyContext = createContext<PartyApi | null>(null);

export function useParty(): PartyApi {
  const api = useContext(PartyContext);
  if (!api) throw new Error('PartyContext missing');
  return api;
}
