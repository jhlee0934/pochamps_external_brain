// Offense and bulk of one set against every meta sample, off the main thread so SP sliders stay smooth.
import { bestMove, calcMoves, movePower, type MoveResult } from '../lib/calc';
import type { MetaTarget } from '../lib/meta';
import type { Boosts, PokemonSet } from '../lib/sets';

export interface BenchmarkRequest {
  me: PokemonSet;
  /** My stages after my own setup moves. */
  meBoosts?: Boosts;
  targets: MetaTarget[];
}

export interface BenchmarkRow {
  key: string;
  /** My strongest move against this target. */
  offense?: MoveResult;
  /** This target's strongest move against me. */
  defense?: MoveResult;
  /** 결정력 of those moves (boosts included), for the icon tooltips. */
  offensePower?: number;
  defensePower?: number;
}

export type BenchmarkResult = BenchmarkRow[];

self.onmessage = (e: MessageEvent<BenchmarkRequest & { id: number }>) => {
  const { id, me, meBoosts, targets } = e.data;
  const mine = { boosts: meBoosts };
  const result: BenchmarkResult = targets.map((t) => {
    // A boosted target keeps its stages both ways: its defenses when I attack, its attack when it does.
    const offense = bestMove(calcMoves(me, mine, t.set, { boosts: t.boosts }, {}, false, { describe: false }));
    const defense = bestMove(calcMoves(t.set, { boosts: t.boosts }, me, mine, {}, false, { describe: false }));
    return {
      key: t.key,
      offense,
      defense,
      offensePower: offense && movePower(me, mine, offense.move)?.power,
      defensePower: defense && movePower(t.set, { boosts: t.boosts }, defense.move)?.power,
    };
  });
  self.postMessage({ id, result });
};
