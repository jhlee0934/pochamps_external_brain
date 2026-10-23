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
}

export interface FieldInput {
  weather?: 'Sun' | 'Rain' | 'Sand' | 'Snow';
  terrain?: 'Electric' | 'Grassy' | 'Psychic' | 'Misty';
  defenderReflect?: boolean;
  defenderLightScreen?: boolean;
  defenderStealthRock?: boolean;
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

function buildPokemon(side: SideInput): Pokemon {
  const species = requireName('Pokemon', side.name, gen.species);
  validateSp(side.sp);
  const pokemon = new Pokemon(gen, species, {
    nature: side.nature ? requireName('nature', side.nature, gen.natures) : undefined,
    evs: side.sp,
    item: side.item ? requireName('item', side.item, gen.items) : undefined,
    ability: side.ability ? requireName('ability', side.ability, gen.abilities) : undefined,
    boosts: side.boosts,
    status: side.status,
  });
  if (side.curHpPercent !== undefined) {
    pokemon.originalCurHP = Math.max(1, Math.floor((pokemon.maxHP() * side.curHpPercent) / 100));
  }
  return pokemon;
}

export function runCalc(input: CalcInput) {
  const attacker = buildPokemon(input.attacker);
  const defender = buildPokemon(input.defender);
  const moveName = requireName('move', input.move, gen.moves);
  const move = new Move(gen, moveName, { isCrit: input.isCrit });
  const f = input.field ?? {};
  const field = new Field({
    gameType: 'Singles',
    weather: f.weather,
    terrain: f.terrain,
    defenderSide: {
      isReflect: f.defenderReflect,
      isLightScreen: f.defenderLightScreen,
      isSR: f.defenderStealthRock,
    },
  });

  const result = calculate(gen, attacker, defender, move, field);
  const [min, max] = result.range();
  const hp = defender.maxHP();
  const ko = min === 0 && max === 0 ? null : result.kochance();

  return {
    description: max === 0 ? `${moveName} does no damage.` : result.desc(),
    damage: { min, max, minPercent: pct(min, hp), maxPercent: pct(max, hp) },
    // Not "ko": tool results use "ko" for Korean names.
    koChance: ko && { text: ko.text, hits: ko.n, chance: ko.chance },
    attacker: { name: attacker.name, item: attacker.item, ability: attacker.ability, stats: attacker.stats },
    defender: { name: defender.name, item: defender.item, ability: defender.ability, maxHP: hp, stats: defender.stats },
  };
}

// Floor to one decimal, matching the percentages in result.desc().
const pct = (dmg: number, hp: number) => Math.floor((dmg / hp) * 1000) / 10;
