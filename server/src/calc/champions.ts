// Damage calculation on top of @smogon/calc's Champions mechanics (generation 0).
// In gen 0 the calc treats `evs` as Stat Points, fixes IVs at 31 and level at 50.
import { calculate, Field, Generations, Move, Pokemon, toID } from '@smogon/calc';
import type { StatPoints } from '../data/battleData.js';

export const gen = Generations.get(0);

export const SP_MAX_PER_STAT = 32;
export const SP_MAX_TOTAL = 66;

export type StatID = keyof StatPoints;
export type Boosts = Partial<Record<Exclude<StatID, 'hp'>, number>>;

export interface SideInput {
  name: string;
  nature?: string;
  sp?: Partial<StatPoints>;
  item?: string;
  ability?: string;
  boosts?: Boosts;
  status?: 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
  curHpPercent?: number;
  /** Battle-state stacks that only matter when this side attacks. */
  stacks?: Stacks;
}

export interface Stacks {
  /** Times this Pokemon was hit (Rage Fist: +50 power each, max 6). */
  hitsTaken?: number;
  /** Fainted allies (Last Respects: +50 power each, default 2; Supreme Overlord: +10% each, default 0; max 5). */
  alliesFainted?: number;
  /** Consecutive uses with the Metronome item (+20% each, max 5). */
  metronomeUses?: number;
  /** A doubling condition is met (Stomping Tantrum, Temper Flare, Avalanche, Payback, Assurance). */
  conditionMet?: boolean;
}

// Last Respects assumes two fainted allies (power 150) unless told otherwise: a typical
// late-game state, and what bulk benchmarks should plan around.
export const LAST_RESPECTS_DEFAULT_FAINTED = 2;

// Moves whose power doubles under a battle condition the calc cannot see.
export const CONDITIONAL_DOUBLE = new Set(['stompingtantrum', 'temperflare', 'avalanche', 'payback', 'assurance']);

/** A move built with the attacker's stacks applied to its power. */
function buildMove(moveName: string, stacks: Stacks = {}, isCrit?: boolean): Move {
  const data = gen.moves.get(toID(moveName));
  const base = data?.basePower ?? 0;
  const id = toID(moveName);
  let basePower: number | undefined;
  if (id === 'ragefist') basePower = 50 + 50 * Math.min(6, stacks.hitsTaken ?? 0);
  else if (id === 'lastrespects') {
    basePower = 50 + 50 * Math.min(5, stacks.alliesFainted ?? LAST_RESPECTS_DEFAULT_FAINTED);
  }
  else if (CONDITIONAL_DOUBLE.has(id) && stacks.conditionMet) basePower = base * 2;
  return new Move(gen, moveName, {
    isCrit,
    timesUsedWithMetronome: stacks.metronomeUses,
    ...(basePower !== undefined && basePower !== base ? { overrides: { basePower } } : {}),
  });
}

export interface FieldInput {
  weather?: 'Sun' | 'Rain' | 'Sand' | 'Snow';
  terrain?: 'Electric' | 'Grassy' | 'Psychic' | 'Misty';
  defenderReflect?: boolean;
  defenderLightScreen?: boolean;
  defenderStealthRock?: boolean;
  defenderSpikes?: 0 | 1 | 2 | 3;
}

export interface CalcInput {
  attacker: SideInput;
  defender: SideInput;
  move: string;
  isCrit?: boolean;
  field?: FieldInput;
}

export class CalcInputError extends Error {}

function closest(id: string, names: Iterable<{ id: string; name: string }>): string[] {
  const out: string[] = [];
  for (const n of names) {
    if (n.id.includes(id) || id.includes(n.id)) out.push(n.name);
    if (out.length >= 5) break;
  }
  return out;
}

function requireName(
  kind: string,
  value: string,
  table: { get(id: string): { name: string } | undefined; [Symbol.iterator](): Iterator<{ id: string; name: string }> },
): string {
  const found = table.get(toID(value));
  if (found) return found.name;
  const hint = closest(toID(value), table);
  throw new CalcInputError(
    `Unknown ${kind} "${value}" in Pokemon Champions.` +
      (hint.length ? ` Did you mean: ${hint.join(', ')}?` : ''),
  );
}

export function validateSp(sp: Partial<StatPoints> = {}): void {
  let total = 0;
  for (const [stat, v] of Object.entries(sp)) {
    if (!Number.isInteger(v) || v! < 0 || v! > SP_MAX_PER_STAT) {
      throw new CalcInputError(`SP for ${stat} must be an integer 0-${SP_MAX_PER_STAT}, got ${v}`);
    }
    total += v!;
  }
  if (total > SP_MAX_TOTAL) {
    throw new CalcInputError(`SP total must be <= ${SP_MAX_TOTAL}, got ${total}`);
  }
}

export function buildPokemon(side: SideInput): Pokemon {
  const species = requireName('Pokemon', side.name, gen.species);
  validateSp(side.sp);
  const pokemon = new Pokemon(gen, species, {
    nature: side.nature ? requireName('nature', side.nature, gen.natures) : undefined,
    evs: side.sp,
    item: side.item ? requireName('item', side.item, gen.items) : undefined,
    ability: side.ability ? requireName('ability', side.ability, gen.abilities) : undefined,
    boosts: side.boosts,
    alliesFainted: side.stacks?.alliesFainted,
    status: side.status,
  });
  if (side.curHpPercent !== undefined) {
    pokemon.originalCurHP = Math.max(1, Math.floor((pokemon.maxHP() * side.curHpPercent) / 100));
  }
  return pokemon;
}

/**
 * `describe: false` skips the text description, which recomputes the KO chance internally;
 * bulk callers (the web app's meta coverage) only need the numbers.
 */
export function runCalc(input: CalcInput, { describe = true }: { describe?: boolean } = {}) {
  const attacker = buildPokemon(input.attacker);
  const defender = buildPokemon(input.defender);
  const moveName = requireName('move', input.move, gen.moves);
  const move = buildMove(moveName, input.attacker.stacks, input.isCrit);
  const result = calculate(gen, attacker, defender, move, buildField(input.field));
  const [min, max] = result.range();
  const hp = defender.maxHP();
  const ko = min === 0 && max === 0 ? null : result.kochance();

  return {
    description: max === 0 ? `${moveName} does no damage.` : describe ? result.desc() : '',
    damage: { min, max, minPercent: pct(min, hp), maxPercent: pct(max, hp) },
    // Type after the calc applied move/ability effects (Weather Ball, Terrain Pulse, Pixilate, ...).
    move: { name: moveName, type: result.move.type as string, category: result.move.category as string },
    // Not "ko": tool results use "ko" for Korean names.
    koChance: ko && { text: ko.text, hits: ko.n, chance: ko.chance },
    attacker: { name: attacker.name, item: attacker.item, ability: attacker.ability, stats: attacker.stats },
    defender: { name: defender.name, item: defender.item, ability: defender.ability, maxHP: hp, stats: defender.stats },
  };
}

export function buildField(f: FieldInput = {}): Field {
  return new Field({
    gameType: 'Singles',
    weather: f.weather,
    terrain: f.terrain,
    defenderSide: {
      isReflect: f.defenderReflect,
      isLightScreen: f.defenderLightScreen,
      isSR: f.defenderStealthRock,
      spikes: f.defenderSpikes,
    },
  });
}

/**
 * "결정력" (attack stat × base power × every attacker-side modifier: STAB, item, ability,
 * weather, terrain, type-changing moves) measured with the calc itself: the move is used on a
 * typeless dummy with 20 Def/SpD and the max roll is inverted through the damage formula.
 * Moves whose power depends on the target (Grass Knot, Heavy Slam) use the dummy's values.
 */
export function movePowerOf(
  attacker: SideInput,
  moveName: string,
  field: FieldInput = {},
): { power: number; type: string } | undefined {
  const move = buildMove(requireName('move', moveName, gen.moves), attacker.stacks);
  if (move.category !== 'Physical' && move.category !== 'Special') return undefined;
  const dummy = new Pokemon(gen, 'Snorlax', {
    ability: 'Pressure',
    overrides: { types: ['???'], baseStats: { hp: 200, atk: 80, def: 0, spa: 80, spd: 0, spe: 80 } },
  } as ConstructorParameters<typeof Pokemon>[2]);
  const run = (terrain: FieldInput['terrain']) =>
    calculate(gen, buildPokemon(attacker), dummy, move, buildField({ weather: field.weather, terrain }));
  let result = run(field.terrain);
  // Psychic Terrain blocks priority moves on grounded targets (the dummy); power ignores that.
  if (!result.range()[1] && field.terrain) result = run(undefined);
  const max = result.range()[1];
  // damage ≈ (22 × power / (50 × D) + 2) × modifiers, solved for power.
  const power = max ? Math.round(((max - 2) * 50 * dummy.stats.def) / 22) : 0;
  return { power, type: result.move.type as string };
}

// Floor to one decimal, matching the percentages in result.desc().
const pct = (dmg: number, hp: number) => Math.floor((dmg / hp) * 1000) / 10;
