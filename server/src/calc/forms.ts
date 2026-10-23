// Mega forms and ladder keys, shared by the MCP server and the web app so both look up the
// same ladder entry for the same Pokemon.
import { toID } from '@smogon/calc';
import { gen } from './champions.js';

export interface MegaInfo {
  base: string;
  mega: string;
  stone: string;
}

// Built from the mega stones: each stone maps base species -> mega form.
const MEGA_BY_FORM = new Map<string, MegaInfo>();
const MEGAS_BY_BASE = new Map<string, MegaInfo[]>();
for (const item of gen.items) {
  const map = (item as { megaStone?: Record<string, string> }).megaStone;
  for (const [base, mega] of Object.entries(map ?? {})) {
    const info = { base, mega, stone: item.name };
    MEGA_BY_FORM.set(toID(mega), info);
    MEGAS_BY_BASE.set(toID(base), [...(MEGAS_BY_BASE.get(toID(base)) ?? []), info]);
  }
}
for (const list of MEGAS_BY_BASE.values()) list.sort((a, b) => a.mega.localeCompare(b.mega));

/** Base species, mega form and stone for a mega form; undefined for anything else. */
export const megaInfo = (species: string): MegaInfo | undefined => MEGA_BY_FORM.get(toID(species));

/** Mega evolutions available to a (non-mega) species. */
export const megaOptions = (species: string): MegaInfo[] => MEGAS_BY_BASE.get(toID(species)) ?? [];

/** Megas share their base Pokemon's ladder entry; other forms (Rotom-Wash, Raichu-Alola) have their own. */
export function usageKey(species: string): string {
  return toID(megaInfo(species)?.base ?? gen.species.get(toID(species))?.name ?? species);
}
