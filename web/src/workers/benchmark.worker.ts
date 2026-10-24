// Offense and bulk of one set against every meta sample, off the main thread so SP sliders stay smooth.
import { bestMove, calcMoves, type MoveResult } from '../lib/calc';
import type { MetaTarget } from '../lib/meta';
import type { PokemonSet } from '../lib/sets';

export interface BenchmarkRequest {
  me: PokemonSet;
  targets: MetaTarget[];
}

export interface BenchmarkRow {
  key: string;
  /** My strongest move against this target. */
  offense?: MoveResult;
  /** This target's strongest move against me. */
  defense?: MoveResult;
}

export type BenchmarkResult = BenchmarkRow[];

self.onmessage = (e: MessageEvent<BenchmarkRequest & { id: number }>) => {
  const { id, me, targets } = e.data;
  const result: BenchmarkResult = targets.map((t) => ({
    key: t.key,
    // A boosted target keeps its stages both ways: its defenses when I attack, its attack when it does.
    offense: bestMove(calcMoves(me, {}, t.set, { boosts: t.boosts }, {}, false, { describe: false })),
    defense: bestMove(calcMoves(t.set, { boosts: t.boosts }, me, {}, {}, false, { describe: false })),
  }));
  self.postMessage({ id, result });
};
