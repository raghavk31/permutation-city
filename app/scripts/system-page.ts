// Build the design system page, docs/ui/system.html, from the real sources: the tokens
// (app/ui/tokens.ts), the component stylesheet (app/ui/system/components.css) and the page
// template (app/ui/system/page.html). Rerun after changing any of them.
//   npm run system
import { readFileSync, writeFileSync } from "node:fs";
import { cssVariables, dark, tokens } from "../ui/tokens.js";
import { DIAGRAMS } from "../ui/diagrams/iso.js";

const page = readFileSync("ui/system/page.html", "utf8");
const components = readFileSync("ui/system/components.css", "utf8");
const diagrams = DIAGRAMS();
// COPY: diagram titles and captions live in app/ui/diagrams/iso.ts
const gallery = diagrams.map((d) => `<div class="wb-explain"><figure>${d.svg}</figure><b>${d.title}</b><p>${d.caption}</p></div>`).join("\n");
const out = page
  .replace("/*TOKENS*/", () => cssVariables(true))
  .replace("/*COMPONENTS*/", () => components)
  .replace("<!--DIAGRAMS-->", () => gallery)
  .replace(/<!--DIAGRAM:(\w+)-->/g, (_, id: string) => diagrams.find((d) => d.id === id)?.svg ?? "")
  .replace("/*DATA*/", () => `window.PC_TOKENS = ${JSON.stringify({ ...tokens, dark })};`);
writeFileSync("../docs/ui/system.html", out);
console.log(`docs/ui/system.html: ${(out.length / 1024).toFixed(0)} KB`);
