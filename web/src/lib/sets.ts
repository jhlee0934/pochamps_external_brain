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

/** Moves that raise the user's Speed, with the number of stages one use gives. */
export const SPEED_SETUP: Record<string, number> = {
  shellsmash: 2,
  agility: 2,
  rockpolish: 2,
  shiftgear: 2,
  dragondance: 1,
  quiverdance: 1,
  flamecharge: 1,
  trailblaze: 1,
  rapidspin: 1,
  tidyup: 1,
  aquastep: 1,
};

export function isSetEmpty(set: PokemonSet | null | undefined): boolean {
  return !set || !set.species;
}
