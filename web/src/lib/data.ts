// Thin layer over the shared server modules: names, sprites and option lists for pickers.
import { toID } from '@smogon/calc';
import { gen } from '@shared/calc/champions';
import { toEnglish, toKorean, type Kind } from '@shared/i18n';
import pokeapiIds from '@shared/data/pokeapi-ids.json';

export { gen, toEnglish, toKorean, toID, type Kind };
export {
  getUsage,
  getRanking,
  getTrend,
  getLearnset,
  type Format,
  type UsageSummary,
  type StatPoints,
  type RankingEntry,
} from '@shared/data/battleData';

/** Korean name when known, English otherwise. */
export function ko(kind: Kind, en: string | undefined): string {
  if (!en) return '';
  return toKorean(kind, en) ?? en;
}

// "Charizard-Mega-Y" -> "Charizard", "Meowstic-F-Mega" -> "Meowstic-F", "Floette-Mega" -> "Floette-Eternal".
function megaBaseName(name: string, baseSpecies?: string): string {
  if (!name.includes('-Mega')) return name;
  const prefix = name.split('-Mega')[0].replace(/-M$/, ''); // Meowstic-M-Mega: the male form is the plain one
  return baseSpecies?.startsWith(prefix) ? baseSpecies : prefix;
}

/** Megas share their base Pokemon's ladder entry; other forms (Rotom-Wash, Raichu-Alola) have their own. */
export function usageKey(species: string): string {
  const s = gen.species.get(toID(species));
  return toID(s ? megaBaseName(s.name, s.baseSpecies) : species);
}

export function speciesTypes(species: string): string[] {
  return [...(gen.species.get(toID(species))?.types ?? [])];
}

// PokeAPI/sprites pinned to one commit so files never change underneath us.
const SPRITES =
  'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@97a7832d307311c0e1c6ea9035308bf80cc94f81/sprites/pokemon/';
const ids = pokeapiIds.pokemon as Record<string, number>;

export function spriteUrl(species: string, variant: 'icon' | 'art'): string | undefined {
  const s = gen.species.get(toID(species));
  const id = ids[toID(species)] ?? (s?.baseSpecies ? ids[toID(s.baseSpecies)] : undefined);
  if (!id) return undefined;
  return variant === 'icon'
    ? `${SPRITES}versions/generation-ix/champions/icons/${id}.png`
    : `${SPRITES}other/home/${id}.png`;
}

export interface Option {
  id: string;
  en: string;
  ko: string;
  hint?: string;
  search: string;
}

const norm = (s: string) => s.replace(/[\s()·:'.-]/g, '').toLowerCase();

function makeOption(kind: Kind, en: string, hint?: string): Option {
  const k = ko(kind, en);
  return { id: toID(en), en, ko: k, hint, search: norm(`${k} ${en}`) };
}

const STAT_KO: Record<string, string> = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };

const cache = new Map<string, Option[]>();
function memo(key: string, build: () => Option[]): Option[] {
  if (!cache.has(key)) cache.set(key, build().sort((a, b) => a.ko.localeCompare(b.ko, 'ko')));
  return cache.get(key)!;
}

// Mega forms are picked through the held stone, not as species.
export const speciesOptions = () =>
  memo('species', () => [...gen.species].filter((s) => !s.name.includes('-Mega')).map((s) => makeOption('species', s.name)));
export const itemOptions = () => memo('items', () => [...gen.items].map((i) => makeOption('items', i.name)));
export const abilityOptions = () => memo('abilities', () => [...gen.abilities].map((a) => makeOption('abilities', a.name)));
export const moveOptions = () =>
  memo('moves', () =>
    [...gen.moves]
      .filter((m) => m.id !== 'nomove')
      .map((m) => makeOption('moves', m.name, `${ko('types', m.type)} · ${categoryKo(m.category)}${m.basePower ? ` · ${m.basePower}` : ''}`)),
  );
export const natureOptions = () =>
  memo('natures', () =>
    [...gen.natures].map((n) =>
      makeOption('natures', n.name, n.plus === n.minus ? '무보정' : `${STAT_KO[n.plus!]}↑ ${STAT_KO[n.minus!]}↓`),
    ),
  );

/** Moves restricted to a learnset (names from the battle data index). */
export function learnsetOptions(learnset: Set<string> | undefined): Option[] {
  if (!learnset) return moveOptions();
  const ids = new Set<string>([...learnset].map(toID));
  return moveOptions().filter((o) => ids.has(o.id));
}

export function abilityOptionsFor(species: string): Option[] {
  const s = gen.species.get(toID(species));
  const own = s ? Object.values(s.abilities ?? {}).map((a) => toID(a as string)) : [];
  if (!own.length) return abilityOptions();
  const set = new Set<string>(own);
  return [...abilityOptions().filter((o) => set.has(o.id)), ...abilityOptions().filter((o) => !set.has(o.id))];
}

export function categoryKo(category: string | undefined): string {
  return category === 'Physical' ? '물리' : category === 'Special' ? '특수' : '변화';
}

export function filterOptions(options: Option[], query: string, limit = 60): Option[] {
  const q = norm(query);
  if (!q) return options.slice(0, limit);
  const starts: Option[] = [];
  const contains: Option[] = [];
  for (const o of options) {
    if (o.search.startsWith(q) || norm(o.ko).startsWith(q)) starts.push(o);
    else if (o.search.includes(q)) contains.push(o);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
