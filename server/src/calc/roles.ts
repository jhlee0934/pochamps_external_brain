// Physical/special builds, shared by the MCP server and the web app.
// The ladder data counts natures and spreads separately, so the top nature and the top spread can
// come from different builds (Garchomp: Timid nature with an Attack spread). Splitting both lists
// by role and pairing within a role gives builds that exist; the role shares say which forms
// (Mega Charizard X vs Y) play which role.
import { toID } from '@smogon/calc';
import type { StatPoints, UsageSummary } from '../data/battleData.js';
import { gen } from './champions.js';
import { megaInfo, megaOptions } from './forms.js';

export type Role = 'physical' | 'special';

export const ROLE_KO: Record<Role, string> = { physical: '물리', special: '특수' };

// SP at which a spread counts as invested in Attack or Sp. Atk.
const INVESTED = 16;
// A role gets its own build when its natures cover this share of the Pokemon's usage.
export const ROLE_MIN_PCT = 10;
// Role splits whose fit differs by less than this (percentage points) are equally good: the data
// lists only the top 10 natures and some natures serve neither role.
const FIT_TOLERANCE_PCT = 5;
// A form whose Sp. Atk / Attack ratio lies within this factor of 1 has no role of its own by stats
// (Mega Lucario 140/145, Mega Charizard X 130/130); others take the role their stats favour.
const MIXED_LEAN = 1.2;
// A form gets its own build when its mega stone is in the top 5 items with at least 5% usage.
// The base form counts too when the items that are not this Pokemon's stones add up to 5%.
const FORM_TOP = 5;
const FORM_MIN_PCT = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const emptySp = (): StatPoints => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const other = (role: Role): Role => (role === 'special' ? 'physical' : 'special');

/** Role a nature serves: by the stat it raises, else by the attacking stat it lowers. */
export function natureRole(name: string): Role | undefined {
  const n = gen.natures.get(toID(name));
  if (!n || n.plus === n.minus) return undefined;
  if (n.plus === 'atk' || (n.plus !== 'spa' && n.minus === 'spa')) return 'physical';
  if (n.plus === 'spa' || n.minus === 'atk') return 'special';
  return undefined;
}

/** Role a spread serves; bulky and mixed spreads serve neither. */
export function spreadRole(sp: StatPoints): Role | undefined {
  const atk = sp.atk >= INVESTED;
  const spa = sp.spa >= INVESTED;
  return atk === spa ? undefined : atk ? 'physical' : 'special';
}

type RoleShares = Record<Role, number>;

/**
 * Usage % of physical and special natures, for a Pokemon whose usage splits into both roles.
 * Both roles need an invested spread, otherwise bulky Pokemon would split by the attacking
 * stat their nature drops (Bold vs Impish Umbreon).
 */
function roleShares(usage: UsageSummary): RoleShares | undefined {
  const hasSpread = (role: Role) => usage.spreads.some((s) => spreadRole(s.sp) === role);
  if (!hasSpread('physical') || !hasSpread('special')) return undefined;
  const pct = (role: Role) =>
    usage.natures.filter((n) => natureRole(n.name) === role).reduce((sum, n) => sum + (n.pct ?? 0), 0);
  const shares = { physical: pct('physical'), special: pct('special') };
  return shares.physical + shares.special > 0 ? shares : undefined;
}

export interface Build {
  nature: string;
  sp: StatPoints;
  /** Four most used moves of the build's role ('' fills empty slots). */
  moves: string[];
  role?: Role;
}

const CATEGORY_ROLE: Record<string, Role> = { Physical: 'physical', Special: 'special' };

// Attacks both roles of a Pokemon run regardless of the numbers (showdownId -> move IDs).
const BOTH_ROLES: Record<string, string[]> = {
  dragonite: ['extremespeed'],
};

const moveRole = (name: string): Role | undefined => CATEGORY_ROLE[gen.moves.get(toID(name))?.category ?? ''];

/**
 * Most used moves a role's builds use: its own category and status moves. An attack of the other
 * category joins when its usage outruns the other role's share by ROLE_MIN_PCT, which only builds
 * of this role can account for (Extreme Speed on special Mega Dragonite), or when BOTH_ROLES says so.
 */
function roleMoves(usage: UsageSummary, role: Role | undefined, shares: RoleShares | undefined): string[] {
  const shared = new Set(BOTH_ROLES[usage.showdownId] ?? []);
  const fits = (m: UsageSummary['moves'][number]) => {
    const r = moveRole(m.name);
    if (!role || !shares || !r || r === role || shared.has(toID(m.name))) return true;
    return (m.pct ?? 0) > shares[r] + ROLE_MIN_PCT;
  };
  let picked = usage.moves.filter(fits);
  // A role whose own attacks miss the top list keeps the plain top moves rather than a build with
  // nothing to attack with.
  if (role && !picked.some((m) => moveRole(m.name) === role)) picked = usage.moves;
  const moves = picked.slice(0, 4).map((m) => m.name);
  // BOTH_ROLES moves always get a slot, taken from the least used status move (else the last move).
  if (role) {
    for (const m of picked.slice(4)) {
      if (!shared.has(toID(m.name))) continue;
      const statusAt = moves.findLastIndex((name) => !moveRole(name));
      moves[statusAt >= 0 ? statusAt : moves.length - 1] = m.name;
    }
  }
  while (moves.length < 4) moves.push('');
  return moves;
}

/** Most used nature, spread and moves of one role; falls back to the overall top when a list has none. */
export function roleBuild(usage: UsageSummary, role: Role | undefined): Build {
  const shares = role ? roleShares(usage) : undefined;
  const nature = (role && usage.natures.find((n) => natureRole(n.name) === role)) || usage.natures[0];
  const spread = (role && usage.spreads.find((s) => spreadRole(s.sp) === role)) || usage.spreads[0];
  return { nature: nature?.name ?? '', sp: spread?.sp ?? emptySp(), moves: roleMoves(usage, role, shares), role };
}

/** The role a species' base stats commit it to; undefined when Attack and Sp. Atk are close. */
function statRole(species: string): Role | undefined {
  const s = gen.species.get(toID(species))?.baseStats;
  if (!s) return undefined;
  const lean = s.spa / Math.max(1, s.atk);
  return lean >= MIXED_LEAN ? 'special' : lean <= 1 / MIXED_LEAN ? 'physical' : undefined;
}

const battleSpeciesOf = (base: string, item: string) =>
  megaOptions(base).find((m) => toID(m.stone) === toID(item))?.mega ?? base;

interface FormPart {
  item: string;
  share: number;
  role: Role;
}

/**
 * Role per form. Forms with lopsided base stats take that role, as long as the natures show the
 * role being played (ROLE_MIN_PCT); otherwise the data wins (Doubles Mega Salamence is special
 * despite its Attack). The remaining forms are split so the
 * special forms' usage best matches the special natures' share, and among splits that fit equally
 * well (within FIT_TOLERANCE_PCT), the majority role is explained by the fewest forms: with Mega
 * Lucario Z at 85.7% and special natures at 86%, the other Lucario forms are the physical ones.
 */
function assignRoles(base: string, forms: { item: string; share: number }[], shares: RoleShares): FormPart[] {
  const fixed = forms.map((f) => {
    const role = statRole(battleSpeciesOf(base, f.item));
    return role && shares[role] >= ROLE_MIN_PCT ? role : undefined;
  });
  const free = forms.map((_, i) => i).filter((i) => !fixed[i]);
  const majority: Role = shares.special >= shares.physical ? 'special' : 'physical';

  const options: { roles: Role[]; error: number; majorityForms: number }[] = [];
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const roles = forms.map((_, i) => fixed[i] ?? 'physical');
    free.forEach((i, bit) => {
      if (mask & (1 << bit)) roles[i] = 'special';
    });
    const special = forms.reduce((sum, f, i) => sum + (roles[i] === 'special' ? f.share : 0), 0);
    options.push({
      roles,
      error: Math.abs(special - shares.special),
      majorityForms: roles.filter((r) => r === majority).length,
    });
  }
  const best = Math.min(...options.map((o) => o.error));
  const [pick] = options
    .filter((o) => o.error <= best + FIT_TOLERANCE_PCT)
    .sort((a, b) => a.majorityForms - b.majorityForms || a.error - b.error);
  return forms.map((f, i) => ({ ...f, role: pick.roles[i] }));
}

export interface UsageVariant extends Build {
  item: string;
  /** Estimated share of the Pokemon's usage, when it has several builds. */
  share?: number;
  /**
   * The less used role of a form that has builds of both (special Mega Salamence next to the
   * physical one). Only these need their role named; forms with one role already tell apart.
   */
  minority?: boolean;
}

/**
 * One build per form and role. The ladder data merges a Pokemon's mega forms into one entry, so
 * held mega stones tell the forms apart; assignRoles pairs each form with a role, and a role the
 * forms leave short by ROLE_MIN_PCT or more (special Salamence, special Aegislash) becomes its own
 * build on the other role's most used form.
 */
export function usageVariants(species: string, usage: UsageSummary): UsageVariant[] {
  const base = megaInfo(species)?.base ?? species;
  const forms = formShares(base, usage);
  const shares = roleShares(usage);
  if (!shares) {
    const build = roleBuild(usage, undefined);
    return forms.map((f) => ({ ...build, item: f.item, share: forms.length > 1 ? f.share : undefined }));
  }

  const parts = assignRoles(base, forms, shares);
  for (const role of ['special', 'physical'] as const) {
    const assigned = parts.reduce((sum, p) => sum + (p.role === role ? p.share : 0), 0);
    const short = shares[role] - assigned;
    if (short < ROLE_MIN_PCT) continue;
    const donor = parts.filter((p) => p.role === other(role)).sort((a, b) => b.share - a.share)[0];
    if (!donor) continue;
    const carved = Math.min(short, donor.share);
    donor.share -= carved;
    parts.push({ item: donor.item, share: carved, role });
  }

  const kept = parts.filter((p) => p.share > 0).sort((a, b) => b.share - a.share);
  const split = new Set(kept.map((p) => p.role)).size > 1;
  return kept.map((p) => ({
    ...roleBuild(usage, p.role),
    role: split ? p.role : undefined,
    item: p.item,
    share: kept.length > 1 ? round1(p.share) : undefined,
    minority: kept.find((q) => q.item === p.item) !== p || undefined,
  }));
}

/** Held item and usage share per form; a Pokemon without a separate form gets one entry at 100. */
function formShares(base: string, usage: UsageSummary): { item: string; share: number }[] {
  const topItem = usage.items[0]?.name ?? '';
  const stones = new Set(megaOptions(base).map((m) => toID(m.stone)));
  if (!stones.size) return [{ item: topItem, share: 100 }];

  const forms: { item: string; share: number }[] = [];
  for (const item of usage.items.slice(0, FORM_TOP)) {
    if (stones.has(toID(item.name)) && (item.pct ?? 0) >= FORM_MIN_PCT) forms.push({ item: item.name, share: item.pct ?? 0 });
  }
  const others = usage.items.filter((i) => !stones.has(toID(i.name)));
  const baseShare = round1(others.reduce((sum, i) => sum + (i.pct ?? 0), 0));
  if (baseShare >= FORM_MIN_PCT && others[0]) forms.push({ item: others[0].name, share: baseShare });
  return forms.length > 1 ? forms : [{ item: forms[0]?.item ?? topItem, share: 100 }];
}

/**
 * Nature, spread and moves for one species holding one item: the matching form's most used build.
 * A form too rare to have its own build takes the role its base stats favour, else the majority role.
 */
export function buildFor(species: string, item: string | undefined, usage: UsageSummary): Build {
  const base = megaInfo(species)?.base ?? species;
  const form = battleSpeciesOf(base, item ?? '');
  const match = usageVariants(base, usage).find((v) => battleSpeciesOf(base, v.item) === form);
  if (match) return match;
  const shares = roleShares(usage);
  if (!shares) return roleBuild(usage, undefined);
  const role = statRole(form);
  return roleBuild(usage, role && shares[role] >= ROLE_MIN_PCT ? role : shares.special >= shares.physical ? 'special' : 'physical');
}
