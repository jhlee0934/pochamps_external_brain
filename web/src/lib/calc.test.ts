import { describe, expect, it } from 'vitest';
import { bestMove, calcMoves, hitSummary, movePower } from './calc';
import type { PokemonSet } from './sets';

const garchomp: PokemonSet = {
  species: 'Garchomp',
  item: '',
  ability: 'Rough Skin',
  nature: 'Jolly',
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['Earthquake', 'Swords Dance', '', ''],
};
const corviknight: PokemonSet = {
  species: 'Corviknight',
  item: '',
  ability: 'Pressure',
  nature: 'Impish',
  sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
  moves: ['Body Press', '', '', ''],
};
const metagross: PokemonSet = { ...corviknight, species: 'Metagross', ability: 'Clear Body', moves: ['Iron Head', '', '', ''] };

const hit = (a: PokemonSet, aBoosts: object, d: PokemonSet, dBoosts: object) =>
  bestMove(calcMoves(a, { boosts: aBoosts }, d, { boosts: dBoosts }, {}, false, { describe: false }))!;

describe('boosts reach the damage calc', () => {
  it('raises damage when the attacker boosts Attack', () => {
    const plain = hit(garchomp, {}, metagross, {});
    const boosted = hit(garchomp, { atk: 2 }, metagross, {});
    expect(boosted.maxPercent).toBeGreaterThan(plain.maxPercent * 1.9);
  });

  it('lowers damage when the defender boosts Defense', () => {
    const plain = hit(garchomp, {}, metagross, {});
    const boosted = hit(garchomp, {}, metagross, { def: 2 });
    expect(boosted.maxPercent).toBeLessThan(plain.maxPercent * 0.6);
  });

  it('leaves damage alone when the defender only boosts its attacking stats', () => {
    // Dragon Dance on the target: my hit on it does not change, so it should not be listed twice.
    const plain = hit(garchomp, {}, metagross, {});
    const dd = hit(garchomp, {}, metagross, { atk: 1, spe: 1 });
    expect(dd.maxPercent).toBe(plain.maxPercent);
  });

  it("lets Foul Play hit harder after my own Attack boost", () => {
    // My Swords Dance moves Umbreon's Foul Play into 1HKO range in the bulk view; that is the real mechanic.
    const umbreon: PokemonSet = { ...corviknight, species: 'Umbreon', ability: 'Synchronize', moves: ['Foul Play', '', '', ''] };
    const plain = hit(umbreon, {}, garchomp, {});
    const afterMySwordsDance = hit(umbreon, {}, garchomp, { atk: 2 });
    expect(afterMySwordsDance.maxPercent).toBeGreaterThan(plain.maxPercent * 1.9);
  });

  it('includes boosts in 결정력', () => {
    const plain = movePower(garchomp, {}, 'Earthquake')!.power;
    const boosted = movePower(garchomp, { boosts: { atk: 2 } }, 'Earthquake')!.power;
    expect(boosted).toBeGreaterThan(plain * 1.9);
  });
});

describe('hitSummary', () => {
  it('shows only the move, its 결정력 and the HP it takes', () => {
    expect(hitSummary({ move: 'Iron Head', minPercent: 120.4, maxPercent: 142.4 }, 12345)).toBe(
      '아이언헤드 · 결정력 12,345 · 120.4–142.4%',
    );
    expect(hitSummary({ move: 'Iron Head', minPercent: 1, maxPercent: 2 })).toBe('아이언헤드 · 1–2%');
  });
});
