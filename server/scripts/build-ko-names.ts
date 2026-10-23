// Builds src/data/ko-names.json from PokeAPI CSVs: npm run build:ko
// Keys are @smogon/calc ids for the Pokemon Champions data set (generation 0),
// values are official Korean names. src/data/ko-overrides.json fills the gaps.
import { readFileSync, writeFileSync } from 'node:fs';
import { Generations, toID } from '@smogon/calc';

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const KO = '3'; // languages.csv id for "ko"
const OUT = new URL('../src/data/ko-names.json', import.meta.url);
const OVERRIDES = new URL('../src/data/ko-overrides.json', import.meta.url);

const gen = Generations.get(0);

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += c, i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n') row.push(field), rows.push(row), (row = []), (field = '');
    else if (c !== '\r') field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function csv(name: string) {
  const res = await fetch(CSV_BASE + name + '.csv');
  if (!res.ok) throw new Error(`${name}.csv: ${res.status}`);
  return parseCsv(await res.text());
}

// identifier (as toID) -> Korean name, joined through the numeric id column.
async function names(table: string, namesTable: string, idColumn: string) {
  const [ids, rows] = await Promise.all([csv(table), csv(namesTable)]);
  const identById = new Map(ids.map((r) => [r.id, toID(r.identifier)]));
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.local_language_id !== KO || !r.name) continue;
    const ident = identById.get(r[idColumn]);
    if (ident) out.set(ident, r.name);
  }
  return out;
}

// form identifier (as toID) -> { full Korean name, Korean form label }
async function formNames() {
  const [forms, rows] = await Promise.all([csv('pokemon_forms'), csv('pokemon_form_names')]);
  const identById = new Map(forms.map((r) => [r.id, toID(r.identifier)]));
  const out = new Map<string, { full: string; form: string }>();
  for (const r of rows) {
    if (r.local_language_id !== KO) continue;
    const ident = identById.get(r.pokemon_form_id);
    if (ident) out.set(ident, { full: r.pokemon_name, form: r.form_name });
  }
  return out;
}

const REGIONS: Record<string, string> = { Alola: '알로라', Galar: '가라르', Hisui: '히스이', Paldea: '팔데아' };

// Smogon form ids differ from PokeAPI's (Meowstic-F vs meowstic-female, Tauros-Paldea-Aqua vs
// tauros-paldea-aqua-breed), so try a few spellings before giving up.
function findForm(id: string, forms: Map<string, { full: string; form: string }>) {
  const candidates = [id, id.replace(/f$/, 'female').replace(/fmega$/, 'femalemega'), id.replace(/m$/, 'male')];
  for (const c of candidates) if (forms.has(c)) return forms.get(c);
  for (const [ident, v] of forms) if (ident.startsWith(id)) return v;
  return undefined;
}

function speciesKo(
  s: { id: string; name: string },
  species: Map<string, string>,
  forms: Map<string, { full: string; form: string }>,
): string | undefined {
  const sp = gen.species.get(s.id)!;
  if (species.has(s.id)) return species.get(s.id);
  // Some forms (Aegislash-Blade, Floette-Eternal) carry no baseSpecies in the calc data.
  const baseName = sp.baseSpecies ?? sp.name.split('-')[0];
  const baseKo = species.get(toID(baseName));
  if (!baseKo) return undefined;
  const forme = sp.name.slice(baseName.length + 1);

  const form = findForm(s.id, forms);
  if (form?.full) return form.full;
  // Megas missing from PokeAPI's form table follow the official "메가<name><X/Y/Z>" pattern.
  const mega = /^(?:[FM]-)?Mega(?:-([XYZ]))?$/.exec(forme);
  if (mega) return `메가${baseKo}${mega[1] ?? ''}`;
  if (form?.form) return form.form.includes(baseKo) ? form.form : `${baseKo}(${form.form})`;
  const region = REGIONS[forme];
  if (region) return `${baseKo}(${region}의 모습)`;
  // No Korean form label anywhere: keep the English form name so forms stay distinguishable.
  return `${baseKo}(${forme})`;
}

function pick(
  kind: string,
  entries: Iterable<{ id: string; name: string }>,
  lookup: (e: { id: string; name: string }) => string | undefined,
  overrides: Record<string, string>,
) {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const e of entries) {
    const ko = overrides[e.id] ?? lookup(e);
    if (ko) out[e.id] = ko;
    else if (e.id !== 'nomove') missing.push(e.name);
  }
  console.log(`${kind}: ${Object.keys(out).length} mapped, ${missing.length} missing`, missing.join(', '));
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8')) as Record<string, Record<string, string>>;
const [species, forms, moves, items, abilities, natures, types] = await Promise.all([
  names('pokemon_species', 'pokemon_species_names', 'pokemon_species_id'),
  formNames(),
  names('moves', 'move_names', 'move_id'),
  names('items', 'item_names', 'item_id'),
  names('abilities', 'ability_names', 'ability_id'),
  names('natures', 'nature_names', 'nature_id'),
  names('types', 'type_names', 'type_id'),
]);

const result = {
  source: 'PokeAPI (https://github.com/PokeAPI/pokeapi) + ko-overrides.json',
  species: pick('species', gen.species, (s) => speciesKo(s, species, forms), overrides.species ?? {}),
  moves: pick('moves', gen.moves, (m) => moves.get(m.id), overrides.moves ?? {}),
  items: pick('items', gen.items, (i) => items.get(i.id), overrides.items ?? {}),
  abilities: pick('abilities', gen.abilities, (a) => abilities.get(a.id), overrides.abilities ?? {}),
  natures: pick('natures', gen.natures, (n) => natures.get(n.id), overrides.natures ?? {}),
  types: pick('types', gen.types, (t) => types.get(t.id), overrides.types ?? {}),
};

writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
console.log('wrote', OUT.pathname);
