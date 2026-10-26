// What the rules let a site hold, against its brief: plot land, the streets plots front, and
// floor area under the plot rules, over a sample of random designs (built form brief, section 3).
//   npm run capacity -- [site ...] [--n 30]
import { readFileSync } from "node:fs";
import * as E from "../engine/index.js";
import { BUILDING } from "../engine/config.js";
import { floorAreaTarget } from "../engine/fitness.js";
import { frameOf } from "../engine/plan/grow.js";
import { area } from "../engine/plan/geom.js";

const argv = process.argv.slice(2), ni = argv.indexOf("--n"), N = ni >= 0 ? +argv[ni + 1] : 30;
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--n");
const pct = (v: number) => `${Math.round(v * 100)}%`, ha = (v: number) => `${(v / 1e4).toFixed(1)} ha`;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

for (const id of ids.length ? ids : ["bengaluru-cascade"]) {
  const site: E.SiteExport = JSON.parse(readFileSync(`public/sites/${id}.json`, "utf8"));
  const G = E.prepare(site), rng = E.makeRng(7);
  let land = 0, build = 0;
  for (let i = 0; i < G.n; i++) {
    if (!G.canWater[i] || G.canBuild[i] || G.canGreen[i]) land += G.cellArea;
    if (G.canBuild[i]) build += G.cellArea;
  }
  const rows: Record<string, number[]> = { plotLand: [], plotShare: [], floor: [], capacity: [], trimmed: [], parkShare: [], front6: [], front9: [], front12: [], front18: [], plotFar: [] };
  for (let k = 0; k < N; k++) {
    const d = E.grow(E.randomGenome(rng, 3), G), f = frameOf(d)!;
    let pl = 0;
    const byW: Record<number, number> = {};
    for (const p of f.ps) {
      if (p.use !== BUILDING) continue;
      const a = Math.abs(area(p.ring));
      pl += a;
      // The widest street the plot touches: nearest street to its ring, by class.
      let w = 0;
      for (const e of f.edges) {
        if (e.cls <= 0) continue;
        const ww = f.widthOf(e.cls);
        if (ww <= w) continue;
        if (touches(p.ring, e.pts, ww / 2 + 2)) w = ww;
      }
      byW[w] = (byW[w] ?? 0) + a;
    }
    let floor = 0;
    for (let i = 0; i < G.n; i++) if (d.use[i] === BUILDING) floor += d.floorArea[i];
    const ru = d.plan!.rules;
    if (ru) { rows.capacity.push(ru.capacity); rows.trimmed.push(ru.trimmed); rows.parkShare.push(ru.parkShare); }
    rows.plotLand.push(pl); rows.plotShare.push(pl / land); rows.floor.push(floor); rows.plotFar.push(floor / pl);
    const tot = Object.values(byW).reduce((a, b) => a + b, 0) || 1;
    rows.front6.push(((byW[6] ?? 0) + (byW[7.5] ?? 0) + (byW[0] ?? 0)) / tot);
    rows.front9.push((byW[9] ?? 0) / tot); rows.front12.push((byW[12] ?? 0) / tot); rows.front18.push((byW[18] ?? 0) / tot);
  }
  const target = floorAreaTarget(G);
  console.log(`${id}: ${G.n} cells, land (not water) ${ha(land)}, buildable ${ha(build)} (${pct(build / land)}); brief ${ha(target)} floor = FAR ${(target / land).toFixed(2)} on the land`);
  for (const [k, v] of Object.entries(rows)) {
    if (!v.length) continue;
    const fmt = k.startsWith("front") || k.endsWith("Share") ? pct : k === "plotFar" ? (x: number) => x.toFixed(2) : ha;
    console.log(`  ${k.padEnd(10)} p10 ${fmt(q(v, 0.1))}  median ${fmt(q(v, 0.5))}  p90 ${fmt(q(v, 0.9))}`);
  }
}

function touches(ring: number[][], line: number[][], tol: number): boolean {
  for (const p of ring) for (let j = 0; j + 1 < line.length; j++) if (segDist(p, line[j], line[j + 1]) <= tol) return true;
  return false;
}
function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
