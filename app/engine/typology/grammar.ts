// The typology grammar (docs/typologies.md, "The grammar"): one set of parameters that every
// precedent in the library is written in, so a precedent can be drawn, measured, seeded into a
// search and crossed with another. `build` turns parameters into solids: convex prisms in
// metres (x east, y south, z up) on a plot whose corner is the origin.
//
//   arrangement  how units are put together: a row along a street, a ring of rooms, wings
//                round a court, free-standing units round a shared yard, a slab, a podium with
//                a tower, a pit sunk in the ground, terraces down a slope, a field of ponds,
//                long sheds, or a canopy on posts
//   unit         one house, room or bay: width along the street or ring, depth back from it
//   court        the open space the arrangement holds: a chowk, a yard, a pit
//   ground       a floor raised above flood, or sunk below the street
//
// Ranges are the search's, wider than any one precedent's: evolution may take a precedent past
// its own sizes to reach the density a block needs.

export type Arrangement =
  | "row" | "ring" | "court" | "cluster" | "slab" | "tower"
  | "sunken" | "terraces" | "ponds" | "shed" | "canopy";

export type Roof = "flat" | "gable" | "cone" | "dome" | "vault" | "mono";

/** The parts that make a precedent itself, beyond its massing: what catches the wind, lets the
 *  heat out, covers the water or the street, or lifts the floor. */
export type Feature =
  /** Towers that catch the wind above the roofs and send it down (badgir, malqaf). */
  | { kind: "windcatcher"; height: number; size?: number; count?: number }
  /** Chimneys or towers that let warm air out at the top, or cooling towers (PDEC). */
  | { kind: "stack"; height: number; size?: number; count?: number }
  /** A dome over the pit (a cistern, an ice house) or over the middle of the plan. */
  | { kind: "dome"; size?: number }
  /** A vault over the lanes between rows (a covered bazaar). */
  | { kind: "vault" }
  /** The ground floor set back under the upper floors: an arcade, a portico, a five-foot way. */
  | { kind: "arcade"; depth: number }
  /** Roofs that rise from the front to the back by this much (m). */
  | { kind: "slope"; rise: number };

export interface Params {
  arrangement: Arrangement;
  /** Unit footprint: rectangular, or round (bhunga, a round tulou's rooms). */
  footprint?: "rect" | "round";
  /** One unit along the street or ring (m). */
  width: number;
  /** One unit back from the street, or a ring's depth of rooms (m). */
  depth: number;
  storeys: number;
  /** Floor to floor (m). */
  floorH?: number;
  /** Units in a row or cluster; rooms in a ring. */
  count?: number;
  /** Rows of units (row, cluster); rings (ring); wings, 1-4 (court). */
  rows?: number;
  /** The open court: side of a square court or yard, a ring's inner diameter, a pit's side (m). */
  court?: number;
  /** Outer diameter of a ring, or of a round unit (m). */
  diameter?: number;
  /** Width of the street or lane in front, or between rows (m). */
  street?: number;
  /** Gap between free-standing units (m); 0 means shared walls. */
  gap?: number;
  /** A chowk or air well inside each unit, as a share of the unit's plan. */
  well?: number;
  /** Floor raised above the ground (m). */
  raised?: number;
  /** Depth sunk below the ground (m): a pit, a stepwell, a sunken court. */
  sunken?: number;
  /** Steps of a stepwell or terraces down a slope. */
  steps?: number;
  /** Tower on a podium: its plan (m) and storeys. */
  tower?: { width: number; depth: number; storeys: number };
  /** Eave or gallery overhang beyond the wall (m). */
  eave?: number;
  roof?: Roof;
  /** Share of the façade left open (jali, louvres, verandah): 0.05 closed to 0.8 open. */
  porosity?: number;
  /** Wall thickness (m): reported, not scored; there is no thermal model yet. */
  wall?: number;
  /** Water held: ponds, a pit or a tank (m deep). */
  water?: number;
  /** Trees on the open ground: a homegarden, a planted court, willows on a chinampa. */
  trees?: number;
  features?: Feature[];
}

export type Use = "built" | "water" | "green" | "ground" | "canopy" | "tree";

/** A convex prism: a footprint ring (anticlockwise seen from above), a base and a height. */
export interface Solid { ring: [number, number][]; z: number; h: number; use: Use; roof?: Roof; storeys?: number; /** A mono roof's rise (m). */ rise?: number }

export interface Built {
  solids: Solid[];
  /** The plot the arrangement occupies, with half the street in front (m). */
  plot: { w: number; d: number };
  /** Measured from the solids. */
  footprint: number;
  floorArea: number;
  /** Floor area over plot area. */
  fsi: number;
  /** Footprint over plot area. */
  gsi: number;
}

export const DEFAULT_FLOOR_H = 3.2;

const rect = (x: number, y: number, w: number, d: number): [number, number][] =>
  [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

/** A sector of an annulus as a convex quadrilateral (enough segments make it read round). */
const sector = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): [number, number][] => [
  [cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0)], [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)],
  [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)], [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1)],
];

const disc = (cx: number, cy: number, r: number, n = 16): [number, number][] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as [number, number]);

export const ringArea = (r: [number, number][]) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length]; s += a * d - b * c; }
  return Math.abs(s) / 2;
};

/** Parameters to solids. */
export function build(p: Params): Built {
  const fh = p.floorH ?? DEFAULT_FLOOR_H, S: Solid[] = [];
  const z0 = p.raised ?? 0, roof = p.roof ?? "flat";
  const add = (ring: [number, number][], storeys: number, use: Use = "built", z = z0, r: Roof = roof) =>
    S.push({ ring, z, h: storeys * fh, use, roof: r, storeys });
  let W = 0, D = 0;

  switch (p.arrangement) {
    case "row": {
      // Units side by side along a street; a lane between rows. A chowk cuts each unit into a
      // front and a back block.
      const n = p.count ?? 6, rows = p.rows ?? 1, st = p.street ?? 4, g = p.gap ?? 0;
      const arcade = (p.features ?? []).find((f) => f.kind === "arcade") as { depth: number } | undefined;
      // A unit's front block: with an arcade, its ground floor stands back behind posts.
      const front = (x: number, y: number, w: number, d: number) => {
        // (the arcade is on the side toward the viewer, +y, so the drawing shows it)
        if (!arcade || p.storeys < 2 || arcade.depth >= d - 1) { add(rect(x, y, w, d), p.storeys); return; }
        add(rect(x, y, w, d - arcade.depth), 1);
        add(rect(x, y, w, d), p.storeys - 1, "built", z0 + fh);
        const k = Math.max(1, Math.round(w / 3.5));
        for (let j = 0; j <= k; j++) S.push({ ring: rect(x + Math.min(w - 0.4, (j * w) / k), y + d - 0.4, 0.4, 0.4), z: z0, h: fh, use: "built", roof: "flat", storeys: 0 });
      };
      for (let r = 0; r < rows; r++) {
        const y = st / 2 + r * (p.depth + st);
        for (let i = 0; i < n; i++) {
          const x = i * (p.width + g);
          const well = p.well ?? 0;
          if (well > 0) {
            const wd = Math.sqrt(well * p.width * p.depth), front0 = (p.depth - wd) / 2;
            add(rect(x, y, p.width, front0), p.storeys);
            front(x, y + front0 + wd, p.width, p.depth - front0 - wd);
            // the chowk's sides: thin wings either side of the well, when it is narrower than the unit
            if (wd < p.width - 1) add(rect(x, y + front0, (p.width - wd) / 2, wd), p.storeys);
          } else front(x, y, p.width, p.depth);
        }
      }
      W = n * p.width + (n - 1) * g; D = rows * (p.depth + st);
      break;
    }
    case "ring": {
      // Concentric rings of rooms round a court; each ring may be lower than the last.
      // The inner rings sit evenly between the outer wall and the open court at the centre.
      const R = (p.diameter ?? 40) / 2, rings = p.rows ?? 1, n = p.count ?? 48;
      const cx = R, cy = R, rc = Math.min((p.court ?? 0) / 2, R - rings * p.depth);
      const gapR = rings > 1 ? Math.max(0, (R - rc - rings * p.depth) / (rings - 0.5)) : 0;
      for (let k = 0; k < rings; k++) {
        const r1 = R - k * (p.depth + gapR), r0 = r1 - p.depth;
        if (r0 <= 0.5) break;
        const m = Math.max(12, Math.round(n * (r1 / R))), st = Math.max(1, p.storeys - 2 * k);
        if (p.footprint === "rect") {
          // a square ring: four wings
          const o = R - r1;
          add(rect(o, o, 2 * r1, p.depth), st); add(rect(o, o + 2 * r1 - p.depth, 2 * r1, p.depth), st);
          add(rect(o, o + p.depth, p.depth, 2 * r1 - 2 * p.depth), st); add(rect(o + 2 * r1 - p.depth, o + p.depth, p.depth, 2 * r1 - 2 * p.depth), st);
        } else for (let i = 0; i < m; i++) add(sector(cx, cy, r0, r1, (i / m) * 2 * Math.PI, ((i + 1) / m) * 2 * Math.PI), st);
      }
      W = D = 2 * R + (p.street ?? 6);
      break;
    }
    case "court": {
      // Wings of one depth round a court (rows = how many sides are built, 1-4).
      const c = p.court ?? 10, d = p.depth, sides = p.rows ?? 4, L = c + 2 * d;
      if (sides >= 1) add(rect(0, 0, L, d), p.storeys);
      if (sides >= 2) add(rect(0, d, d, c), p.storeys);
      if (sides >= 3) add(rect(L - d, d, d, c), p.storeys);
      if (sides >= 4) add(rect(0, d + c, L, d), p.storeys);
      W = L + (p.street ?? 0); D = L + (p.street ?? 0);
      break;
    }
    case "cluster": {
      // Free-standing units round a shared yard, `rows` clusters side by side.
      const n = p.count ?? 6, c = p.court ?? 8, k = p.rows ?? 1;
      const size = p.footprint === "round" ? (p.diameter ?? p.width) : Math.max(p.width, p.depth);
      const R = c / 2 + size / 2 + (p.gap ?? 1), span = 2 * R + size + (p.street ?? 4);
      for (let j = 0; j < k; j++) {
        const cx = j * span + span / 2, cy = span / 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 2 * Math.PI + Math.PI / n, ux = cx + R * Math.cos(a), uy = cy + R * Math.sin(a);
          if (p.footprint === "round") add(disc(ux, uy, size / 2), p.storeys);
          else add(rect(ux - p.width / 2, uy - p.depth / 2, p.width, p.depth), p.storeys);
        }
      }
      W = k * span; D = span;
      break;
    }
    case "slab": {
      // A double-loaded bar: rooms either side of a corridor, `count` bays long; `rows` bars.
      const n = p.count ?? 10, rows = p.rows ?? 1, gap = p.street ?? 12, L = n * p.width;
      for (let r = 0; r < rows; r++) add(rect(0, r * (p.depth + gap), L, p.depth), p.storeys);
      W = L; D = rows * p.depth + (rows - 1) * gap + (p.street ?? 12);
      break;
    }
    case "tower": {
      const t = p.tower ?? { width: 20, depth: 20, storeys: 20 };
      add(rect(0, 0, p.width, p.depth), p.storeys);
      add(rect((p.width - t.width) / 2, (p.depth - t.depth) / 2, t.width, t.depth), t.storeys, "built", z0 + p.storeys * fh);
      W = p.width + (p.street ?? 10); D = p.depth + (p.street ?? 10);
      break;
    }
    case "sunken": {
      // A pit stepping down to water: terraces narrowing as they go down; rooms round the top
      // when `count` is set (Matmata, a dikengyuan).
      const L = p.width, B = p.depth, dz = p.sunken ?? 8, n = p.steps ?? 4, step = Math.min(L, B) / (2 * n + 2);
      for (let k = 0; k < n; k++) {
        const o = k * step, z = -(k + 1) * (dz / n);
        S.push({ ring: rect(o, o, L - 2 * o, B - 2 * o), z, h: dz / n * 0.2, use: "ground" });
      }
      const o = n * step;
      if (p.water) S.push({ ring: rect(o, o, L - 2 * o, B - 2 * o), z: -dz, h: Math.min(p.water, dz) * 0.4, use: "water" });
      if (p.storeys > 0 && (p.count ?? 0) > 0) {
        // a colonnade or ring of rooms at street level
        const d = 3;
        add(rect(-d, -d, L + 2 * d, d), p.storeys, "built", 0); add(rect(-d, B, L + 2 * d, d), p.storeys, "built", 0);
      }
      W = L + 6; D = B + 6;
      break;
    }
    case "terraces": {
      // Paddies or fields stepping down a slope, `steps` of them, each `depth` deep.
      const n = p.steps ?? 6, rise = p.sunken ?? 1.5, L = p.width;
      for (let k = 0; k < n; k++) {
        S.push({ ring: rect(0, k * p.depth, L, p.depth), z: (n - k - 1) * rise, h: 0.4, use: "green" });
        if (p.water) S.push({ ring: rect(0.6, k * p.depth + 0.6, L - 1.2, p.depth - 1.2), z: (n - k - 1) * rise + 0.4, h: 0.05, use: "water" });
      }
      W = L; D = n * p.depth;
      break;
    }
    case "ponds": {
      // A grid of ponds or beds between bunds or canals (chinampas, bheris).
      const nx = p.count ?? 4, ny = p.rows ?? 3, g = p.street ?? 4;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x = i * (p.width + g), y = j * (p.depth + g);
        if (p.water) S.push({ ring: rect(x, y, p.width, p.depth), z: -0.3, h: 0.3, use: "water" });
        else { S.push({ ring: rect(x, y, p.width, p.depth), z: 0, h: 0.5, use: "green" }); }
      }
      if (!p.water) for (let i = 0; i <= nx; i++) S.push({ ring: rect(i * (p.width + g) - g, -g, g * 0.8, ny * (p.depth + g) + g), z: -0.4, h: 0.4, use: "water" });
      W = nx * (p.width + g); D = ny * (p.depth + g);
      break;
    }
    case "shed": {
      // Long bays side by side (greenhouses, workshops, a market hall).
      const n = p.count ?? 4;
      for (let i = 0; i < n; i++) add(rect(i * p.width, 0, p.width, p.depth), p.storeys, "built", z0, p.roof ?? "gable");
      W = n * p.width; D = p.depth + (p.street ?? 8);
      break;
    }
    case "canopy": {
      // A roof on posts over open ground (a bazaar shade, solar canopy, a station).
      const n = p.count ?? 1;
      for (let i = 0; i < n; i++) S.push({ ring: rect(i * (p.width + (p.gap ?? 0)), 0, p.width, p.depth), z: (p.floorH ?? 4) - 0.4, h: 0.4, use: "canopy", roof: "flat" });
      W = n * p.width + (n - 1) * (p.gap ?? 0); D = p.depth + (p.street ?? 4);
      break;
    }
  }

  features(p, S, fh, z0, W, D);

  // Stilts under a raised floor: a post at each corner, from the ground up.
  if (z0 > 0) for (const s of S.filter((x) => x.use === "built" && x.z === z0 && x.ring.length === 4))
    for (const [x, y] of s.ring) S.push({ ring: rect(x - 0.15, y - 0.15, 0.3, 0.3), z: 0, h: z0, use: "built", roof: "flat", storeys: 0 });

  // Trees on open ground: placed by a seeded random, never inside a building.
  if (p.trees) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const boxes = S.filter((s) => s.use === "built").map((s) => {
      const xs = s.ring.map((q) => q[0]), ys = s.ring.map((q) => q[1]);
      return [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2];
    });
    for (let k = 0, tries = 0; k < p.trees && tries < p.trees * 40; tries++) {
      const x = rnd() * W, y = rnd() * D;
      if (boxes.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
      S.push({ ring: [[x, y]], z: 0, h: 4 + rnd() * 6, use: "tree" });
      k++;
    }
  }

  const built = S.filter((s) => s.use === "built");
  const footprint = built.filter((s) => s.z <= z0 + 0.01).reduce((a, s) => a + ringArea(s.ring), 0);
  const floorArea = built.reduce((a, s) => a + ringArea(s.ring) * (s.storeys ?? 1), 0);
  const plotA = Math.max(1, W * D);
  return { solids: S, plot: { w: W, d: D }, footprint, floorArea, fsi: floorArea / plotA, gsi: footprint / plotA };
}

/** The features: parts placed on or over the massing. They add no floor area (storeys 0). */
function features(p: Params, S: Solid[], fh: number, z0: number, W: number, D: number) {
  const part = (ring: [number, number][], z: number, h: number, roof: Roof = "flat") => S.push({ ring, z, h, use: "built", roof, storeys: 0 });
  const blocks = S.filter((s) => s.use === "built" && (s.storeys ?? 0) > 0);
  const top = (s: Solid) => s.z + s.h;
  const centre = (r: [number, number][]): [number, number] => [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length];
  // n parts spread over the blocks, the largest first
  const pick = (n: number) => {
    const big = [...blocks].sort((a, b) => ringArea(b.ring) - ringArea(a.ring));
    return n >= big.length ? big : Array.from({ length: n }, (_, k) => big[Math.floor((k * big.length) / n)]);
  };
  for (const f of p.features ?? []) {
    switch (f.kind) {
      case "windcatcher":
      case "stack": {
        const a = f.size ?? (f.kind === "windcatcher" ? 2.5 : 3);
        if (!blocks.length) {
          // over a pit: towers on the ground at its edge
          const pit = S.filter((s) => s.use === "ground" && s.z < 0).sort((x, y) => y.z - x.z)[0];
          const xs = pit ? pit.ring.map((q) => q[0]) : [0], ys = pit ? pit.ring.map((q) => q[1]) : [0];
          const n = f.count ?? 1;
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n, x = Math.min(...xs) + t * (Math.max(...xs) - Math.min(...xs));
            part(rect(x - a / 2, Math.min(...ys) - a - 1, a, a), 0, f.height);
          }
          break;
        }
        // more parts than blocks: several along each block's longer side
        const n = f.count ?? (f.kind === "windcatcher" ? 1 : 2), chosen = pick(n), per = Math.ceil(n / Math.max(1, chosen.length));
        for (const b of chosen) {
          const xs = b.ring.map((q) => q[0]), ys = b.ring.map((q) => q[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), along = x1 - x0 >= y1 - y0;
          const [cx, cy] = centre(b.ring);
          for (let k = 0; k < per; k++) {
            const t = (k + 0.5) / per;
            const px = along ? x0 + t * (x1 - x0) : cx, py = along ? cy : y0 + t * (y1 - y0);
            part(rect(px - a / 2, py - a / 2, a, a), top(b), f.height);
          }
        }
        break;
      }
      case "dome": {
        // over the pit when there is one, else over the middle of the plan
        const pit = S.filter((s) => s.use === "ground" && s.z < 0).sort((a, b) => b.z - a.z)[0];
        const ring = pit ? pit.ring : ([[0, 0], [W, 0], [W, D], [0, D]] as [number, number][]);
        const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const r = f.size ?? Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.5, n = 16;
        part(Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as [number, number]), pit ? 0 : z0 + p.storeys * fh, 1, "dome");
        break;
      }
      case "vault": {
        if (p.arrangement !== "row") break;
        const rows = p.rows ?? 1, st = p.street ?? 4;
        for (let r = 0; r + 1 < rows; r++) {
          const y = st / 2 + r * (p.depth + st) + p.depth;
          part(rect(0, y, W, st), z0 + p.storeys * fh - 0.3, 0.3, "vault");
        }
        break;
      }
      case "slope":
        for (const b of blocks) { b.roof = "mono"; b.rise = f.rise; }
        break;
      case "arcade":
        break; // built with the row
    }
  }
}
