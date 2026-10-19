// Human scale, and permeability and active edges (pc/metrics/scale.py; docs/metrics.md).
import {
  ACTIVE_REACH_M, BLOCK_PERIMETER_M, BUILDING, DH_BAND, ENCLOSED_MAX_M, LOW_FRONTAGE_LEVELS, STOREY_M, STREET_W_M,
} from "../config.js";
import { isOpen, junctions, stepTo, walk, type Net } from "./network.js";

/** Calls `f(i, slot, j)` for each frontage link: a building cell's link to a cell inside the
 *  design that isn't building, or that a road crosses. Links off the design are skipped. */
function frontage(net: Net, f: (i: number, slot: number, j: number) => void) {
  const { G, d, L } = net, D = G.deg;
  for (let i = 0; i < G.n; i++) {
    if (d.use[i] !== BUILDING) continue;
    for (let k = 0; k < D; k++) {
      const s = i * D + k, j = G.nbr[s];
      if (j >= 0 && (L.cut[s] || d.use[j] !== BUILDING)) f(i, s, j);
    }
  }
}

/** Share of street faces whose width over height (D/H) is between 1 and 3. Width is the
 *  open run straight out from the face to the next building (plus a nominal street where a
 *  road crosses); a run that ends in nothing, or is longer than 120 m, encloses nothing. */
export function dhEnclosure(net: Net): number {
  const { G, d, L } = net, spacing = G.grid.spacing;
  let total = 0, good = 0;
  frontage(net, (i, slot, j) => {
    total++;
    const a = L.dir[slot], H = d.levels[i] * STOREY_M;
    let D = 0, s = slot, nxt = j, enclosed = false;
    for (;;) {
      if (L.cut[s]) D += STREET_W_M;
      if (d.use[nxt] === BUILDING) { enclosed = true; break; }
      D += spacing;
      if (D > ENCLOSED_MAX_M) break;
      [nxt, s] = stepTo(net, nxt, a);
      if (nxt < 0) break;
    }
    if (enclosed && D / H >= DH_BAND[0] && D / H <= DH_BAND[1]) good++;
  });
  return total ? good / total : 0;
}

/** Each block's perimeter in metres: its cells' links to anything outside the block. */
export function perimeters(net: Net): number[] {
  const { G, L, block, blocks } = net, D = G.deg;
  return blocks.map((cells, b) => {
    let edges = 0;
    for (const i of cells) {
      for (let k = 0; k < D; k++) {
        const j = G.nbr[i * D + k];
        if (j < 0 || L.cut[i * D + k] || block[j] !== b) edges++;
      }
    }
    return edges * G.grid.edge;
  });
}

/** Share of building cells in blocks with a perimeter of 400 m or less. */
export function blockSize(net: Net): number {
  const per = perimeters(net);
  let all = 0, small = 0;
  net.blocks.forEach((cells, b) => { all += cells.length; if (per[b] <= BLOCK_PERIMETER_M) small += cells.length; });
  return all ? small / all : 0;
}

/** Share of street faces on buildings of six storeys or fewer. */
export function lowFrontage(net: Net): number {
  let total = 0, low = 0;
  frontage(net, (i) => { total++; if (net.d.levels[i] <= LOW_FRONTAGE_LEVELS) low++; });
  return total ? low / total : 0;
}

/** Junctions (open cells meeting three or more blocks) per km² of design ground. */
export function junctionDensity(net: Net): number {
  return junctions(net).length / ((net.G.n * net.G.cellArea) / 1e6);
}

/** How many different spaces each block opens onto (open patches, a road, the edge of the
 *  design), averaged over building cells. */
export function connections(net: Net): number {
  const { G, d, L, patch, blocks } = net, D = G.deg;
  let all = 0, sum = 0;
  for (const cells of blocks) {
    const spaces: number[] = [];
    let road = 0, edge = 0;
    for (const i of cells) {
      for (let k = 0; k < D; k++) {
        const j = G.nbr[i * D + k];
        if (j < 0) { edge = 1; continue; }
        if (L.cut[i * D + k]) road = 1;
        else if (isOpen(d.use[j]) && !spaces.includes(patch[j])) spaces.push(patch[j]);
      }
    }
    all += cells.length;
    sum += cells.length * (spaces.length + road + edge);
  }
  return all ? sum / all : 0;
}

/** Share of street faces within a 200 m walk of a centre, where ground floors are likely to
 *  be shops and workplaces (buildings carry no programme yet). */
export function activeFrontage(net: Net): number {
  if (!net.centres.length) return 0;
  const dist = walk(net.G, net.centres), reach = ACTIVE_REACH_M / net.G.grid.spacing;
  let total = 0, active = 0;
  frontage(net, (i) => { total++; if (dist[i] >= 0 && dist[i] <= reach) active++; });
  return total ? active / total : 0;
}
