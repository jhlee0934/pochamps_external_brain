import { movePowerOf, runCalc, type FieldInput } from '@shared/calc/champions';
import { gen, toID } from './data';
import { battleSpecies, defaultAbility, toSide, type PokemonSet, type SideExtras } from './sets';

/** Field settings in the web app; `autoWeather: false` turns off weather from abilities. */
export interface CalcField extends FieldInput {
  autoWeather?: boolean;
}
export type { FieldInput };

const WEATHER_ABILITIES: Record<string, NonNullable<FieldInput['weather']>> = {
  drought: 'Sun',
  orichalcumpulse: 'Sun',
  drizzle: 'Rain',
  sandstream: 'Sand',
  snowwarning: 'Snow',
};

/** The ability a set battles with: a mega's own ability, otherwise the chosen (or default) one. */
export function battleAbility(set: PokemonSet, extras: SideExtras): string {
  const species = battleSpecies(set, extras.mega ?? true);
  return species !== set.species ? defaultAbility(species) : set.ability || defaultAbility(species);
}

export interface AutoWeather {
  weather: NonNullable<FieldInput['weather']>;
  ability: string;
  species: string;
}

/**
 * Weather set by an ability on entry (Drought, Sand Stream, ...). A weather picked by hand wins;
 * otherwise the attacker's ability, then the defender's.
 */
export function autoWeather(
  field: CalcField,
  attacker: PokemonSet,
  aExtras: SideExtras,
  defender: PokemonSet,
  dExtras: SideExtras,
): AutoWeather | undefined {
  if (field.weather || field.autoWeather === false) return undefined;
  for (const [set, extras] of [
    [attacker, aExtras],
    [defender, dExtras],
  ] as const) {
    if (!set.species) continue;
    const ability = battleAbility(set, extras);
    const weather = WEATHER_ABILITIES[toID(ability)];
    if (weather) return { weather, ability, species: battleSpecies(set, extras.mega ?? true) };
  }
  return undefined;
}

export interface MoveResult {
  move: string;
  type?: string;
  category?: string;
  min: number;
  max: number;
  minPercent: number;
  maxPercent: number;
  koText?: string;
  hits?: number;
  description: string;
  /** Why a damaging move did nothing, when it is a field rule rather than type immunity. */
  note?: string;
  error?: string;
}

/** Damage for each of the attacker's moves; status moves and blanks are skipped. */
export function calcMoves(
  attacker: PokemonSet,
  aExtras: SideExtras,
  defender: PokemonSet,
  dExtras: SideExtras,
  field: CalcField = {},
  isCrit = false,
  { describe = true }: { describe?: boolean } = {},
): MoveResult[] {
  const results: MoveResult[] = [];
  const auto = autoWeather(field, attacker, aExtras, defender, dExtras);
  const effective: FieldInput = auto ? { ...field, weather: auto.weather } : field;
  for (const move of attacker.moves) {
    const data = move ? gen.moves.get(toID(move)) : undefined;
    // Status moves carry no category in the calc data.
    if (!data || (data.category !== 'Physical' && data.category !== 'Special')) continue;
    try {
      const r = runCalc(
        { attacker: toSide(attacker, aExtras), defender: toSide(defender, dExtras), move, isCrit, field: effective },
        { describe },
      );
      const blocked =
        r.damage.max === 0 && (data.priority ?? 0) > 0 && effective.terrain === 'Psychic'
          ? '사이코필드: 땅에 있는 상대에게는 선공기가 막힘'
          : undefined;
      results.push({
        move: data.name,
        // The calc's type after Weather Ball, Terrain Pulse, Pixilate and the like.
        type: r.move.type ?? data.type,
        category: data.category,
        note: blocked,
        ...r.damage,
        koText: r.koChance?.text,
        hits: r.koChance?.hits,
        description: r.description,
      });
    } catch (e) {
      results.push({
        move: data.name,
        min: 0,
        max: 0,
        minPercent: 0,
        maxPercent: 0,
        description: '',
        error: (e as Error).message,
      });
    }
  }
  return results;
}

export function bestMove(results: MoveResult[]): MoveResult | undefined {
  return results.filter((r) => !r.error).sort((a, b) => b.maxPercent - a.maxPercent || b.minPercent - a.minPercent)[0];
}

const KO_TEXT: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^guaranteed OHKO/, () => '확정 1타'],
  [/^guaranteed (\d)HKO/, (m) => `확정 ${m[1]}타`],
  [/^([\d.]+)% chance to OHKO/, (m) => `난수 1타 (${m[1]}%)`],
  [/^([\d.]+)% chance to (\d)HKO/, (m) => `난수 ${m[2]}타 (${m[1]}%)`],
  [/^possible (\d+)HKO/, (m) => `${m[1]}타 이상`],
];

// Residual effects the calc folds into the KO chance ("... after Stealth Rock and Leftovers recovery").
const AFTER: [RegExp, (m: RegExpExecArray) => string][] = [
  [/Stealth Rock/, () => '스텔스록'],
  [/(\d) layers? of Spikes/, (m) => `압정 ${m[1]}단`],
  [/Leftovers recovery/, () => '먹다남은음식 회복'],
  [/Sitrus Berry recovery/, () => '자뭉열매 회복'],
  [/Black Sludge recovery/, () => '검은진흙 회복'],
  [/Grassy Terrain recovery/, () => '그래스필드 회복'],
  [/sandstorm damage/, () => '모래바람 피해'],
  [/burn damage/, () => '화상 피해'],
  [/toxic damage/, () => '맹독 피해'],
  [/poison damage/, () => '독 피해'],
];

/** Translates @smogon/calc KO text (e.g. "94.9% chance to 2HKO after Stealth Rock") to Korean. */
export function koTextKo(text: string | undefined): string {
  if (!text) return '효과 없음';
  const [head, after] = text.split(' after ');
  let main = text;
  for (const [re, fmt] of KO_TEXT) {
    const m = re.exec(head);
    if (m) {
      main = fmt(m);
      break;
    }
  }
  const extras = after
    ? AFTER.map(([re, fmt]) => re.exec(after)).flatMap((m, i) => (m ? [AFTER[i][1](m)] : []))
    : [];
  return extras.length ? `${main} (${extras.join('·')} 포함)` : main;
}

/**
 * "결정력" (attack stat × base power × STAB, item, ability, weather and terrain modifiers),
 * measured with the damage calc so special moves (Weather Ball, Terrain Pulse, Acrobatics,
 * Expanding Force, -ate abilities, ...) come out right. Undefined for status moves.
 */
export function movePower(
  set: PokemonSet,
  extras: SideExtras,
  moveName: string,
  field: FieldInput = {},
): { power: number; type: string } | undefined {
  try {
    return movePowerOf(toSide(set, extras), moveName, field);
  } catch {
    return undefined;
  }
}
