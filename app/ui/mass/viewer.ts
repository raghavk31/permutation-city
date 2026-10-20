// The 3D viewer for building-scale massing (three.js; loaded only when the massing chapter
// shows a design). Orbit, a sun study (date and solar time, with shadows), a section cut
// (a plan cut at a height, or a cut across the block), and two viewers side by side with
// their cameras linked.
//
// The site frame is z up (x east, y north); the camera's up is set to z so nothing is
// rotated, and the sun vector from the engine lights the scene as is. Clicking an existing
// building reports it (onPick), so its height can be set.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Envelope, Mesh } from "../../engine/massing";

export interface Look { mass: string; context: string; existing: string; ground: string; ink: string; background: string }
export interface SceneData { E: Envelope; mass: Mesh; context: Mesh; existing: Mesh; ground: HTMLCanvasElement; look: Look }
export type Section = { mode: "none" } | { mode: "plan"; height: number } | { mode: "cut"; at: number };

function geometry(m: Mesh, smooth: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  if (smooth) g.computeVertexNormals(); else { const f = g.toNonIndexed(); f.computeVertexNormals(); return f; }
  return g;
}

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  readonly controls: OrbitControls;
  private sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  private sky = new THREE.HemisphereLight(0xffffff, 0x888888, 0.9);
  private content = new THREE.Group();
  private planes: THREE.Plane[] = [];
  private data: SceneData | null = null;
  private partner: Viewer | null = null;
  private syncing = false;
  private frame = 0;
  private existing: THREE.Mesh | null = null;
  /** Called with an existing building's index (into Ground.buildings) when it is clicked. */
  onPick: ((k: number) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;  // stay above the ground
    this.controls.addEventListener("change", () => { this.render(); this.sync(); });
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sky, this.sunLight, this.sunLight.target, this.content);
    new ResizeObserver(() => this.resize()).observe(canvas);
    // A click (not a drag) on an existing building picks it.
    let down: [number, number] | null = null;
    canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4 && e.button === 0) this.pick(e);
      down = null;
    });
  }

  private pick(e: PointerEvent) {
    const m = this.existing, groups = this.data?.existing.groups;
    if (!m || !groups?.length || !this.onPick) return;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.content.children, false)[0];
    if (!hit || hit.object !== m || hit.faceIndex == null) return;
    // The geometry is non-indexed, so face t is the mesh's triangle t.
    const at = hit.faceIndex * 3, g = groups.find((g) => at >= g.start && at < g.start + g.count);
    if (g) this.onPick(+g.name.split(" ")[1]);
  }

  show(d: SceneData, keepCamera = false) {
    this.data = d;
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      c.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    }
    const { E, look } = d;
    this.scene.background = new THREE.Color(look.background);
    const w = E.nx * E.res, h = E.ny * E.res, cx = E.ox + w / 2, cy = E.oy + h / 2;
    // Ground: the envelope's raster as a texture.
    const tex = new THREE.CanvasTexture(d.ground);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.position.set(cx, cy, 0);
    ground.receiveShadow = true;
    const mat = (colour: string) => new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.85, side: THREE.DoubleSide, clippingPlanes: this.planes, clipShadows: true,
    });
    const smooth = !d.mass.groups.some((g) => g.name.startsWith("plot"));
    const mass = new THREE.Mesh(geometry(d.mass, smooth), mat(look.mass));
    const context = new THREE.Mesh(geometry(d.context, false), mat(look.context));
    const existing = new THREE.Mesh(geometry(d.existing, false), mat(look.existing));
    for (const m of [mass, context, existing]) { m.castShadow = true; m.receiveShadow = true; }
    this.existing = existing;
    // Edges of the massing, so plan and section read.
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry(d.mass, false), 30),
      new THREE.LineBasicMaterial({ color: look.ink, transparent: true, opacity: 0.35, clippingPlanes: this.planes }));
    this.content.add(ground, context, existing, mass, edges);
    // Shadows over the whole frame.
    const s = this.sunLight.shadow.camera;
    const half = Math.hypot(w, h) / 2;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half; s.near = 1; s.far = 4 * half + 400;
    s.updateProjectionMatrix();
    this.sunLight.target.position.set(cx, cy, 0);
    if (!keepCamera) {
      this.controls.target.set(cx, cy, 0);
      const r = Math.max(w, h) * 0.75;
      this.camera.position.set(cx - r * 0.6, cy - r * 0.9, r * 0.7);
      this.camera.far = r * 10;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
    this.render();
  }

  /** Light from the sun's direction (engine sun vector), or a flat sky light when it is down. */
  sun(dir: readonly [number, number, number] | null) {
    const d = this.data;
    if (!d) return;
    const w = d.E.nx * d.E.res, h = d.E.ny * d.E.res, cx = d.E.ox + w / 2, cy = d.E.oy + h / 2, R = Math.hypot(w, h) + 200;
    if (dir && dir[2] > 0) {
      this.sunLight.visible = true;
      this.sunLight.position.set(cx + dir[0] * R, cy + dir[1] * R, dir[2] * R);
      this.sky.intensity = 0.9;
    } else {
      this.sunLight.visible = false;
      this.sky.intensity = 1.6;
    }
    this.render();
  }

  section(s: Section) {
    const d = this.data;
    this.planes.length = 0;
    if (d && s.mode === "plan") this.planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), s.height));
    if (d && s.mode === "cut") {
      // Across the block, along its first plot's axis: keep the far side.
      const p = d.E.plots[0], ax = p ? p.axis : 0;
      const n = new THREE.Vector3(Math.cos(ax), Math.sin(ax), 0);
      const xs = d.E.plots.map((q) => q.cx * n.x + q.cy * n.y);
      const span = (d.E.plots.length ? Math.max(...xs) - Math.min(...xs) : 0) + 2 * (p ? p.half[0] : 50);
      const at = (d.E.plots.length ? Math.min(...xs) : 0) - (p ? p.half[0] : 50) + s.at * span;
      this.planes.push(new THREE.Plane(n, -at));
    }
    this.render();
  }

  /** Two viewers: moving one moves the other. */
  link(other: Viewer | null) { this.partner = other; if (other) other.partner = this; this.sync(); }

  private sync() {
    const o = this.partner;
    if (!o || this.syncing) return;
    o.syncing = true;
    o.camera.position.copy(this.camera.position);
    o.controls.target.copy(this.controls.target);
    o.controls.update();
    o.syncing = false;
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }

  dispose() {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
