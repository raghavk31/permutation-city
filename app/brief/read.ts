// Uploaded documents → pages of text, in the browser. Nothing is uploaded anywhere: only the
// snippets cut from these pages go to the brief compiler, with the request (decision D6).
// pdf.js is loaded only when someone adds a PDF.

export interface ReadDocument { name: string; pages: string[]; chars: number }

export const MAX_FILE_BYTES = 30_000_000;
export const MAX_PAGES = 300;

export async function readDocument(file: File): Promise<ReadDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 30 MB.`);
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const pages = pdf ? await pdfPages(file) : (await file.text()).split("\f");
  const chars = pages.reduce((s, p) => s + p.length, 0);
  if (!chars) throw new Error(`${file.name} has no text to read${pdf ? " (a scan? only PDFs with real text work)" : ""}.`);
  return { name: file.name, pages, chars };
}

async function pdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(text);
  }
  await task.destroy();
  return pages;
}
