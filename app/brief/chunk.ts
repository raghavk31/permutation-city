// Text → snippets: the corpus (markdown with front matter, one snippet per `## ` section)
// and uploaded documents (pages of text, cut into overlapping windows). Runs in Node (the
// corpus build) and in the browser (uploads).

/** A piece of text the brief compiler may cite by its id. */
export interface Snippet {
  id: string;          // "<file id>#<section>" for the corpus, "upload:<doc>:p<page>:<n>" for uploads
  title: string;       // the document
  heading: string;     // the section, or "page N"
  ref: string;         // where to find it: regulation, page
  source: string;      // who published it
  place: string;       // mumbai | ahmedabad | any | upload
  kind: string;        // regulation | studio | typology | pattern | site-data | upload
  text: string;
}

/** The front matter this corpus uses: `key: value` lines, values optionally in double quotes. */
export function frontMatter(md: string): { meta: Record<string, string>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
    meta[kv[1]] = v;
  }
  return { meta, body: md.slice(m[0].length) };
}

/** One corpus file → its snippets, one per `## ` section (text before the first heading is dropped). */
export function corpusSnippets(md: string): Snippet[] {
  const { meta, body } = frontMatter(md);
  if (!meta.id) throw new Error("a corpus file needs an id in its front matter");
  const parts = body.split(/^## +/m).slice(1);
  return parts.map((p, k) => {
    const nl = p.indexOf("\n");
    const heading = (nl < 0 ? p : p.slice(0, nl)).trim();
    // Join the lines the markdown wraps; keep paragraphs and list items on their own lines.
    const text = (nl < 0 ? "" : p.slice(nl + 1)).replace(/\r/g, "").replace(/[ \t]+\n/g, "\n")
      .replace(/\n(?!\n|- |\d+\. )/g, " ").replace(/\n /g, "\n").replace(/[ \t]+/g, " ").trim();
    return {
      id: `${meta.id}#${k + 1}`, title: meta.title ?? meta.id, heading, ref: meta.ref ?? "", source: meta.source ?? "",
      place: meta.place ?? "any", kind: meta.kind ?? "", text,
    };
  });
}

const slug = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "doc";

/** Pages of an uploaded document → snippets of about `size` characters, overlapping a little
 *  so a sentence cut at one edge is whole in the next. */
export function uploadSnippets(doc: string, pages: string[], size = 1000, overlap = 150): Snippet[] {
  const name = slug(doc), out: Snippet[] = [];
  pages.forEach((page, p) => {
    const text = page.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    if (!text) return;
    let start = 0, n = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) { // end at a sentence or line break if there's one in the last third
        const cut = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
        if (cut > start + size * 0.66) end = cut + 1;
      }
      n++;
      out.push({ id: `upload:${name}:p${p + 1}:${n}`, title: doc, heading: `page ${p + 1}`, ref: `${doc}, page ${p + 1}`,
        source: "uploaded by the user", place: "upload", kind: "upload", text: text.slice(start, end).trim() });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  });
  return out;
}

/** Plain text → pages: form feeds split pages; otherwise one page. */
export const textPages = (text: string) => text.split("\f");
