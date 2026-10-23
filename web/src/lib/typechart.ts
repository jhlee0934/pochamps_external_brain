import { gen, toID } from './data';

export const TYPES = [...gen.types].map((t) => t.name).filter((t) => t !== '???');

// Abilities that change how a type hits this Pokemon.
const ABILITY_MODS: Record<string, Record<string, number>> = {
  levitate: { Ground: 0 },
  eelevate: { Ground: 0 },
  eartheater: { Ground: 0 },
  waterabsorb: { Water: 0 },
  dryskin: { Water: 0, Fire: 1.25 },
  voltabsorb: { Electric: 0 },
  lightningrod: { Electric: 0 },
  motordrive: { Electric: 0 },
  flashfire: { Fire: 0 },
  sapsipper: { Grass: 0 },
  thickfat: { Fire: 0.5, Ice: 0.5 },
  heatproof: { Fire: 0.5 },
  waterbubble: { Fire: 0.5 },
  purifyingsalt: { Ghost: 0.5 },
  fluffy: { Fire: 2 },
};

export function multiplier(attackType: string, defenderTypes: string[], ability?: string): number {
  const chart = gen.types.get(toID(attackType))?.effectiveness as Record<string, number> | undefined;
  let m = 1;
  for (const t of defenderTypes) m *= chart?.[t] ?? 1;
  const mod = ability ? ABILITY_MODS[toID(ability)]?.[attackType] : undefined;
  m = mod === undefined ? m : m * mod;
  if (m > 1 && ['filter', 'solidrock'].includes(toID(ability ?? ''))) m *= 0.75;
  return m;
}

export function multiplierLabel(m: number): string {
  if (m === 0) return '0';
  if (m === 0.25) return '¼';
  if (m === 0.5) return '½';
  return `${m}`;
}

export const TYPE_COLOR: Record<string, string> = {
  Normal: '#9a9b8f',
  Fire: '#e8663a',
  Water: '#4a8fe0',
  Electric: '#e6b812',
  Grass: '#4fa846',
  Ice: '#58bfd6',
  Fighting: '#c2412f',
  Poison: '#9549a8',
  Ground: '#b38a45',
  Flying: '#7f96e8',
  Psychic: '#e8577f',
  Bug: '#8fa31e',
  Rock: '#a8954f',
  Ghost: '#6a559e',
  Dragon: '#5a5fd6',
  Dark: '#5a4d47',
  Steel: '#6f8ba0',
  Fairy: '#e086c9',
};
