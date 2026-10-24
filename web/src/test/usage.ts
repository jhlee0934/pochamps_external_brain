// Hand-written ladder data for tests. Numbers follow the shape of real Singles/Doubles entries
// (e.g. Garchomp's Timid vs Jolly split) without copying the API's responses.
import type { StatPoints, UsageSummary } from '../lib/data';

type Pct = [name: string, pct: number];

export const PHYSICAL: StatPoints = { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 };
export const SPECIAL: StatPoints = { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 };
export const BULKY: StatPoints = { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 };

export function usage(
  pokemon: string,
  {
    moves = [],
    items = [],
    natures = [],
    spreads = [],
    abilities = [],
  }: { moves?: Pct[]; items?: Pct[]; natures?: Pct[]; spreads?: [StatPoints, number][]; abilities?: Pct[] },
): UsageSummary {
  const entries = (list: Pct[]) => list.map(([name, pct]) => ({ name, pct }));
  return {
    pokemon,
    showdownId: pokemon.toLowerCase().replace(/[^a-z0-9]/g, ''),
    format: 'Singles',
    season: 'Current',
    moves: entries(moves),
    items: entries(items),
    abilities: entries(abilities),
    natures: natures.map(([name, pct]) => ({ name, pct, up: '', down: '' })),
    spreads: spreads.map(([sp, pct]) => ({ sp, pct })),
    teammates: [],
  };
}

/** Singles Garchomp: non-mega physical (Scarf, Sash), Mega Garchomp Z special. */
export const garchompSingles = usage('Garchomp', {
  moves: [['Earthquake', 65.4], ['Stealth Rock', 43.8], ['Flamethrower', 31.6], ['Draco Meteor', 30.6], ['Outrage', 26.9], ['Rock Tomb', 24], ['Earth Power', 23]],
  items: [['Garchompite Z', 37.3], ['Choice Scarf', 21.7], ['Focus Sash', 16.5], ['Sitrus Berry', 8.6], ['Rocky Helmet', 7.1]],
  natures: [['Timid', 25], ['Jolly', 24.1], ['Adamant', 23.7], ['Impish', 11.9], ['Modest', 6.9]],
  spreads: [[PHYSICAL, 27.9], [SPECIAL, 24], [BULKY, 2.3]],
  abilities: [['Rough Skin', 99.1]],
});

/** Singles Charizard: Mega Y special, Mega X physical. */
export const charizardSingles = usage('Charizard', {
  moves: [['Solar Beam', 60], ['Dragon Pulse', 50], ['Flamethrower', 45], ['Roost', 40], ['Flare Blitz', 30.5], ['Dragon Dance', 25], ['Thunder Punch', 18.8]],
  items: [['Charizardite Y', 67], ['Charizardite X', 31.9], ['Focus Sash', 0.2]],
  natures: [['Modest', 40], ['Timid', 27], ['Jolly', 20], ['Adamant', 12]],
  spreads: [[SPECIAL, 20], [PHYSICAL, 19]],
});

/** Doubles Lucario: Mega Lucario Z alone accounts for the special natures. */
export const lucarioDoubles = usage('Lucario', {
  moves: [['Aura Sphere', 86.8], ['Flash Cannon', 74.2], ['Detect', 50.8], ['Close Combat', 12], ['Protect', 32.3]],
  items: [['Lucarionite Z', 85.7], ['Lucarionite', 6.7], ['Focus Sash', 2.5], ['Choice Scarf', 1.9], ['Life Orb', 1.7]],
  natures: [['Modest', 43.8], ['Timid', 42.2], ['Adamant', 5], ['Jolly', 4.2]],
  spreads: [[SPECIAL, 34], [PHYSICAL, 5.3]],
});

/** Singles Salamence: physical Mega, with a special Mega minority no form explains. */
export const salamenceSingles = usage('Salamence', {
  moves: [['Double-Edge', 73.6], ['Earthquake', 72.1], ['Dragon Dance', 69.2], ['Roost', 54.1], ['Draco Meteor', 29.8], ['Fire Blast', 23.2]],
  items: [['Salamencite', 93.1], ['Choice Scarf', 3.4], ['Life Orb', 1.4], ['Rocky Helmet', 0.7]],
  natures: [['Adamant', 50], ['Jolly', 18], ['Modest', 13]],
  spreads: [[PHYSICAL, 34], [SPECIAL, 7]],
});

/** Doubles Salamence: special Mega; the few physical natures stay under the role threshold. */
export const salamenceDoubles = usage('Salamence', {
  moves: [['Protect', 92.2], ['Hyper Voice', 89.9], ['Tailwind', 61.6], ['Draco Meteor', 60.9], ['Double-Edge', 12.3]],
  items: [['Salamencite', 96.3], ['Haban Berry', 0.7]],
  natures: [['Timid', 54.7], ['Modest', 27.6], ['Hasty', 4.9], ['Adamant', 3.6], ['Jolly', 2.8]],
  spreads: [[SPECIAL, 43.2], [PHYSICAL, 2.9]],
});

/** Singles Dragonite: special Mega and physical base, both on Extreme Speed. */
export const dragoniteSingles = usage('Dragonite', {
  moves: [['Extreme Speed', 67], ['Flamethrower', 50], ['Thunderbolt', 40], ['Roost', 35], ['Earthquake', 24], ['Ice Spinner', 13.6]],
  items: [['Dragoninite', 69.7], ['Rocky Helmet', 18.2], ['Expert Belt', 4], ['Lum Berry', 2.5]],
  natures: [['Modest', 60], ['Adamant', 26], ['Timid', 11]],
  spreads: [[SPECIAL, 50], [PHYSICAL, 14]],
});

/** Singles Umbreon: bulky only, so no physical/special split at all. */
export const umbreonSingles = usage('Umbreon', {
  moves: [['Foul Play', 96], ['Wish', 80], ['Protect', 70], ['Yawn', 40]],
  items: [['Leftovers', 91.8]],
  natures: [['Bold', 50], ['Impish', 28], ['Calm', 18]],
  spreads: [[BULKY, 60]],
});
