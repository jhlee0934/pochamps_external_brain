import { ROLE_KO, usageVariants, type Role } from '@shared/calc/roles';
import { useMemo } from 'react';
import { customTargets, useCustomSamples } from './custom';
import { getRanking, getUsage, ko, toID, usageKey, type Format, type UsageSummary } from './data';
import { useAsync, useSharedStoredState, type AsyncState } from './hooks';
import { battleSpecies, boostText, commonSet, SETUP_BOOSTS, type Boosts, type PokemonSet } from './sets';

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
  /** A custom sample the user wrote, not a ladder entry. */
  custom?: boolean;
  /** Stat stages after one use of a setup move, when this target is the boosted copy of another. */
  boosts?: Boosts;
  /** The setup move behind `boosts` and its usage % (null for custom samples). */
  boost?: { move: string; pct: number | null };
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

/**
 * Meta targets plus the user's custom samples, which join every comparison whatever the count.
 * Custom samples change instantly; the ranked part reloads only when count or format change.
 */
export function useMetaTargets(count: number, format: Format): AsyncState<MetaTarget[]> {
  const ranked = useAsync(() => loadMetaTargets(count, format), [count, format]);
  const { samples } = useCustomSamples();
  const data = useMemo(() => ranked.data && [...ranked.data, ...customTargets(samples)], [ranked.data, samples]);
  return { ...ranked, data };
}

/** "12위", or "커스텀" for a custom sample. */
export const rankLabel = (t: { rank: number; custom?: boolean }) => (t.custom ? '커스텀' : `${t.rank}위`);

// A ladder Pokemon counts as running a setup move when it is in its top 6 moves at 10%+.
export const SETUP_TOP = 6;
export const SETUP_MIN_PCT = 10;

/** Setup moves a target runs: its own moves for a custom sample, popular ones for a ladder entry. */
export function setupsOf(t: MetaTarget): { move: string; pct: number | null }[] {
  if (t.custom) return t.set.moves.filter((m) => SETUP_BOOSTS[toID(m)]).map((move) => ({ move, pct: null }));
  return t.usage.moves
    .slice(0, SETUP_TOP)
    .filter((m) => SETUP_BOOSTS[toID(m.name)] && (m.pct ?? 0) >= SETUP_MIN_PCT)
    .map((m) => ({ move: m.name, pct: m.pct }));
}

/** Setup moves in a sample, with how many targets run each, most common first. */
export function setupMoveCounts(targets: MetaTarget[], filter: (boosts: Boosts) => boolean = () => true): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of targets) {
    for (const s of setupsOf(t)) if (filter(SETUP_BOOSTS[toID(s.move)])) counts.set(s.move, (counts.get(s.move) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** A boosted copy of every target running one of `moves`, right after its unboosted self. */
export function withBoosted(targets: MetaTarget[], moves: string[]): MetaTarget[] {
  if (!moves.length) return targets;
  return targets.flatMap((t) => [
    t,
    ...setupsOf(t)
      .filter((s) => moves.includes(s.move))
      .map((s) => ({ ...t, key: `${t.key}+${toID(s.move)}`, boosts: SETUP_BOOSTS[toID(s.move)], boost: s })),
  ]);
}

/**
 * Which comparison a target belongs in. A boosted copy only joins the comparisons its stages
 * change: my attacks on it need its defenses changed (Iron Defense, Shell Smash), its attacks on
 * me need its attacking stats changed (Swords Dance, Dragon Dance), speed needs Speed changed.
 * Elsewhere it would repeat the plain target's numbers.
 */
export type BoostAspect = 'offense' | 'defense' | 'speed';
const ASPECT_STATS: Record<BoostAspect, (keyof Boosts)[]> = {
  offense: ['def', 'spd'],
  defense: ['atk', 'spa'],
  speed: ['spe'],
};
export const boostAffects = (t: { boosts?: Boosts }, aspect: BoostAspect) =>
  !t.boosts || ASPECT_STATS[aspect].some((stat) => (t.boosts![stat] ?? 0) !== 0);

/** "칼춤 후 (공격 +2)" style label for a boosted target, empty otherwise. */
export const boostLabel = (t: { boosts?: Boosts; boost?: { move: string } }) =>
  t.boosts && t.boost ? `${ko('moves', t.boost.move)} 후 (${boostText(t.boosts)})` : '';

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
