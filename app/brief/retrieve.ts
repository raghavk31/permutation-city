// Retrieval: BM25 over the snippets (the corpus plus anything uploaded), run once per
// question the brief needs answered, so every field gets its best evidence. No embeddings:
// the corpus is small, the words are technical (FSI, setback, storey), and BM25 is easy to
// check by hand.
import type { Snippet } from "./chunk.js";

const STOP = new Set(("a an and are as at be by for from has have in is it its of on or that the this to was were "
  + "will with which shall may not no be been if than then there these those such per any all each other").split(" "));

// Words that mean the same thing in these documents.
const SYNONYMS: Record<string, string[]> = {
  fsi: ["far", "floor", "space", "index"], far: ["fsi"],
  storey: ["floor", "level", "height"], height: ["storey", "level"], level: ["storey"],
  setback: ["margin", "open", "space"], margin: ["setback"],
  green: ["open", "space", "recreational", "garden", "park"], park: ["green", "open"],
  flood: ["flooding", "sea", "surge", "rain", "storm"], storm: ["rain", "rainfall", "flood"],
  coverage: ["ground", "footprint"], density: ["fsi", "floor", "population"],
};

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .match(/[a-z]+|\d+(?:\.\d+)?/g)?.filter((w) => !STOP.has(w)).map(stem) ?? [];
}

export interface Index { docs: string[][]; df: Map<string, number>; avg: number; snippets: Snippet[] }

export function buildIndex(snippets: Snippet[]): Index {
  const docs = snippets.map((s) => tokens(`${s.title} ${s.heading} ${s.text}`));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
  return { docs, df, avg, snippets };
}

/** BM25 scores of every snippet for a query (k1 1.2, b 0.75), synonyms at half weight. */
export function scores(ix: Index, query: string): number[] {
  const q = new Map<string, number>();
  for (const w of tokens(query)) {
    q.set(w, (q.get(w) ?? 0) + 1);
    for (const s of SYNONYMS[w] ?? []) q.set(stem(s), (q.get(stem(s)) ?? 0) + 0.5);
  }
  const N = ix.docs.length, k1 = 1.2, b = 0.75;
  return ix.docs.map((d) => {
    const tf = new Map<string, number>();
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const [w, qw] of q) {
      const f = tf.get(w);
      if (!f) continue;
      const df = ix.df.get(w) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      s += qw * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / ix.avg));
    }
    return s;
  });
}

/** One question per part of the brief, so each gets its own evidence. */
export const TOPICS = [
  "floor space index FSI permissible road width zone",
  "building height storeys road width high rise",
  "margins setback open space around building side rear front",
  "recreational layout open space common plot percent planting",
  "flood rain storm sea level surge drainage",
  "typology courtyard tower slab podium block",
  "population built up area required floor area target",
  "pattern",
];

export interface Retrieval { snippets: Snippet[]; byQuery: { query: string; ids: string[] }[] }

/** The snippets to put in front of the compiler: the best few for the description and for
 *  each topic, from documents about this place (or anywhere), uploads first. */
export function retrieve(all: Snippet[], description: string, place: string,
  { perTopic = 3, forDescription = 6, max = 28, maxChars = 36000 } = {}): Retrieval {
  const pool = all.filter((s) => s.place === "any" || s.place === place || s.place === "upload");
  const ix = buildIndex(pool);
  const picked: Snippet[] = [];
  const byQuery: Retrieval["byQuery"] = [];
  let chars = 0;
  const take = (query: string, k: number, onlyUploads = false) => {
    const sc = scores(ix, query);
    const order = [...sc.keys()].filter((i) => sc[i] > 0 && (!onlyUploads || pool[i].place === "upload"))
      .sort((a, b) => sc[b] - sc[a] || a - b);
    const ids: string[] = [];
    for (const i of order) {
      if (ids.length >= k) break;
      const s = pool[i];
      ids.push(s.id);
      if (picked.includes(s) || picked.length >= max || chars + s.text.length > maxChars) continue;
      picked.push(s);
      chars += s.text.length;
    }
    byQuery.push({ query, ids });
  };
  if (description.trim()) {
    take(description, forDescription, true); // what the person uploaded comes first
    take(description, forDescription);
  }
  for (const t of TOPICS) take(t, t === "pattern" ? 8 : perTopic); // all the pattern cards: they are short
  return { snippets: picked, byQuery };
}

/** Where a site is, for choosing which regulations apply: from its origin (lon, lat). */
export function placeOf(origin: [number, number]): string {
  const [lon, lat] = origin;
  if (lon > 72.7 && lon < 73.1 && lat > 18.85 && lat < 19.35) return "mumbai";
  if (lon > 72.4 && lon < 72.8 && lat > 22.9 && lat < 23.25) return "ahmedabad";
  if (lon > 77.3 && lon < 77.9 && lat > 12.7 && lat < 13.2) return "bengaluru";
  return "other";
}
