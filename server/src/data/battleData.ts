// Adapter for the championsbattledata.com public API, shared by the MCP server and the web app.
// API rules allow reasonable caching but not a permanent mirror, so responses
// live only in an in-memory TTL cache and are never written to disk.

const settings = {
  baseUrl: 'https://championsbattledata.com',
  cacheTtlMs: 6 * 60 * 60_000,
  headers: {} as Record<string, string>,
};

export function configureBattleData(options: Partial<typeof settings>): void {
  Object.assign(settings, options);
}

export type Format = 'Singles' | 'Doubles';

interface RawRow {
  category: string;
  rank: number;
  name: string;
  percentage_value: number | null;
  stat_up: string;
  stat_down: string;
  hp_points: string;
  attack_points: string;
  defense_points: string;
  sp_atk_points: string;
  sp_def_points: string;
  speed_points: string;
}

interface RawBattle {
  pokemon: string;
  showdownId: string;
  format: string;
  season: string;
  date: string | null;
  rows: RawRow[];
}

export interface StatPoints {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Entry {
  name: string;
  pct: number | null;
}

export interface SpreadEntry {
  sp: StatPoints;
  pct: number | null;
}

export interface NatureEntry extends Entry {
  up: string;
  down: string;
}

export interface UsageSummary {
  pokemon: string;
  showdownId: string;
  format: string;
  season: string;
  moves: Entry[];
  items: Entry[];
  abilities: Entry[];
  natures: NatureEntry[];
  spreads: SpreadEntry[];
  teammates: string[];
}

// Caches the in-flight promise so concurrent callers share one request.
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function getJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < settings.cacheTtlMs) return hit.value as Promise<T>;

  const value = fetch(settings.baseUrl + path, { headers: settings.headers }).then((res) => {
    if (res.status === 404) throw new NotFoundError(path);
    if (!res.ok) throw new Error(`battle data request failed: ${res.status} ${path}`);
    return res.json() as Promise<T>;
  });
  cache.set(path, { at: Date.now(), value });
  value.catch(() => cache.delete(path));
  return value;
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`not found: ${path}`);
  }
}

const num = (s: string) => (s === '' ? 0 : Number(s));

function summarize(raw: RawBattle): UsageSummary {
  const of = (category: string) => raw.rows.filter((r) => r.category === category);
  const entries = (category: string): Entry[] =>
    of(category).map((r) => ({ name: r.name, pct: r.percentage_value }));

  return {
    pokemon: raw.pokemon,
    showdownId: raw.showdownId,
    format: raw.format,
    season: raw.season,
    moves: entries('move'),
    items: entries('held_item'),
    abilities: entries('ability'),
    natures: of('stat_alignment').map((r) => ({
      name: r.name,
      pct: r.percentage_value,
      up: r.stat_up,
      down: r.stat_down,
    })),
    spreads: of('stat_points').map((r) => ({
      sp: {
        hp: num(r.hp_points),
        atk: num(r.attack_points),
        def: num(r.defense_points),
        spa: num(r.sp_atk_points),
        spd: num(r.sp_def_points),
        spe: num(r.speed_points),
      },
      pct: r.percentage_value,
    })),
    teammates: of('teammate').map((r) => r.name),
  };
}

interface RawTop {
  name: string;
}

interface RawFormatSummary {
  position?: number;
  top?: Partial<Record<'move' | 'held_item' | 'ability' | 'stat_alignment', RawTop>>;
}

interface RawIndexPokemon {
  name: string;
  showdownId: string;
  learnableMoveNames?: string[];
  summary?: {
    types?: string[];
    battleSummary?: { Current?: Partial<Record<Format, RawFormatSummary>> };
  };
}

interface RawIndex {
  generatedAt: string;
  pokemon: RawIndexPokemon[];
}

interface RawDaily {
  showdownId: string;
  pokemon: string;
  format: string;
  daily: Array<{ season: string; date: string; rows: Array<RawRow & { column_position: number }> }>;
}

export interface RankingEntry {
  rank: number;
  pokemon: string;
  showdownId: string;
  types: string[];
  topMove?: string;
  topItem?: string;
  topAbility?: string;
  topNature?: string;
}

export async function getRanking(format: Format = 'Singles'): Promise<{ generatedAt: string; entries: RankingEntry[] }> {
  const index = await getJson<RawIndex>('/api');
  const entries: RankingEntry[] = [];
  for (const p of index.pokemon) {
    const s = p.summary?.battleSummary?.Current?.[format];
    if (s?.position == null) continue;
    entries.push({
      rank: s.position,
      pokemon: p.name,
      showdownId: p.showdownId,
      types: p.summary?.types ?? [],
      topMove: s.top?.move?.name,
      topItem: s.top?.held_item?.name,
      topAbility: s.top?.ability?.name,
      topNature: s.top?.stat_alignment?.name,
    });
  }
  entries.sort((a, b) => a.rank - b.rank);
  return { generatedAt: index.generatedAt, entries };
}

// Learnable moves for a base Pokemon in Champions; undefined when the index has no entry.
export async function getLearnset(showdownId: string): Promise<Set<string> | undefined> {
  const index = await getJson<RawIndex>('/api');
  const entry = index.pokemon.find((p) => p.showdownId === showdownId);
  return entry?.learnableMoveNames && new Set(entry.learnableMoveNames);
}

export interface TrendPoint {
  season: string;
  date: string; // YYYY-MM-DD
  rank: number | null;
  moves: Entry[];
  items: Entry[];
  natures: Entry[];
}

// Daily snapshots, oldest first. Each snapshot is season-to-date cumulative.
export async function getTrend(
  pokemon: string,
  format: Format = 'Singles',
  days = 14,
  season?: string,
  top = 3,
): Promise<{ pokemon: string; showdownId: string; format: string; points: TrendPoint[] }> {
  const query = new URLSearchParams({ days: String(days) });
  if (season) query.set('season', season);
  const raw = await getJson<RawDaily>(
    `/api/battle/${format}/${encodeURIComponent(pokemon)}?${query}`,
  );
  const points = raw.daily
    .map((d) => {
      const of = (category: string) =>
        d.rows
          .filter((r) => r.category === category)
          .slice(0, top)
          .map((r) => ({ name: r.name, pct: r.percentage_value }));
      const [dd, mm, yyyy] = d.date.split('_');
      return {
        season: d.season,
        date: `${yyyy}-${mm}-${dd}`,
        rank: d.rows[0]?.column_position ?? null,
        moves: of('move'),
        items: of('held_item'),
        natures: of('stat_alignment'),
      };
    })
    .reverse();
  return { pokemon: raw.pokemon, showdownId: raw.showdownId, format: raw.format, points };
}

export async function getUsage(
  pokemon: string,
  format: Format = 'Singles',
  season?: string,
): Promise<UsageSummary> {
  const query = season ? `?season=${encodeURIComponent(season)}` : '';
  const raw = await getJson<RawBattle>(
    `/api/battle/${format}/${encodeURIComponent(pokemon)}${query}`,
  );
  return summarize(raw);
}
