// Korean <-> English name lookup backed by src/data/ko-names.json (npm run build:ko).
import { toID } from '@smogon/calc';
import { gen } from './calc/champions.js';
import koNames from './data/ko-names.json' with { type: 'json' };

export type Kind = 'species' | 'moves' | 'items' | 'abilities' | 'natures' | 'types';

const LABEL: Record<Kind, string> = {
  species: 'Pokemon',
  moves: 'move',
  items: 'item',
  abilities: 'ability',
  natures: 'nature',
  types: 'type',
};

const forward = koNames as unknown as Record<Kind, Record<string, string>>;

const HANGUL = /[가-힣]/;
/** Normalizes a name for matching: no spaces or punctuation, lowercase. */
export const norm = (s: string) => s.replace(/[\s()·:'.-]/g, '').toLowerCase();

// normalized Korean -> calc id. The first id wins, so base forms keep plain names
// (e.g. "냐오닉스" stays Meowstic even though both gendered megas are "메가냐오닉스").
const reverse = Object.fromEntries(
  (Object.keys(LABEL) as Kind[]).map((kind) => {
    const map = new Map<string, string>();
    const add = (key: string, id: string) => {
      if (!map.has(norm(key))) map.set(norm(key), id);
    };
    for (const [id, ko] of Object.entries(forward[kind])) add(ko, id);
    if (kind === 'species') {
      // Aliases for forms: "라이츄(알로라의 모습)" is also reachable as "알로라 라이츄" / "라이츄 알로라".
      for (const [id, ko] of Object.entries(forward[kind])) {
        const m = /^(.+)\((.+)\)$/.exec(ko);
        if (!m) continue;
        const form = m[2].replace(/의 ?모습$/, '');
        add(form + m[1], id);
        add(m[1] + form, id);
      }
    }
    return [kind, map];
  }),
) as Record<Kind, Map<string, string>>;

const tables = {
  species: gen.species,
  moves: gen.moves,
  items: gen.items,
  abilities: gen.abilities,
  natures: gen.natures,
  types: gen.types,
} as const;

export class NameError extends Error {}

export const isKorean = (s: string) => HANGUL.test(s);

/** Korean name -> English name. Non-Korean input is returned unchanged. */
export function toEnglish(kind: Kind, input: string): string {
  if (!isKorean(input)) return input;
  const id = reverse[kind].get(norm(input));
  if (id) return (tables[kind] as { get(id: string): { name: string } | undefined }).get(id)?.name ?? id;

  const key = norm(input);
  const hints: string[] = [];
  for (const [k, candidate] of reverse[kind]) {
    if (k.includes(key) || key.includes(k)) hints.push(forward[kind][candidate]);
    if (hints.length >= 5) break;
  }
  throw new NameError(
    `Unknown Korean ${LABEL[kind]} name "${input}".` +
      (hints.length ? ` Did you mean: ${[...new Set(hints)].join(', ')}?` : ''),
  );
}

/** English name or id -> Korean name, undefined when there is no Korean name on file. */
export function toKorean(kind: Kind, english: string | undefined): string | undefined {
  return english ? forward[kind][toID(english)] : undefined;
}
