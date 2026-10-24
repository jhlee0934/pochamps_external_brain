import { ROLE_KO, usageVariants, type Role } from '@shared/calc/roles';
import { getRanking, getUsage, ko, toID, usageKey, type Format, type UsageSummary } from './data';
import { useSharedStoredState } from './hooks';
import { battleSpecies, commonSet, type PokemonSet } from './sets';

export interface MetaTarget {
  /** Unique per build: one ladder entry can yield several targets (Mega X, Mega Y, base, special). */
  key: string;
  rank: number;
  set: PokemonSet;
  /** Share of this ladder entry using this build, when the entry has several builds. */
  share?: number;
  /** Set on the less used role of a form that has both (special Mega Salamence), to name it. */
  role?: Role;
  /** The ladder entry's usage data (shared by all builds of the entry). */
  usage: UsageSummary;
}

/**
 * Most used set per form and role. Forms are told apart by held mega stones (Mega Charizard X
 * vs Y); natures, spreads and moves are paired by role, and a role with no form of its own
 * (special Salamence) gets its own set. Ability stays the entry's most used one.
 */
export function metaVariants(species: string, usage: UsageSummary): { set: PokemonSet; share?: number; role?: Role }[] {
  const common = commonSet(species, usage);
  return usageVariants(species, usage).map(({ item, nature, sp, moves, share, role, minority }) => ({
    set: { ...common, item, nature, sp, moves },
    share,
    role: minority ? role : undefined,
  }));
}

export const targetKey = (rank: number, set: PokemonSet, role?: Role) =>
  `${rank}-${toID(battleSpecies(set))}${role ? `-${role}` : ''}`;

/** Most used sets (one per form and role) of the top ladder Pokemon; requests are cached by the data layer. */
export async function loadMetaTargets(count: number, format: Format): Promise<MetaTarget[]> {
  const { entries } = await getRanking(format);
  const lists = await Promise.all(
    entries.slice(0, count).map(async (e) => {
      try {
        const usage = await getUsage(usageKey(e.pokemon), format);
        return metaVariants(e.pokemon, usage).map((v) => ({ key: targetKey(e.rank, v.set, v.role), rank: e.rank, usage, ...v }));
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

/** "(특수)" style suffix for a minority build's role, empty otherwise. */
export const roleLabel = (t: { role?: Role }) => (t.role ? `(${ROLE_KO[t.role]})` : '');

/** Korean name of the form, with the role of a minority build. */
export const targetName = (t: { set: PokemonSet; role?: Role }) => `${ko('species', battleSpecies(t.set))}${roleLabel(t)}`;

/** "32%" style suffix for a build's share, empty for single-build entries. */
export const shareLabel = (t: { share?: number }) => (t.share != null ? ` (${t.share}%)` : '');

export const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'Singles', label: '싱글' },
  { value: 'Doubles', label: '더블' },
];

export const formatKo = (format: Format) => (format === 'Singles' ? '싱글' : '더블');

/** Singles/Doubles choice shared by the meta page and every meta comparison. */
export const useMetaFormat = () => useSharedStoredState<Format>('pochamps.meta.format', 'Singles');
