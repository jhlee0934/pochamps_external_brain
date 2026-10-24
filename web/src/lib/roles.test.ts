import { describe, expect, it } from 'vitest';
import { buildFor, natureRole, spreadRole, usageVariants } from '@shared/calc/roles';
import {
  BULKY,
  charizardSingles,
  dragoniteSingles,
  garchompSingles,
  lucarioDoubles,
  PHYSICAL,
  salamenceDoubles,
  salamenceSingles,
  SPECIAL,
  umbreonSingles,
} from '../test/usage';

const byItem = (variants: ReturnType<typeof usageVariants>) => Object.fromEntries(variants.map((v) => [`${v.item}:${v.role}`, v]));

describe('nature and spread roles', () => {
  it('classifies natures by the stat raised, then the attacking stat lowered', () => {
    expect(natureRole('Adamant')).toBe('physical');
    expect(natureRole('Jolly')).toBe('physical');
    expect(natureRole('Modest')).toBe('special');
    expect(natureRole('Timid')).toBe('special');
    expect(natureRole('Hasty')).toBeUndefined();
    expect(natureRole('Hardy')).toBeUndefined();
  });

  it('classifies spreads by attacking investment', () => {
    expect(spreadRole(PHYSICAL)).toBe('physical');
    expect(spreadRole(SPECIAL)).toBe('special');
    expect(spreadRole(BULKY)).toBeUndefined();
  });
});

describe('usageVariants', () => {
  it('pairs Garchomp natures and spreads per form instead of Timid with an Attack spread', () => {
    const v = byItem(usageVariants('Garchomp', garchompSingles));
    expect(Object.keys(v)).toHaveLength(2);
    const z = v['Garchompite Z:special'];
    const base = v['Choice Scarf:physical'];
    expect(z.nature).toBe('Timid');
    expect(z.sp).toEqual(SPECIAL);
    expect(base.nature).toBe('Jolly');
    expect(base.sp).toEqual(PHYSICAL);
    // Distinct forms need no (물리)/(특수) label.
    expect(z.minority).toBeUndefined();
    expect(base.minority).toBeUndefined();
  });

  it('splits moves by role', () => {
    const v = byItem(usageVariants('Garchomp', garchompSingles));
    expect(v['Choice Scarf:physical'].moves).not.toContain('Flamethrower');
    expect(v['Choice Scarf:physical'].moves).toContain('Earthquake');
    expect(v['Garchompite Z:special'].moves).not.toContain('Earthquake');
    expect(v['Garchompite Z:special'].moves).toContain('Draco Meteor');
  });

  it('gives Mega Charizard Y the special build and X the physical one', () => {
    const v = byItem(usageVariants('Charizard', charizardSingles));
    expect(v['Charizardite Y:special'].nature).toBe('Modest');
    expect(v['Charizardite X:physical'].nature).toBe('Jolly');
  });

  it('explains Doubles special natures with Mega Lucario Z alone; the other forms are physical', () => {
    const v = usageVariants('Lucario', lucarioDoubles);
    expect(v.find((x) => x.item === 'Lucarionite Z')?.role).toBe('special');
    expect(v.find((x) => x.item === 'Lucarionite')?.role).toBe('physical');
    expect(v.find((x) => x.item === 'Focus Sash')?.role).toBe('physical');
  });

  it('carves a labelled special minority out of Singles Mega Salamence', () => {
    const v = usageVariants('Salamence', salamenceSingles);
    const megas = v.filter((x) => x.item === 'Salamencite');
    expect(megas).toHaveLength(2);
    const [major, minor] = megas;
    expect(major.role).toBe('physical');
    expect(major.minority).toBeUndefined();
    expect(minor.role).toBe('special');
    expect(minor.minority).toBe(true);
    expect(minor.share).toBe(13);
    expect(minor.moves).toEqual(expect.arrayContaining(['Draco Meteor', 'Fire Blast']));
    expect(minor.moves).not.toContain('Double-Edge');
  });

  it('keeps Doubles Mega Salamence as one special build: physical natures are under 10%', () => {
    const v = usageVariants('Salamence', salamenceDoubles);
    expect(v).toHaveLength(1);
    expect(v[0].nature).toBe('Timid');
    expect(v[0].sp).toEqual(SPECIAL);
    expect(v[0].minority).toBeUndefined();
  });

  it('keeps Extreme Speed on both Dragonite roles', () => {
    for (const v of usageVariants('Dragonite', dragoniteSingles)) expect(v.moves).toContain('Extreme Speed');
  });

  it('leaves bulky Pokemon unsplit, with their top nature and spread', () => {
    const v = usageVariants('Umbreon', umbreonSingles);
    expect(v).toHaveLength(1);
    expect(v[0].role).toBeUndefined();
    expect(v[0].nature).toBe('Bold');
    expect(v[0].sp).toEqual(BULKY);
  });
});

describe('buildFor', () => {
  it('matches a held item to its form build', () => {
    expect(buildFor('Garchomp', 'Garchompite Z', garchompSingles).nature).toBe('Timid');
    expect(buildFor('Garchomp', 'Choice Scarf', garchompSingles).nature).toBe('Jolly');
  });

  it('gives a form too rare for its own build the role its stats favour', () => {
    // Mega Garchomp (not Z) holds under 5%; its Attack makes it physical.
    expect(buildFor('Garchomp-Mega', 'Garchompite', garchompSingles).nature).toBe('Jolly');
  });
});
