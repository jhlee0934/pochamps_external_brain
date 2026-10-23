import { getRanking, getUsage, toID, usageKey, type UsageSummary } from './data';
import { battleSpecies, commonSet, megaOptions, type PokemonSet } from './sets';

export interface MetaTarget {
  /** Unique per form: one ladder entry can yield several targets (Mega X, Mega Y, base). */
  key: string;
  rank: number;
  set: PokemonSet;
  /** Share of this ladder entry using this form (item usage %), when the entry has several forms. */
  share?: number;
  /** The ladder entry's usage data (shared by all forms of the entry). */
  usage: UsageSummary;
}

// A form gets its own set when its mega stone is in the top 5 items with at least 5% usage.
// The base form counts too when the items that are not this Pokemon's stones add up to 5%.
const FORM_TOP = 5;
const FORM_MIN_PCT = 5;

/**
 * Most used set per form. The ladder data merges a Pokemon's mega forms into one entry, so the
 * single most used set would hide e.g. Mega Charizard X behind Mega Charizard Y; the held mega
 * stones tell the forms apart.
 */
export function metaVariants(species: string, usage: UsageSummary): { set: PokemonSet; share?: number }[] {
  const common = commonSet(species, usage);
  const stones = new Set(megaOptions(common.species).map((m) => toID(m.stone)));
  if (!stones.size) return [{ set: common }];

  const variants: { set: PokemonSet; share: number }[] = [];
  for (const item of usage.items.slice(0, FORM_TOP)) {
    if (stones.has(toID(item.name)) && (item.pct ?? 0) >= FORM_MIN_PCT) {
      variants.push({ set: { ...common, item: item.name }, share: item.pct ?? 0 });
    }
  }
  const others = usage.items.filter((i) => !stones.has(toID(i.name)));
  const baseShare = Math.round(others.reduce((sum, i) => sum + (i.pct ?? 0), 0) * 10) / 10;
  if (baseShare >= FORM_MIN_PCT && others[0]) {
    variants.push({ set: { ...common, item: others[0].name }, share: baseShare });
  }
  if (variants.length <= 1) return [{ set: variants[0]?.set ?? common }];
  return variants.sort((a, b) => b.share - a.share);
}

export const targetKey = (rank: number, set: PokemonSet) => `${rank}-${toID(battleSpecies(set))}`;

/** Most used sets (one per form) of the top Singles ladder Pokemon; requests are cached by the data layer. */
export async function loadMetaTargets(count: number): Promise<MetaTarget[]> {
  const { entries } = await getRanking('Singles');
  const lists = await Promise.all(
    entries.slice(0, count).map(async (e) => {
      try {
        const usage = await getUsage(usageKey(e.pokemon));
        return metaVariants(e.pokemon, usage).map((v) => ({ key: targetKey(e.rank, v.set), rank: e.rank, usage, ...v }));
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

/** "32%" style suffix for a form's share, empty for single-form entries. */
export const shareLabel = (t: { share?: number }) => (t.share != null ? ` (${t.share}%)` : '');
