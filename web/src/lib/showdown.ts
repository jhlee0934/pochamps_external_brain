// Showdown-style team text. SP values go on the "EVs:" line (as Showdown's Champions
// format does); "SPs:" is also accepted on import. Korean names are accepted on import.
import { toEnglish, type Kind } from './data';
import { newSet, normalizeSet, SP_MAX_PER_STAT, STATS, type PokemonSet, type Stat } from './sets';

const LABEL: Record<Stat, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

export function exportSet(set: PokemonSet): string {
  const lines = [set.item ? `${set.species} @ ${set.item}` : set.species];
  if (set.ability) lines.push(`Ability: ${set.ability}`);
  lines.push('Level: 50');
  const sp = STATS.filter((s) => set.sp[s] > 0).map((s) => `${set.sp[s]} ${LABEL[s]}`);
  if (sp.length) lines.push(`EVs: ${sp.join(' / ')}`);
  if (set.nature) lines.push(`${set.nature} Nature`);
  for (const m of set.moves) if (m) lines.push(`- ${m}`);
  return lines.join('\n');
}

export function exportTeam(sets: PokemonSet[]): string {
  return sets.map(exportSet).join('\n\n') + '\n';
}

export interface ImportResult {
  sets: PokemonSet[];
  warnings: string[];
}

export function importTeam(text: string): ImportResult {
  const warnings: string[] = [];
  const sets: PokemonSet[] = [];
  // Unknown names are reported and dropped (species keeps the raw text so the slot stays visible).
  const name = (kind: Kind, raw: string) => {
    try {
      return toEnglish(kind, raw.trim());
    } catch (e) {
      warnings.push((e as Error).message);
      return kind === 'species' ? raw.trim() : '';
    }
  };

  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const set = newSet();
    const moves: string[] = [];

    // "Nickname (Species) (M) @ Item" or "Species @ Item"
    const [head, item] = lines[0].split(/\s@\s/);
    const paren = [...head.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => !/^[MF]$/.test(p));
    set.species = name('species', paren.at(-1) ?? head.replace(/\([MF]\)/, ''));
    if (item) set.item = name('items', item);

    for (const line of lines.slice(1)) {
      let m: RegExpExecArray | null;
      if ((m = /^Ability:\s*(.+)$/i.exec(line))) set.ability = name('abilities', m[1]);
      else if ((m = /^(?:EVs|SPs):\s*(.+)$/i.exec(line))) {
        for (const part of m[1].split('/')) {
          const [value, label] = part.trim().split(/\s+/);
          const stat = STATS.find((s) => LABEL[s].toLowerCase() === label?.toLowerCase());
          if (stat) set.sp[stat] = Math.min(SP_MAX_PER_STAT, Math.max(0, Number(value) || 0));
        }
      } else if ((m = /^(.+?)\s+Nature$/i.exec(line))) set.nature = name('natures', m[1]);
      else if ((m = /^-\s*(.+)$/.exec(line))) {
        const move = name('moves', m[1]);
        if (move) moves.push(move);
      }
    }
    set.moves = [...moves.slice(0, 4), '', '', '', ''].slice(0, 4);
    sets.push(normalizeSet(set));
  }
  return { sets, warnings };
}
