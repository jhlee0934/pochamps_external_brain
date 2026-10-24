import { Pokemon } from '@smogon/calc';
import type { SideInput, Stacks } from '@shared/calc/champions';
import { SP_MAX_PER_STAT, SP_MAX_TOTAL } from '@shared/calc/champions';
import { megaInfo, megaOptions, type MegaInfo } from '@shared/calc/forms';
import { buildFor } from '@shared/calc/roles';
import { gen, toID, type StatPoints, type UsageSummary } from './data';

export { SP_MAX_PER_STAT, SP_MAX_TOTAL };

export interface PokemonSet {
  species: string;
  item: string;
  ability: string;
  nature: string;
  sp: StatPoints;
  moves: string[];
}

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type Stat = (typeof STATS)[number];
export const STAT_LABEL: Record<Stat, string> = {
  hp: 'HP',
  atk: '공격',
  def: '방어',
  spa: '특공',
  spd: '특방',
  spe: '스피드',
};

export const emptySp = (): StatPoints => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export function newSet(species = ''): PokemonSet {
  return { species, item: '', ability: '', nature: '', sp: emptySp(), moves: ['', '', '', ''] };
}

export const spTotal = (sp: StatPoints) => STATS.reduce((sum, s) => sum + (sp[s] ?? 0), 0);

export { megaOptions, type MegaInfo };

export const isMegaForm = (species: string) => !!megaInfo(species);

/** The species a mega form evolves from; other species are returned as is. */
export const megaBase = (species: string) => megaInfo(species)?.base ?? species;

/** "X" / "Y" / "Z", or "" for a species' only (or plain) mega. */
export function megaLabel(mega: string): string {
  return /-Mega-([XYZ])$/.exec(mega)?.[1] ?? '';
}

/** Mega form this set turns into, if the held item is one of its own mega stones. */
export function megaForm(set: Pick<PokemonSet, 'species' | 'item'>): string | undefined {
  if (!set.item) return undefined;
  return megaOptions(set.species).find((m) => toID(m.stone) === toID(set.item))?.mega;
}

/** Sets store the base species; a mega form becomes base species + its stone. */
export function normalizeSet<T extends PokemonSet | null | undefined>(set: T): T {
  const info = set && megaInfo(set.species);
  return info ? { ...set, species: info.base, item: info.stone } : set;
}

export function defaultAbility(species: string): string {
  const s = gen.species.get(toID(species));
  return (Object.values(s?.abilities ?? {})[0] as string | undefined) ?? '';
}

/** Species used in battle: the mega form when the stone is held and mega is on. */
export function battleSpecies(set: PokemonSet, mega = true): string {
  return (mega && megaForm(set)) || set.species;
}

/**
 * Most used option per field. Fields are independent in the data, so this approximates a real set;
 * nature, spread and moves come from the same physical/special build so they match each other.
 * Passing a mega form keeps it: the set gets the base species holding that mega's stone.
 */
export function commonSet(species: string, usage: UsageSummary): PokemonSet {
  const mega = megaInfo(species);
  const item = mega?.stone ?? usage.items[0]?.name ?? '';
  const { nature, sp, moves } = buildFor(species, item, usage);
  return {
    species: mega?.base ?? species,
    item,
    ability: usage.abilities[0]?.name ?? defaultAbility(mega?.base ?? species),
    nature,
    sp,
    moves,
  };
}

export interface SideExtras {
  mega?: boolean;
  boosts?: Partial<Record<Exclude<Stat, 'hp'>, number>>;
  status?: SideInput['status'];
  curHpPercent?: number;
  /** Rage Fist hits, fainted allies, Metronome uses, doubling conditions. */
  stacks?: Stacks;
  /** Setup moves used once each (calculator toggles); their stages add to `boosts`. */
  setups?: string[];
}

export function toSide(set: PokemonSet, extras: SideExtras = {}): SideInput {
  const species = battleSpecies(set, extras.mega ?? true);
  const isMega = species !== set.species;
  return {
    name: species,
    nature: set.nature || undefined,
    sp: set.sp,
    item: set.item || undefined,
    // A mega's ability replaces the base one; let the calc use the mega's own.
    ability: isMega ? undefined : set.ability || undefined,
    boosts: extras.boosts,
    status: extras.status,
    curHpPercent: extras.curHpPercent,
    stacks: extras.stacks,
  };
}

export function statsOf(set: PokemonSet, mega = true) {
  const species = battleSpecies(set, mega);
  if (!gen.species.get(toID(species))) return undefined;
  try {
    return new Pokemon(gen, species, {
      nature: set.nature || undefined,
      evs: set.sp,
    }).stats;
  } catch {
    return undefined;
  }
}

/** Speed after Choice Scarf; other modifiers (weather abilities, Tailwind) are ignored. */
export function effectiveSpeed(set: PokemonSet, mega = true, stages = 0): number | undefined {
  const base = statsOf(set, mega)?.spe;
  if (base === undefined) return undefined;
  const spe = stages ? Math.floor((base * (stages > 0 ? 2 + stages : 2)) / (stages > 0 ? 2 : 2 - stages)) : base;
  return toID(set.item) === 'choicescarf' ? Math.floor(spe * 1.5) : spe;
}

export type Boosts = NonNullable<SideExtras['boosts']>;

/** Moves that raise the user's stats, with the stages one use gives (drops included). */
export const SETUP_BOOSTS: Record<string, Boosts> = {
  swordsdance: { atk: 2 },
  dragondance: { atk: 1, spe: 1 },
  bulkup: { atk: 1, def: 1 },
  coil: { atk: 1, def: 1 },
  shiftgear: { atk: 1, spe: 2 },
  tidyup: { atk: 1, spe: 1 },
  victorydance: { atk: 1, def: 1, spe: 1 },
  bellydrum: { atk: 6 },
  shellsmash: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 },
  filletaway: { atk: 2, spa: 2, spe: 2 },
  growth: { atk: 1, spa: 1 },
  workup: { atk: 1, spa: 1 },
  nastyplot: { spa: 2 },
  calmmind: { spa: 1, spd: 1 },
  quiverdance: { spa: 1, spd: 1, spe: 1 },
  takeheart: { spa: 1, spd: 1 },
  tailglow: { spa: 3 },
  geomancy: { spa: 2, spd: 2, spe: 2 },
  irondefense: { def: 2 },
  acidarmor: { def: 2 },
  cottonguard: { def: 3 },
  cosmicpower: { def: 1, spd: 1 },
  amnesia: { spd: 2 },
  agility: { spe: 2 },
  rockpolish: { spe: 2 },
  autotomize: { spe: 2 },
  flamecharge: { spe: 1 },
  trailblaze: { spe: 1 },
  rapidspin: { spe: 1 },
  aquastep: { spe: 1 },
};

/** Moves that raise the user's Speed, with the number of stages one use gives. */
export const SPEED_SETUP: Record<string, number> = Object.fromEntries(
  Object.entries(SETUP_BOOSTS).flatMap(([id, b]) => ((b.spe ?? 0) > 0 ? [[id, b.spe!]] : [])),
);

/** Speed-line entries grouped per speed value, fastest first; my party leads each group. */
export function groupBySpeed<T extends { speed: number; mine: boolean }>(entries: T[]): { speed: number; entries: T[] }[] {
  const bySpeed = new Map<number, T[]>();
  for (const e of entries) bySpeed.set(e.speed, [...(bySpeed.get(e.speed) ?? []), e]);
  return [...bySpeed.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([speed, group]) => ({ speed, entries: [...group].sort((a, b) => Number(b.mine) - Number(a.mine)) }));
}

/** A set's own setup moves, in move-slot order. */
export const setupMovesOf = (set: PokemonSet) => set.moves.filter((m) => m && SETUP_BOOSTS[toID(m)]);

/** Stages after one use of each move, added up and kept within ±6. */
export function combineBoosts(moves: string[]): Boosts {
  const out: Boosts = {};
  for (const m of moves) {
    for (const [stat, n] of Object.entries(SETUP_BOOSTS[toID(m)] ?? {}) as [keyof Boosts, number][]) {
      out[stat] = Math.max(-6, Math.min(6, (out[stat] ?? 0) + n));
    }
  }
  return out;
}

// Korean community shorthand for the six stats.
const HABCDS: Record<Stat, string> = { hp: 'H', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S' };

/** "A32 S32 H2": invested stats, biggest first (HABCDS order on ties). */
export function spShort(sp: StatPoints): string {
  return STATS.filter((s) => sp[s] > 0)
    .sort((a, b) => sp[b] - sp[a] || STATS.indexOf(a) - STATS.indexOf(b))
    .map((s) => `${HABCDS[s]}${sp[s]}`)
    .join(' ') || '무투자';
}

export const sameSp = (a: StatPoints, b: StatPoints) => STATS.every((s) => a[s] === b[s]);

/** Setup moves toggled on for a set, ignoring any no longer in its move slots. */
export const activeSetups = (set: PokemonSet, extras: SideExtras) =>
  setupMovesOf(set).filter((m) => extras.setups?.includes(m));

/** Extras with the toggled setup moves' stages added to the hand-set ranks, within ±6. */
export function withSetups(set: PokemonSet, extras: SideExtras): SideExtras {
  const moves = activeSetups(set, extras);
  if (!moves.length) return extras;
  const boosts: Boosts = { ...extras.boosts };
  for (const [stat, n] of Object.entries(combineBoosts(moves)) as [keyof Boosts, number][]) {
    boosts[stat] = Math.max(-6, Math.min(6, (boosts[stat] ?? 0) + n));
  }
  return { ...extras, boosts };
}

/** "공격 +1 · 스피드 +1" style summary of a boost. */
export function boostText(boosts: Boosts): string {
  return (Object.entries(boosts) as [Exclude<Stat, 'hp'>, number][])
    .map(([stat, n]) => `${STAT_LABEL[stat]} ${n > 0 ? '+' : ''}${n}`)
    .join(' · ');
}

export function isSetEmpty(set: PokemonSet | null | undefined): boolean {
  return !set || !set.species;
}
