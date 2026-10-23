// Runs the meta coverage calcs off the main thread so field toggles stay instant.
import { calcMoves, type CalcField, type MoveResult } from '../lib/calc';
import type { MetaTarget } from '../lib/meta';
import type { PokemonSet, SideExtras } from '../lib/sets';

export interface CoverageRequest {
  attacker: PokemonSet;
  extras: SideExtras;
  field: CalcField;
  isCrit: boolean;
  targets: MetaTarget[];
}

export type CoverageResult = { key: string; results: MoveResult[] }[];

self.onmessage = (e: MessageEvent<CoverageRequest & { id: number }>) => {
  const { id, attacker, extras, field, isCrit, targets } = e.data;
  const result: CoverageResult = targets.map((t) => ({
    key: t.key,
    results: calcMoves(attacker, extras, t.set, {}, field, isCrit, { describe: false }),
  }));
  self.postMessage({ id, result });
};
