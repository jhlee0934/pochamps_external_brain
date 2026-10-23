// Showdown-style team text. SP values go on the "EVs:" line (as Showdown's Champions
// format does); "SPs:" is also accepted on import. Korean names are accepted on import.
import { gen, toEnglish, toID, type Kind } from './data';
import { emptySp, newSet, normalizeSet, SP_MAX_PER_STAT, SP_MAX_TOTAL, spTotal, STATS, type PokemonSet, type Stat } from './sets';

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

/**
 * Species from a set's first line: "Nickname (Species) (M)", "Species", or a Korean name that
 * itself contains parentheses ("윈디(히스이의 모습)"). The whole name is tried before the last
 * parenthesized part, so such Korean names are not mistaken for a nickname + species.
 */
function parseSpecies(head: string): string | undefined {
  const bare = head.replace(/\s*\([MF]\)\s*$/, '').trim();
  const lastParen = /\(([^()]+)\)\s*$/.exec(bare)?.[1];
  for (const candidate of [bare, lastParen]) {
    if (!candidate) continue;
    try {
      const en = toEnglish('species', candidate.trim());
      const species = gen.species.get(toID(en));
      if (species) return species.name;
    } catch {
      // Not a known name; try the next reading.
    }
  }
  return undefined;
}

/**
 * The "EVs:" line. Values above 32 mean a regular Showdown EV spread, converted at 8 EV per SP;
 * a total still above 66 is trimmed from the largest stats so the set stays legal.
 */
function parseSp(line: string, species: string, warnings: string[]) {
  const sp = emptySp();
  const raw: Partial<Record<Stat, number>> = {};
  for (const part of line.split('/')) {
    const [value, label] = part.trim().split(/\s+/);
    const stat = STATS.find((s) => LABEL[s].toLowerCase() === label?.toLowerCase());
    if (stat) raw[stat] = Math.max(0, Number(value) || 0);
  }
  const evs = Object.values(raw).some((v) => v > SP_MAX_PER_STAT);
  for (const s of STATS) sp[s] = Math.min(SP_MAX_PER_STAT, evs ? Math.round((raw[s] ?? 0) / 8) : (raw[s] ?? 0));
  if (evs) warnings.push(`${species}: 노력치(EV)로 보고 SP로 환산했습니다 (8 EV ≈ 1 SP).`);
  if (spTotal(sp) > SP_MAX_TOTAL) {
    while (spTotal(sp) > SP_MAX_TOTAL) {
      const largest = STATS.reduce((a, b) => (sp[b] > sp[a] ? b : a));
      sp[largest] -= 1;
    }
    warnings.push(`${species}: SP 합계가 ${SP_MAX_TOTAL}을 넘어 큰 스탯부터 줄였습니다.`);
  }
  return sp;
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

    const [head, item] = lines[0].split(/\s@\s/);
    set.species = parseSpecies(head) ?? name('species', head.replace(/\s*\([MF]\)\s*$/, ''));
    if (item) set.item = name('items', item);

    for (const line of lines.slice(1)) {
      let m: RegExpExecArray | null;
      if ((m = /^Ability:\s*(.+)$/i.exec(line))) set.ability = name('abilities', m[1]);
      else if ((m = /^(?:EVs|SPs):\s*(.+)$/i.exec(line))) {
        set.sp = parseSp(m[1], set.species, warnings);
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
