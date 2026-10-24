import { Pokemon } from '@smogon/calc';
import type { SideInput, Stacks } from '@shared/calc/champions';
import { SP_MAX_PER_STAT, SP_MAX_TOTAL } from '@shared/calc/champions';
import { megaInfo, megaOptions, type MegaInfo } from '@shared/calc/forms';
import { buildFor } from '@shared/calc/roles';
import { gen, ko, toID, type StatPoints, type UsageSummary } from './data';

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

/**
 * Abilities that raise the holder's stats, with the stages of ONE activation. Ones that keep
 * stacking (Speed Boost every turn, Stamina on every hit) count once, like a setup move used once.
 */
export const ABILITY_BOOSTS: Record<string, Boosts> = {
  speedboost: { spe: 1 },
  stamina: { def: 1 },
  moxie: { atk: 1 },
  chillingneigh: { atk: 1 },
  grimneigh: { spa: 1 },
  defiant: { atk: 2 },
  competitive: { spa: 2 },
  justified: { atk: 1 },
  rattled: { spe: 1 },
  steadfast: { spe: 1 },
  weakarmor: { def: -1, spe: 2 },
  steamengine: { spe: 6 },
  watercompaction: { def: 2 },
  berserk: { spa: 1 },
  angerpoint: { atk: 6 },
  angershell: { atk: 1, spa: 1, spe: 1, def: -1, spd: -1 },
  thermalexchange: { atk: 1 },
  windrider: { atk: 1 },
  sapsipper: { atk: 1 },
  motordrive: { spe: 1 },
  stormdrain: { spa: 1 },
  lightningrod: { spa: 1 },
  guarddog: { atk: 1 },
  intrepidsword: { atk: 1 },
  dauntlessshield: { def: 1 },
  embodyaspectteal: { spe: 1 },
  embodyaspecthearthflame: { atk: 1 },
  embodyaspectwellspring: { spd: 1 },
  embodyaspectcornerstone: { def: 1 },
};

/** Stages from one use of a setup move or one activation of a boosting ability. */
export const setupBoost = (name: string): Boosts | undefined => SETUP_BOOSTS[toID(name)] ?? ABILITY_BOOSTS[toID(name)];

export const isAbilitySetup = (name: string) => !SETUP_BOOSTS[toID(name)] && !!ABILITY_BOOSTS[toID(name)];

/** Korean name of a setup move or boosting ability. */
export const setupName = (name: string) => ko(isAbilitySetup(name) ? 'abilities' : 'moves', name);

/** Setup moves and abilities that raise Speed, with the stages of one use. */
export const SPEED_SETUP: Record<string, number> = Object.fromEntries(
  [...Object.entries(SETUP_BOOSTS), ...Object.entries(ABILITY_BOOSTS)].flatMap(([id, b]) =>
    (b.spe ?? 0) > 0 ? [[id, b.spe!]] : [],
  ),
);

/** Speed-line entries grouped per speed value, fastest first; my party leads each group. */
export function groupBySpeed<T extends { speed: number; mine: boolean }>(entries: T[]): { speed: number; entries: T[] }[] {
  const bySpeed = new Map<number, T[]>();
  for (const e of entries) bySpeed.set(e.speed, [...(bySpeed.get(e.speed) ?? []), e]);
  return [...bySpeed.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([speed, group]) => ({ speed, entries: [...group].sort((a, b) => Number(b.mine) - Number(a.mine)) }));
}

/** The ability a set battles with: a mega's own ability, otherwise the chosen (or default) one. */
export function battleAbility(set: PokemonSet, extras: SideExtras = {}): string {
  const species = battleSpecies(set, extras.mega ?? true);
  return species !== set.species ? defaultAbility(species) : set.ability || defaultAbility(species);
}

/** A set's own setup moves (move-slot order), then its battle ability if that raises stats. */
export function setupSourcesOf(set: PokemonSet, extras: SideExtras = {}): string[] {
  const ability = battleAbility(set, extras);
  return [
    ...set.moves.filter((m) => m && SETUP_BOOSTS[toID(m)]),
    ...(ability && ABILITY_BOOSTS[toID(ability)] ? [ability] : []),
  ];
}

/** Stages after one use of each setup move or ability, added up and kept within ±6. */
export function combineBoosts(moves: string[]): Boosts {
  const out: Boosts = {};
  for (const m of moves) {
    for (const [stat, n] of Object.entries(setupBoost(m) ?? {}) as [keyof Boosts, number][]) {
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

/** Setup moves and abilities toggled on for a set, ignoring any it no longer has. */
export const activeSetups = (set: PokemonSet, extras: SideExtras) =>
  setupSourcesOf(set, extras).filter((m) => extras.setups?.includes(m));

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

export interface MagicNumbers {
  /** 'up': the nature adds a bonus point at these SP. 'down': stop here, the next SP is wasted. */
  kind: 'up' | 'down';
  values: number[];
}

/**
 * SP worth stopping at on a stat the nature changes. With no nature effect every SP adds exactly 1,
 * so there are none. A raised stat gains 2 at a few SP (the bonus point lands there); a lowered stat
 * gains nothing at a few SP, so the value just before each wasted point is the one to stop at.
 */
export function magicNumbers(set: PokemonSet, stat: Stat, mega = true): MagicNumbers | undefined {
  const nature = set.nature ? gen.natures.get(toID(set.nature)) : undefined;
  if (!nature || nature.plus === nature.minus || (nature.plus !== stat && nature.minus !== stat)) return undefined;
  const at = (v: number) => statsOf({ ...set, sp: { ...set.sp, [stat]: v } }, mega)?.[stat];
  const values: number[] = [];
  let prev = at(0);
  if (prev === undefined) return undefined;
  for (let v = 1; v <= SP_MAX_PER_STAT; v++) {
    const cur = at(v)!;
    const gain = cur - prev;
    if (nature.plus === stat && gain >= 2) values.push(v);
    if (nature.minus === stat && gain === 0 && v - 1 > 0) values.push(v - 1);
    prev = cur;
  }
  return { kind: nature.plus === stat ? 'up' : 'down', values };
}
