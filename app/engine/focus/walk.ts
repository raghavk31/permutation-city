// Walking on the real streets and paths of a place (docs/architecture-v3.md section 15). Lines are
// cut every STEP_M so that nearby things can find a node, and a line that ends by another joins it:
// simplifying the map's lines drops some of the shared points at side-street junctions.

const STEP_M = 10;
const JOIN_M = 8;       // a line's end this close to another line joins it

export class Walk {
  readonly x: number[] = [];
  readonly y: number[] = [];
  private adj: number[][] = [];
  private wt: number[][] = [];
  private index = new Map<string, number>();
  private cells = new Map<string, number[]>();
  private cell = 40;
  private mainPart: Uint8Array | null = null;

  constructor(lines: readonly (readonly number[])[]) {
    const ends: number[] = [];
    lines.forEach((pts) => {
      let prev = -1;
      for (let k = 0; k + 1 < pts.length; k += 2) {
        const ax = pts[k], ay = pts[k + 1];
        const a = this.node(ax, ay);
        if (prev >= 0 && prev !== a) {
          const bx = this.x[prev], by = this.y[prev], len = Math.hypot(ax - bx, ay - by), n = Math.ceil(len / STEP_M);
          let from = prev;
          for (let s = 1; s <= n; s++) {
            const to = s === n ? a : this.between(bx + (ax - bx) * s / n, by + (ay - by) * s / n);
            this.edge(from, to);
            from = to;
          }
        }
        if (k === 0 || k + 2 >= pts.length) ends.push(a);
        prev = a;
      }
    });
    for (const e of ends) {
      if (this.adj[e].length > 1) continue;
      const near = this.nearest(this.x[e], this.y[e], JOIN_M, (i) => i !== e && !this.adj[e].includes(i));
      if (near >= 0) this.edge(e, near);
    }
  }

  private node(x: number, y: number): number {
    const key = `${Math.round(x)},${Math.round(y)}`;
    const hit = this.index.get(key);
    if (hit !== undefined) return hit;
    const i = this.between(x, y);
    this.index.set(key, i);
    return i;
  }

  /** A node along a line, belonging to that line alone: two lines that merely cross (a bridge over
   *  a road) must not join where their cuts happen to fall together. */
  private between(x: number, y: number): number {
    const i = this.x.length;
    this.x.push(x); this.y.push(y); this.adj.push([]); this.wt.push([]);
    const c = `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
    (this.cells.get(c) ?? this.cells.set(c, []).get(c)!).push(i);
    return i;
  }

  private edge(a: number, b: number): void {
    if (a === b) return;
    const d = Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b]);
    this.adj[a].push(b); this.wt[a].push(d);
    this.adj[b].push(a); this.wt[b].push(d);
  }

  /** The nearest node within `within` metres, or -1. */
  nearest(x: number, y: number, within: number, ok: (i: number) => boolean = () => true): number {
    const r = Math.ceil(within / this.cell), cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    let best = -1, bestD = within * within;
    for (let u = cx - r; u <= cx + r; u++) for (let v = cy - r; v <= cy + r; v++) for (const i of this.cells.get(`${u},${v}`) ?? []) {
      const d = (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2;
      if (d <= bestD && ok(i)) { bestD = d; best = i; }
    }
    return best;
  }

  /** Walking metres from any of the sources to every node (Infinity where it can't be reached),
   *  stopping past `limit`. */
  from(sources: readonly number[], limit = Infinity): Float64Array {
    const dist = new Float64Array(this.x.length).fill(Infinity);
    const heap: [number, number][] = [];
    const push = (d: number, i: number) => {
      heap.push([d, i]);
      for (let c = heap.length - 1; c > 0;) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let p = 0; ;) {
          const l = 2 * p + 1, r = l + 1;
          let m = p;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === p) break;
          [heap[p], heap[m]] = [heap[m], heap[p]];
          p = m;
        }
      }
      return top;
    };
    for (const s of sources) { dist[s] = 0; push(0, s); }
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      for (let k = 0; k < this.adj[i].length; k++) {
        const j = this.adj[i][k], nd = d + this.wt[i][k];
        if (nd < dist[j] && nd <= limit) { dist[j] = nd; push(nd, j); }
      }
    }
    return dist;
  }

  /** Per node: 1 in the largest connected part of the network. */
  private main(): Uint8Array {
    if (this.mainPart) return this.mainPart;
    const label = new Int32Array(this.x.length).fill(-1);
    let best = -1, bestN = 0, n = 0;
    for (let s = 0; s < this.x.length; s++) {
      if (label[s] >= 0) continue;
      let size = 0;
      const stack = [s];
      label[s] = n;
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        for (const j of this.adj[i]) if (label[j] < 0) { label[j] = n; stack.push(j); }
      }
      if (size > bestN) { best = n; bestN = size; }
      n++;
    }
    this.mainPart = Uint8Array.from(label, (l) => (l === best ? 1 : 0));
    return this.mainPart;
  }

  /** The nearest node within `within` metres on the city's main network, not on a stray length of
   *  path that joins nothing (a monument's inner paths, say); -1 if there is none. */
  nearestMain(x: number, y: number, within: number): number {
    const m = this.main();
    return this.nearest(x, y, within, (i) => m[i] === 1);
  }

  /** Share of nodes in the largest connected part, a check on how well the map's lines join. */
  joinedShare(): number {
    return this.x.length ? this.main().reduce((a, b) => a + b, 0) / this.x.length : 0;
  }
}
