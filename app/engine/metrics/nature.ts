// Connection to nature, semilattice richness and legibility (pc/metrics/nature.py; docs/metrics.md).
import { BUILDING, CATCHMENT_M, GREEN_MIN_HA, LANDSCAPE, LEGIBLE_M, NATURE_WALK_M, WATER } from "../config.js";
import { activityStarts, isOpen, landmarks, near, walk, walkFrom, type Net } from "./network.js";

/** Cells of landscape patches of half a hectare or more. */
function parks(net: Net): number[] {
  const out: number[] = [];
  for (const cells of net.greens) if (cells.length * net.G.cellArea >= GREEN_MIN_HA * 1e4) out.push(...cells);
  return out;
}

const cellsOf = (net: Net, use: number) => [...Array(net.G.n).keys()].filter((i) => net.d.use[i] === use);

/** Share of building cells within `reach` metres' walk of `sources`. */
function within(net: Net, sources: number[], reach: number): number {
  const homes = cellsOf(net, BUILDING);
  if (!homes.length || !sources.length) return 0;
  const dist = walk(net.G, sources), steps = reach / net.G.grid.spacing;
  let c = 0;
  for (const i of homes) if (dist[i] >= 0 && dist[i] <= steps) c++;
  return c / homes.length;
}

/** Share of building cells within a 300 m walk of a park of 0.5 ha or more. */
export const greenWalk = (net: Net) => within(net, parks(net), NATURE_WALK_M);

/** Share of building cells within a 300 m walk of water. */
export const waterWalk = (net: Net) => within(net, cellsOf(net, WATER), NATURE_WALK_M);

/** Landscape share of the design ground. */
export const greenCover = (net: Net) => cellsOf(net, LANDSCAPE).length / net.G.n;

/** What a building sees: the share of open cells within two steps, averaged over buildings. */
export function greenView(net: Net): number {
  const { G, d } = net, D = G.deg;
  let sum = 0, nb = 0;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING) continue;
    // The cell, its ring of neighbours, then the ring beyond.
    const seen = [i];
    const grow = (c: number) => {
      for (let k = 0; k < D; k++) {
        const j = G.nbr[c * D + k];
        if (j >= 0 && !seen.includes(j)) seen.push(j);
      }
    };
    grow(i);
    const ring = seen.length;
    for (let h = 1; h < ring; h++) grow(seen[h]);
    let open = 0;
    for (let t = 1; t < seen.length; t++) if (isOpen(d.use[seen[t]])) open++;
    sum += seen.length > 1 ? open / (seen.length - 1) : 0;
    nb++;
  }
  return nb ? sum / nb : 0;
}

/** Share of design cells that are in more than one 400 m walking catchment, weighted by how
 *  many: 0 when each cell reaches one thing, 1 when every cell reaches every kind. The kinds:
 *  parks, water, shops (existing ones and the design's own centres), schools and transit,
 *  from Overture places. On sites exported without places: parks, water, centres and
 *  existing roads (a stand-in for transit). */
export function semilattice(net: Net): number {
  const { G, L } = net, D = G.deg, steps = CATCHMENT_M / G.grid.spacing, limit = Math.floor(steps);
  const kinds: [number, number][][] = [parks(net), cellsOf(net, WATER)].map((c) => c.map((i): [number, number] => [i, 0]));
  const centres = net.centres.map((i): [number, number] => [i, 0]);
  if (G.activities) {
    kinds.push([...activityStarts(G, "shops", CATCHMENT_M), ...centres], activityStarts(G, "schools", CATCHMENT_M),
      activityStarts(G, "transit", CATCHMENT_M));
  } else {
    const roadside: [number, number][] = [];
    for (let i = 0; i < G.n; i++) {
      for (let k = 0; k < D; k++) if (L.cut[i * D + k]) { roadside.push([i, 0]); break; }
    }
    kinds.push(centres, roadside);
  }
  const count = new Int32Array(G.n);
  for (const src of kinds) {
    if (!src.length) continue;
    const dist = walkFrom(G, src, limit);
    for (let i = 0; i < G.n; i++) if (dist[i] >= 0 && dist[i] <= steps) count[i]++;
  }
  let sum = 0;
  for (let i = 0; i < G.n; i++) sum += Math.max(count[i] - 1, 0) / (kinds.length - 1);
  return sum / G.n;
}

/** A placeholder until Phase 8: the share of design cells within 300 m of a landmark or a
 *  centre, something to find your way by. */
export const legibility = (net: Net) =>
  near(net.G, [...Array(net.G.n).keys()], [...landmarks(net), ...net.centres], LEGIBLE_M);
