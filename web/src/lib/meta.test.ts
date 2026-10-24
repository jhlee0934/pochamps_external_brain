import { describe, expect, it } from 'vitest';
import { CUSTOM_RANK, customTargets } from './custom';
import { boostAffects, metaVariants, rankLabel, setupMoveCounts, setupsOf, targetKey, withBoosted, type MetaTarget } from './meta';
import { MAX_PARTIES } from './party';
import { boostText, combineBoosts, effectiveSpeed, groupBySpeed, SETUP_BOOSTS, setupMovesOf, SPEED_SETUP, type PokemonSet } from './sets';
import { salamenceSingles, usage } from '../test/usage';

const set = (species: string, moves: string[], item = ''): PokemonSet => ({
  species,
  item,
  ability: '',
  nature: 'Jolly',
  sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves,
});

const ladder = (moves: [string, number][]): MetaTarget => ({
  key: '1-x',
  rank: 1,
  set: set('Garchomp', moves.map(([m]) => m)),
  usage: usage('Garchomp', { moves }),
});

describe('setup moves', () => {
  it('takes popular setup moves of a ladder entry (top 6, 10%+)', () => {
    const t = ladder([['Earthquake', 90], ['Swords Dance', 40], ['Dragon Dance', 5]]);
    expect(setupsOf(t)).toEqual([{ move: 'Swords Dance', pct: 40 }]);
  });

  it("takes a custom sample's own setup moves", () => {
    const [t] = customTargets([{ id: 'a', set: set('Persian-Alola', ['Nasty Plot', 'Dark Pulse']) }]);
    expect(setupsOf(t)).toEqual([{ move: 'Nasty Plot', pct: null }]);
  });

  it('adds a boosted copy right after its target, with its own key and stages', () => {
    const t = ladder([['Swords Dance', 40], ['Earthquake', 90]]);
    const out = withBoosted([t], ['Swords Dance']);
    expect(out.map((x) => x.key)).toEqual(['1-x', '1-x+swordsdance']);
    expect(out[1].boosts).toEqual({ atk: 2 });
    expect(withBoosted([t], [])).toEqual([t]);
  });

  it('counts targets per setup move, filtered by what the move boosts', () => {
    const sd = ladder([['Swords Dance', 40]]);
    const agility = { ...ladder([['Agility', 40]]), key: '2-y' };
    expect(setupMoveCounts([sd, agility])).toEqual([['Swords Dance', 1], ['Agility', 1]]);
    expect(setupMoveCounts([sd, agility], (b) => Object.keys(b).some((s) => s !== 'spe'))).toEqual([['Swords Dance', 1]]);
  });

  it('derives Speed setup from the boost table', () => {
    expect(SPEED_SETUP.dragondance).toBe(1);
    expect(SPEED_SETUP.shellsmash).toBe(2);
    expect(SPEED_SETUP.swordsdance).toBeUndefined();
    expect(boostText(SETUP_BOOSTS.dragondance)).toBe('공격 +1 · 스피드 +1');
  });
});

describe('boostAffects: a boosted copy only joins comparisons its stages change', () => {
  const copy = (move: string) => ({ boosts: SETUP_BOOSTS[move] });
  it('plain targets join everything', () => {
    for (const aspect of ['offense', 'defense', 'speed'] as const) expect(boostAffects({}, aspect)).toBe(true);
  });
  it('Swords Dance: only their attacks on me', () => {
    expect(boostAffects(copy('swordsdance'), 'offense')).toBe(false);
    expect(boostAffects(copy('swordsdance'), 'defense')).toBe(true);
    expect(boostAffects(copy('swordsdance'), 'speed')).toBe(false);
  });
  it('Dragon Dance: their attacks and speed, not my attacks on them', () => {
    expect(boostAffects(copy('dragondance'), 'offense')).toBe(false);
    expect(boostAffects(copy('dragondance'), 'defense')).toBe(true);
    expect(boostAffects(copy('dragondance'), 'speed')).toBe(true);
  });
  it('Iron Defense: only my attacks on them', () => {
    expect(boostAffects(copy('irondefense'), 'offense')).toBe(true);
    expect(boostAffects(copy('irondefense'), 'defense')).toBe(false);
  });
  it('Shell Smash: everything, its drops included', () => {
    for (const aspect of ['offense', 'defense', 'speed'] as const) expect(boostAffects(copy('shellsmash'), aspect)).toBe(true);
  });
});

describe('custom samples', () => {
  it('become targets ranked after the ladder, labelled 커스텀', () => {
    const [t] = customTargets([{ id: 'a', set: set('Persian-Alola', ['Fake Out']) }]);
    expect(t.custom).toBe(true);
    expect(t.rank).toBe(CUSTOM_RANK);
    expect(rankLabel(t)).toBe('커스텀');
    expect(rankLabel({ rank: 12 })).toBe('12위');
    expect(t.key).toContain('custom-a');
  });
});

describe('meta variants', () => {
  it('labels only the minority build and keeps keys unique', () => {
    const v = metaVariants('Salamence', salamenceSingles);
    const keys = v.map((x) => targetKey(15, x.set, x.role));
    expect(new Set(keys).size).toBe(keys.length);
    expect(v.filter((x) => x.role).map((x) => x.role)).toEqual(['special']);
  });
});

describe('speed line', () => {
  it('puts equal speeds on one line, fastest first, my party first', () => {
    const lines = groupBySpeed([
      { speed: 100, mine: false, id: 'a' },
      { speed: 120, mine: false, id: 'b' },
      { speed: 100, mine: true, id: 'c' },
    ]);
    expect(lines.map((l) => l.speed)).toEqual([120, 100]);
    expect(lines[1].entries.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('applies speed stages and Choice Scarf', () => {
    const base = effectiveSpeed(set('Garchomp', []))!;
    expect(effectiveSpeed(set('Garchomp', []), true, 1)).toBe(Math.floor(base * 1.5));
    expect(effectiveSpeed(set('Garchomp', [], 'Choice Scarf'))).toBe(Math.floor(base * 1.5));
  });
});

describe('party presets', () => {
  it('are capped at six', () => {
    expect(MAX_PARTIES).toBe(6);
  });
});

describe('my setup moves', () => {
  it('are the setup moves in my own move slots', () => {
    expect(setupMovesOf(set('Garchomp', ['Earthquake', 'Swords Dance', '', 'Rock Polish']))).toEqual(['Swords Dance', 'Rock Polish']);
    expect(setupMovesOf(set('Garchomp', ['Earthquake', 'Outrage', '', '']))).toEqual([]);
  });

  it('add up their stages, within ±6', () => {
    expect(combineBoosts(['Swords Dance', 'Rock Polish'])).toEqual({ atk: 2, spe: 2 });
    expect(combineBoosts(['Dragon Dance', 'Swords Dance'])).toEqual({ atk: 3, spe: 1 });
    expect(combineBoosts(['Belly Drum', 'Swords Dance'])).toEqual({ atk: 6 });
    expect(combineBoosts(['Shell Smash'])).toEqual({ atk: 2, spa: 2, spe: 2, def: -1, spd: -1 });
    expect(combineBoosts([])).toEqual({});
  });
});
