// A design in 3D (three.js; loaded only when a design is first shown in 3D). Shared by the
// families' detail view and the hero image, and the start of the workbench's 3D view (A3).
//
//   ground      the design ground and context as flat shapes; existing water with a little
//               reflection; proposed green with a faint texture
//   buildings   the design's building cells dissolved by storeys (no cell outlines), split
//               along its streets and set back from them, extruded
//   streets     ribbons at their widths; existing roads quieter
//   context     existing buildings round the design ground, light grey, at their heights
//   light       the site's sun on a date and local time, soft shadows fitted to the site,
//               a sky fill, and ground-truth ambient occlusion (three.js GTAOPass)
//
// The frame is z up (x east, y north), as in the massing viewer.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { dayOfYear, solarHour, sunAt } from "../../engine/massing";
import { sectionFor, sides, type Design, type Ground, type SiteExport } from "../../engine";
import { inset, regions, shapeOf, type StreetLines } from "../draw";
import { buildingAt, tokens as T } from "../tokens";

const STOREY = 3.2;
const area2 = (r: [number, number][]) => r.reduce((s, [x, y], k) => s + x * r[(k + 1) % r.length][1] - r[(k + 1) % r.length][0] * y, 0);

export interface DesignScene {
  site: SiteExport; G: Ground; d: Design; roads: StreetLines | null;
  /** Vertical exaggeration (1: true heights). */
  exaggerate?: number;
}
export interface SunSetting { month: number; day: number; clock: number }

/** Flat shapes from smoothed outlines (outer outlines anticlockwise, holes clockwise). */
function shapesOf(loops: [number, number][][]): THREE.Shape[] {
  const area = (r: [number, number][]) => r.reduce((s, [x, y], k) => s + x * r[(k + 1) % r.length][1] - r[(k + 1) % r.length][0] * y, 0) / 2;
  const outers = loops.filter((l) => area(l) > 0), holes = loops.filter((l) => area(l) < 0);
  const contains = (poly: [number, number][], [x, y]: [number, number]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return outers.map((o) => {
    const s = new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) if (contains(o, h[0])) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  });
}

/** A polyline as a flat ribbon `w` metres wide at height z. */
function ribbon(points: [number, number][], w: number, z: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const pos: number[] = [], idx: number[] = [], h = w / 2;
  points.forEach(([x, y], k) => {
    const [px, py] = points[Math.max(0, k - 1)], [qx, qy] = points[Math.min(points.length - 1, k + 1)];
    let tx = qx - px, ty = qy - py;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    pos.push(x - ty * h, y + tx * h, z, x + ty * h, y - tx * h, z);
    if (k) { const a = 2 * (k - 1); idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A band of a polyline between offsets a and b (m, left of the line positive) at height z. */
function band(points: [number, number][], a: number, b: number, z: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const pos: number[] = [], idx: number[] = [];
  points.forEach(([x, y], k) => {
    const [px, py] = points[Math.max(0, k - 1)], [qx, qy] = points[Math.min(points.length - 1, k + 1)];
    let tx = qx - px, ty = qy - py;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    pos.push(x - ty * a, y + tx * a, z, x - ty * b, y + tx * b, z);
    if (k) { const i = 2 * (k - 1); idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const TREE_EVERY_M = 15;   // trees along a planted strip at least 1.5 m wide (SP:118 templates draw them about this far apart)

/** A street as its cross-section (engine/config.ts sectionFor): footpaths, planted strips,
 *  carriageway or shared lane as bands, and trees along the planted strips. */
function streetBands(points: [number, number][], w: number) {
  const out: { kind: string; g: THREE.BufferGeometry | null }[] = [], trees: [number, number][] = [];
  let at = w / 2;
  for (const part of sectionFor(w).parts) {
    const a = at, b = at - part.w;
    out.push({ kind: part.kind, g: band(points, a, b, part.kind === "footpath" ? 0.35 : 0.2) });
    if (part.kind === "planted" && part.w >= 1.5) {
      const mid = (a + b) / 2;
      let run = TREE_EVERY_M / 2;
      for (let k = 1; k < points.length; k++) {
        const [x0, y0] = points[k - 1], [x1, y1] = points[k], L = Math.hypot(x1 - x0, y1 - y0);
        if (!L) continue;
        const tx = (x1 - x0) / L, ty = (y1 - y0) / L;
        for (; run < L; run += TREE_EVERY_M) trees.push([x0 + tx * run - ty * mid, y0 + ty * run + tx * mid]);
        run -= L;
      }
    }
    at = b;
  }
  return { bands: out, trees };
}

function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const ok = geoms.filter((g) => g.attributes.position.count);
  if (!ok.length) return null;
  // Non-indexed, position and normal only: enough for flat-shaded architecture.
  const flat = ok.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}

/** A faint grain for green, so it reads as ground cover, not paint. */
function grainTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
  const rng = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const r = rng(7);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
    g.beginPath(); g.arc(r() * 128, r() * 128, 0.6 + r() * 1.6, 0, 2 * Math.PI); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 40, 1 / 40); // one tile every 40 m
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DesignView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 5, 20000);
  readonly controls: OrbitControls;
  private composer: EffectComposer;
  private ao: GTAOPass;
  private sun = new THREE.DirectionalLight(0xffffff, 3.4);
  private sky = new THREE.HemisphereLight(0xf4f6f8, 0xd9d4c8, 0.45);
  private content = new THREE.Group();
  private centre = new THREE.Vector3();
  private span = 500;
  private high = true;
  private frame = 0;
  private resize: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // filtered, with a blur radius (three.js dropped PCFSoftShadowMap)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(T.paper);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.15;
    this.camera.up.set(0, 0, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.4;
    this.sun.shadow.radius = 4;
    this.sky.position.set(0, 0, 1);
    this.scene.add(this.sun, this.sun.target, this.sky, this.content);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.addEventListener("change", () => this.render());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 3, scale: 1, samples: 16 });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
  }

  /** Default quality: shadows at 4096 and occlusion on. Low: 2048 and no occlusion. */
  setQuality(high: boolean) {
    this.high = high;
    this.sun.shadow.mapSize.set(high ? 4096 : 2048, high ? 4096 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.ao.enabled = high;
    this.render();
  }

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.controls.update()) this.render(); // damping keeps the camera moving for a moment
      if (this.high) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    });
  }

  /** The site's sun at a local date and clock time (the site's UTC offset). */
  setSun({ month, day, clock }: SunSetting, site: SiteExport) {
    const [lon, lat] = site.meta.origin, doy = dayOfYear(month, day);
    const s = sunAt(lat, doy, solarHour(clock, lon, site.meta.utc_offset_h ?? 5.5, doy));
    const d = this.span * 1.5;
    this.sun.position.set(this.centre.x + s.dir[0] * d, this.centre.y + s.dir[1] * d, Math.max(s.dir[2], 0.08) * d);
    this.sun.target.position.copy(this.centre);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -this.span * 0.75; cam.right = cam.top = this.span * 0.75;
    cam.near = 1; cam.far = d * 2.5;
    cam.updateProjectionMatrix();
    this.render();
  }

  /** Aerial view from the south-west, framed to the design ground. */
  frameSite() {
    const c = this.centre, r = this.span;
    this.camera.position.set(c.x - r * 0.55, c.y - r * 1.05, r * 0.85);
    this.controls.target.copy(c);
    this.controls.update();
    this.render();
  }

  show(o: DesignScene) {
    const { site, G, d, roads } = o, ex = o.exaggerate ?? 1.5;
    for (const ch of [...this.content.children]) {
      this.content.remove(ch);
      (ch as THREE.Mesh).geometry?.dispose();
    }
    const D = site.design, g = site.grid, { corners: shape } = shapeOf(site);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < D.x.length; i++) {
      x0 = Math.min(x0, D.x[i]); x1 = Math.max(x1, D.x[i]); y0 = Math.min(y0, D.y[i]); y1 = Math.max(y1, D.y[i]);
    }
    this.centre.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    this.span = Math.max(x1 - x0, y1 - y0) + 120;
    const add = (geom: THREE.BufferGeometry | null, mat: THREE.Material, cast = false, receive = true) => {
      if (!geom) return;
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      this.content.add(m);
    };
    const flat = (colour: string, rough = 1) => new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: 0 });

    // Ground: a plane a little darker than the paper, so streets read on it.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.span * 2.2, this.span * 2.2), flat(T.existing.fill));
    ground.position.copy(this.centre); ground.receiveShadow = true;
    this.content.add(ground);

    // Existing water, then the design's own water, green and the open ground.
    const sheet = (loops: [number, number][][], z: number) => merge(shapesOf(loops).map((s) => {
      const geom = new THREE.ShapeGeometry(s); geom.translate(0, 0, z); return geom;
    }));
    const water = regions(g.x, g.y, g.water.map((w) => (w ? "w" : null)), shape).get("w") ?? [];
    add(sheet(water, 0.3), new THREE.MeshStandardMaterial({ color: T.water.deep, roughness: 0.18, metalness: 0, envMapIntensity: 1.2 }));
    if (d.plan) { this.showPlan(o, add, flat, sheet, ex); this.finish(site, ex, add, flat); return; }
    const uses = regions(D.x, D.y, Array.from(d.use, (u) => (u === 3 ? "water" : u === 2 ? "green" : u === 1 ? "plot" : null)), shape);
    add(sheet(uses.get("water") ?? [], 0.12), new THREE.MeshStandardMaterial({ color: T.water.storage, roughness: 0.15, metalness: 0, envMapIntensity: 1.2 }));
    const grass = new THREE.MeshStandardMaterial({ color: T.green.proposed, roughness: 1, map: grainTexture() });
    add(sheet(uses.get("green") ?? [], 0.1), grass);
    add(sheet(uses.get("plot") ?? [], 0.08), flat(T.paper2));

    // Streets: the design's, at their widths, then the existing roads, narrower and quieter.
    if (roads) {
      add(merge(roads.lines.map((l) => ribbon(l.points, Math.max(roads.widths[l.cls], 4), 0.2)).filter((x): x is THREE.BufferGeometry => !!x)),
        flat(T.street.onDesign));
    }
    add(merge(site.context.roads.map((r) => ribbon(r, 7, 0.15)).filter((x): x is THREE.BufferGeometry => !!x)), flat(T.paper2));

    // Buildings: one region per storey count, cut along streets, set back from them.
    const sd = d.street ? sides(G) : null, deg = shape.length;
    const cut = sd && d.street ? (i: number, k: number) => {
      const s = sd.at[i * deg + ((k + 1) % deg)];
      return s >= 0 && d.street![s] > 0;
    } : null;
    const levels = Array.from(d.use, (u, i) => (u === 1 && d.levels[i] > 0 ? String(d.levels[i]) : null));
    const byLevel = regions(D.x, D.y, levels, shape, 2, cut);
    const setback = 3;
    for (const [lv, loops] of byLevel) {
      const h = +lv * STOREY * ex;
      const kept = loops.map((l) => inset(l, setback)).filter((l): l is [number, number][] => !!l);
      const geom = merge(shapesOf(kept).map((s) => new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false })));
      add(geom, new THREE.MeshStandardMaterial({ color: buildingAt(+lv), roughness: 0.85, metalness: 0 }), true, true);
    }

    this.finish(site, ex, add, flat);
  }

  /** A version 3 design: its plots (buildings set back from the plot edge, by storeys; green
   *  and water flat) and its streets at their widths. */
  private showPlan(o: DesignScene, add: (g: THREE.BufferGeometry | null, m: THREE.Material, cast?: boolean, receive?: boolean) => void,
    flat: (c: string, r?: number) => THREE.Material, sheet: (loops: [number, number][][], z: number) => THREE.BufferGeometry | null, ex: number) {
    const plan = o.d.plan!;
    add(sheet(plan.blocks.map((r) => (area2(r) < 0 ? [...r].reverse() : r)), 0.08), flat(T.paper2));
    const byUse = (u: number) => plan.plots.filter((p) => p.use === u).map((p) => (area2(p.ring) < 0 ? [...p.ring].reverse() : p.ring));
    add(sheet(byUse(3), 0.12), new THREE.MeshStandardMaterial({ color: T.water.storage, roughness: 0.15, metalness: 0, envMapIntensity: 1.2 }));
    add(sheet(byUse(2), 0.1), new THREE.MeshStandardMaterial({ color: T.green.proposed, roughness: 1, map: grainTexture() }));
    // streets as their cross-sections (IRC:SP:118 templates), trees in the planted strips
    const parts = new Map<string, THREE.BufferGeometry[]>(), trees: [number, number][] = [];
    for (const st of plan.streets) {
      const { bands, trees: t } = streetBands(st.pts, st.w);
      for (const b of bands) if (b.g) { const l = parts.get(b.kind); if (l) l.push(b.g); else parts.set(b.kind, [b.g]); }
      trees.push(...t);
    }
    const SECTION_LOOK: Record<string, string> = { footpath: T.street.onDesign, planted: T.green.proposed, carriageway: T.street.primary, shared: T.street.onGround };
    for (const [kind, gs] of parts) add(merge(gs), flat(SECTION_LOOK[kind] ?? T.street.onDesign));
    if (trees.length) {
      const crown = new THREE.IcosahedronGeometry(2.6, 0);
      add(merge(trees.map(([x, y]) => crown.clone().translate(x, y, 4.2 * ex))), flat(T.green.existing), true, false);
    }
    const groups = new Map<number, THREE.BufferGeometry[]>();
    for (const p of plan.plots) {
      if (p.use !== 1 || p.levels <= 0) continue;
      const r = area2(p.ring) < 0 ? [...p.ring].reverse() : p.ring;
      const fp = inset(r, 1.5) ?? r;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(fp.map(([x, y]) => new THREE.Vector2(x, y))), { depth: p.levels * STOREY * ex, bevelEnabled: false });
      const l = groups.get(p.levels); if (l) l.push(g); else groups.set(p.levels, [g]);
    }
    for (const [lv, gs] of groups) add(merge(gs), new THREE.MeshStandardMaterial({ color: buildingAt(lv), roughness: 0.85, metalness: 0 }), true, true);
  }

  private finish(site: SiteExport, ex: number, add: (g: THREE.BufferGeometry | null, m: THREE.Material, cast?: boolean, receive?: boolean) => void,
    flat: (c: string, r?: number) => THREE.Material) {
    // The existing city round the design ground, light grey, at its own heights.
    const eb = site.context.buildings;
    if (eb?.rings?.length) {
      const geoms = eb.rings.map((r, k) => {
        const pts: THREE.Vector2[] = [];
        for (let j = 0; j < r.length; j += 2) pts.push(new THREE.Vector2(r[j], r[j + 1]));
        if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
        return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(eb.h[k], 3) * ex, bevelEnabled: false });
      });
      add(merge(geoms), flat(T.existingRamp[1], 0.95), true, true);
    }
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.fit();
  }

  /** The canvas as a PNG (presentation stills, the hero image). */
  still(): string { this.composer.render(); return this.canvas.toDataURL("image/png"); }

  dispose() {
    this.resize.disconnect();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
