// Downloads for a massing: glTF (binary, y up as glTF asks), OBJ and Rhino .3dm (z up,
// metres, as the site frame). rhino3dm's WebAssembly (about 2.7 MB) loads only when someone
// asks for a .3dm, so the page's first load doesn't carry it.
import type { Mesh } from "../../engine/massing";

export interface Part { name: string; layer: string; mesh: Mesh }

/** Colours of the layers in glTF and Rhino: the massing, the design's other buildings, existing ones. */
const LAYER_HEX: Record<string, number> = { massing: 0xeb6834, context: 0xbbbbbb, existing: 0x8a8a8a };

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One mesh per named group (a plot, the skin, the context). */
function pieces(parts: Part[]): { name: string; layer: string; p: Float32Array; i: Uint32Array }[] {
  const out: { name: string; layer: string; p: Float32Array; i: Uint32Array }[] = [];
  for (const part of parts) {
    const groups = part.mesh.groups.length ? part.mesh.groups : [{ name: part.name, start: 0, count: part.mesh.indices.length }];
    for (const g of groups) {
      // Re-index this group's vertices from 0.
      const map = new Map<number, number>(), p: number[] = [], i: number[] = [];
      for (let k = g.start; k < g.start + g.count; k++) {
        const v = part.mesh.indices[k];
        let w = map.get(v);
        if (w === undefined) { w = p.length / 3; map.set(v, w); p.push(part.mesh.positions[3 * v], part.mesh.positions[3 * v + 1], part.mesh.positions[3 * v + 2]); }
        i.push(w);
      }
      out.push({ name: groups.length > 1 ? g.name : part.name, layer: part.layer, p: Float32Array.from(p), i: Uint32Array.from(i) });
    }
  }
  return out;
}

export function objText(parts: Part[]): string {
  const lines = ["# Permutation City massing: metres in the site frame, x east, y north, z up"];
  let base = 1;
  for (const pc of pieces(parts)) {
    lines.push(`o ${pc.layer} - ${pc.name}`);
    for (let k = 0; k < pc.p.length; k += 3) lines.push(`v ${pc.p[k].toFixed(3)} ${pc.p[k + 1].toFixed(3)} ${pc.p[k + 2].toFixed(3)}`);
    for (let k = 0; k < pc.i.length; k += 3) lines.push(`f ${pc.i[k] + base} ${pc.i[k + 1] + base} ${pc.i[k + 2] + base}`);
    base += pc.p.length / 3;
  }
  return lines.join("\n") + "\n";
}

export const downloadObj = (parts: Part[], file: string) => save(objText(parts), `${file}.obj`, "text/plain");

export async function downloadGlb(parts: Part[], file: string) {
  const THREE = await import("three");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;  // z up to glTF's y up
  for (const pc of pieces(parts)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pc.p, 3));
    g.setIndex(new THREE.BufferAttribute(pc.i, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: LAYER_HEX[pc.layer] ?? 0xf19a74 }));
    m.name = `${pc.layer} - ${pc.name}`;
    root.add(m);
  }
  const scene = new THREE.Scene();
  scene.add(root);
  const out = await new GLTFExporter().parseAsync(scene, { binary: true });
  save(out as ArrayBuffer, `${file}.glb`, "model/gltf-binary");
}

export async function downloadRhino(parts: Part[], file: string) {
  const [{ default: rhino3dm }, { default: wasm }] = await Promise.all([
    import("rhino3dm/rhino3dm.module.js"), import("rhino3dm/rhino3dm.wasm?url"),
  ]);
  const rhino = await rhino3dm({ locateFile: () => wasm });
  save(rhinoBytes(rhino, parts).slice(), `${file}.3dm`, "application/octet-stream");
}

/** A .3dm file's bytes, given a loaded rhino3dm module: a layer per kind of part, a named
 *  mesh per plot (or skin), and one for the context. */
export function rhinoBytes(rhino: any, parts: Part[]): Uint8Array {
  const doc = new rhino.File3dm();
  doc.settings().modelUnitSystem = rhino.UnitSystem.Meters;
  const layers = new Map<string, number>();
  for (const pc of pieces(parts)) {
    if (!layers.has(pc.layer)) {
      const hex = LAYER_HEX[pc.layer] ?? 0xeb6834, c = { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
      layers.set(pc.layer, doc.layers().addLayer(pc.layer, c));
    }
    const mesh = new rhino.Mesh();
    for (let k = 0; k < pc.p.length; k += 3) mesh.vertices().add(pc.p[k], pc.p[k + 1], pc.p[k + 2]);
    for (let k = 0; k < pc.i.length; k += 3) mesh.faces().addTriFace(pc.i[k], pc.i[k + 1], pc.i[k + 2]);
    mesh.normals().computeNormals();
    const attr = new rhino.ObjectAttributes();
    attr.layerIndex = layers.get(pc.layer)!;
    attr.name = pc.name;
    doc.objects().addMesh(mesh, attr);
  }
  return doc.toByteArray();
}
