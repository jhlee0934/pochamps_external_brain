import { Move } from '@smogon/calc';
import { getMoveEffectiveness } from '@smogon/calc/dist/mechanics/util.js';
import { gen, getRanking, getUsage, toID, usageKey, type Format, type UsageSummary } from './data';
import { mapLimited, metaVariants, type MetaTarget, targetKey } from './meta';
import { battleSpecies, defaultAbility } from './sets';
import { multiplier } from './typechart';

/** Bounded requests, with partial failures reported rather than silently omitted. */
export async function loadWeaknessSample(count: number, format: Format) {
  const ranking = await getRanking(format);
  const entries = ranking.entries.slice(0, count);
  let failed = 0;
  const rows = await mapLimited(entries, 4, async (entry): Promise<MetaTarget[]> => {
    try {
      const usage = await getUsage(usageKey(entry.pokemon), format);
      // Type matchups depend on the form, not on its physical/special build: one row per form.
      const forms = new Map<string, ReturnType<typeof metaVariants>[number]>();
      for (const variant of metaVariants(entry.pokemon, usage)) {
        const form = battleSpecies(variant.set);
        if (!forms.has(form)) forms.set(form, { ...variant, role: undefined });
      }
      return [...forms.values()].map((variant) => ({
        ...variant, rank: entry.rank, key: targetKey(entry.rank, variant.set), usage,
      }));
    } catch {
      failed++;
      return [];
    }
  });
  return { targets: rows.flat(), failed, total: entries.length };
}

export interface WeaknessMove {
  name: string;
  type: string;
  pct: number;
  multiplier: number;
}

/** HP condition is explicit; no weather, terrain, items or status are assumed. */
export function defensiveMultiplier(type: string, types: string[], ability: string, fullHp = false) {
  const value = multiplier(type, types, ability);
  return fullHp && toID(ability) === 'multiscale' ? value / 2 : value;
}

/** Match the Champions engine's type conversion and immunity rules, not a damage estimate. */
export function weaknessMove(
  name: string, types: string[], ability: string, attacker: MetaTarget['set'], fullHp = false,
): Omit<WeaknessMove, 'pct'> | undefined {
  const data = gen.moves.get(toID(name));
  if (!data || (data.category !== 'Physical' && data.category !== 'Special')) return undefined;
  // Fixed-damage moves do not exploit a 2x/4x type weakness.
  if (['seismictoss', 'nightshade', 'superfang', 'naturesmadness', 'ruination', 'endeavor', 'finalgambit', 'painsplit', 'counter', 'mirrorcoat', 'metalburst', 'dragonrage', 'sonicboom', 'fissure', 'sheercold', 'guillotine', 'horndrill'].includes(data.id)) return undefined;
  const species = battleSpecies(attacker);
  const attackAbility = toID(species === attacker.species ? attacker.ability || defaultAbility(species) : defaultAbility(species));
  const defendAbility = attackAbility === 'moldbreaker' ? '' : ability;
  const aid = toID(defendAbility);
  const move = new Move(gen, data.name);
  // Weather Ball and Terrain Pulse retain Normal without weather or terrain.
  if (!['weatherball', 'terrainpulse', 'struggle'].includes(data.id)) {
    const converted: Record<string, string> = { aerilate: 'Flying', dragonize: 'Dragon', pixilate: 'Fairy', refrigerate: 'Ice' };
    if (move.type === 'Normal' && converted[attackAbility]) move.type = converted[attackAbility] as typeof move.type;
    else if (attackAbility === 'liquidvoice' && move.flags.sound) move.type = 'Water';
  }
  if (data.id === 'ragingbull') {
    if (species === 'Tauros-Paldea-Blaze') move.type = 'Fire';
    else if (species === 'Tauros-Paldea-Aqua') move.type = 'Water';
  }
  if (data.id === 'aurawheel' && species === 'Morpeko-Hangry') move.type = 'Dark';
  let raw = types.reduce((value, type) => value * getMoveEffectiveness(gen, move, type as Parameters<typeof getMoveEffectiveness>[2], attackAbility === 'scrappy', false, false), 1);
  // Reuse constant type/ability modifiers while keeping Freeze-Dry/Flying Press exceptions.
  const chart = multiplier(move.type, types);
  const adjusted = defensiveMultiplier(move.type, types, defendAbility, fullHp);
  if (chart) raw *= adjusted / chart;
  else if (toID(defendAbility) === 'multiscale' && fullHp) raw /= 2;
  // Filter/Solid Rock depend on the move's actual effectiveness, including exceptions.
  if (['filter', 'solidrock'].includes(aid)) {
    if (chart > 1) raw /= 0.75;
    if (raw > 1) raw *= 0.75;
  }
  if ((move.flags.bullet && aid === 'bulletproof') ||
      (move.flags.sound && aid === 'soundproof') ||
      ((move.priority ?? 0) > 0 && ['queenlymajesty', 'armortail'].includes(aid))) raw = 0;
  if (move.flags.contact && ['fluffy', 'auraguard'].includes(aid) && attackAbility !== 'longreach') raw /= 2;
  if (aid === 'punkrock' && move.flags.sound) raw /= 2;
  // Fur Coat modifies the defensive stat, so retain the type matchup rather than treating it as a type resistance.
  return raw > 1 ? { name: data.name, type: move.type, multiplier: raw } : undefined;
}

export function findWeaknessAttackers(targets: MetaTarget[], types: string[], ability: string, minimumPct: number, fullHp = false) {
  return targets.flatMap((target) => {
    const moves = target.usage.moves.flatMap((entry) => {
      if (entry.pct == null || entry.pct < minimumPct) return [];
      const hit = weaknessMove(entry.name, types, ability, target.set, fullHp);
      return hit ? [{ ...hit, pct: entry.pct }] : [];
    }).sort((a, b) => b.multiplier - a.multiplier || b.pct - a.pct);
    return moves.length ? [{ target, moves }] : [];
  });
}

export function defenseAbilityOptions(species: string, usage?: UsageSummary): string[] {
  const data = gen.species.get(toID(species));
  const own = Object.values(data?.abilities ?? {}) as string[];
  // Mega abilities belong to the mega form, never the merged base usage entry.
  if (data?.baseSpecies && data.baseSpecies !== data.name && data.name.includes('-Mega')) return own;
  return [...new Set([...own, ...(usage?.abilities.map((entry) => entry.name) ?? [])])].filter((name) => !!gen.abilities.get(toID(name)));
}
