// The brief compiler's pieces: the corpus module, chunking, retrieval, the tool schema, and
// the route, with a stand-in for OpenRouter.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CORPUS } from "../../app/api/_corpus";
import { corpusSnippets, frontMatter, uploadSnippets } from "../../app/brief/chunk";
import { handle, patternNumbers, resetRateLimit, type Deps } from "../../app/brief/compile";
import { briefSchema, userMessage } from "../../app/brief/prompt";
import { placeOf, retrieve, scores, buildIndex, tokens } from "../../app/brief/retrieve";
import { summarise } from "../../app/brief/summary";
import * as E from "../../app/engine";
import { OUT, render } from "../../app/scripts/corpus";

const SITES = join(__dirname, "..", "..", "app", "public", "sites");
const site: E.SiteExport = JSON.parse(readFileSync(join(SITES, "mumbai-docks.json"), "utf8"));
const res = E.applyRules(site.rules!, site.grid.layers!, site.grid.x.length);
const summary = summarise(site, site.rules!, res);

describe("corpus", () => {
  it("app/api/_corpus.ts is up to date with /corpus (run npm run corpus)", () => {
    expect(readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")).toBe(render());
  });

  it("every file states its source and place, and every snippet has text", () => {
    for (const s of CORPUS) {
      expect(s.source, s.id).not.toBe("");
      expect(["mumbai", "ahmedabad", "any"], s.id).toContain(s.place);
      expect(s.text.length, s.id).toBeGreaterThan(40);
    }
  });

  it("has the six pattern cards", () => {
    expect(patternNumbers(CORPUS)).toEqual([21, 60, 61, 106, 107, 159]);
  });
});

describe("chunking", () => {
  it("reads front matter and splits on sections", () => {
    const md = '---\nid: x\ntitle: "A \\"quoted\\" title"\nplace: any\n---\n\nintro\n\n## One\n\nfirst\n\n## Two\nsecond\n';
    expect(frontMatter(md).meta.title).toBe('A "quoted" title');
    const s = corpusSnippets(md);
    expect(s.map((x) => [x.id, x.heading, x.text])).toEqual([["x#1", "One", "first"], ["x#2", "Two", "second"]]);
  });

  it("cuts uploads into overlapping windows with page ids", () => {
    const page = "Sentence one is here. ".repeat(120);
    const s = uploadSnippets("Client Brief (v2).pdf", ["", page, "short"]);
    expect(s[0].id).toBe("upload:client-brief-v2:p2:1");
    expect(s.every((x) => x.text.length <= 1000)).toBe(true);
    expect(s.at(-1)!.id).toBe("upload:client-brief-v2:p3:1");
    const joined = s.filter((x) => x.heading === "page 2").map((x) => x.text).join(" ");
    expect(joined.length).toBeGreaterThanOrEqual(page.trim().length); // overlap: nothing lost
  });
});

describe("retrieval", () => {
  it("tokenises numbers, stems plurals, drops stop words", () => {
    expect(tokens("The FSI is 2.4 on roads of 12.2 m")).toEqual(["fsi", "2.4", "road", "12.2", "m"]);
  });

  it("finds the FSI table for an FSI question", () => {
    const ix = buildIndex(CORPUS);
    const sc = scores(ix, "permissible FSI by road width");
    const best = CORPUS[sc.indexOf(Math.max(...sc))];
    expect(best.id.startsWith("mumbai-dcpr-fsi") || best.id.startsWith("ahmedabad-cgdcr-fsi")).toBe(true);
  });

  it("keeps to the site's place, and puts uploads first", () => {
    const up = uploadSnippets("brief.pdf", ["The client wants a floor space index of 2.0 and no towers."]);
    const r = retrieve([...up, ...CORPUS], "floor space index for the client", "mumbai");
    expect(r.snippets[0].id).toBe(up[0].id);
    expect(r.snippets.some((s) => s.place === "ahmedabad")).toBe(false);
    expect(r.snippets.some((s) => s.id.startsWith("mumbai-dcpr-fsi"))).toBe(true);
    expect(r.snippets.some((s) => s.kind === "pattern")).toBe(true);
    expect(new Set(r.snippets.map((s) => s.id)).size).toBe(r.snippets.length);
  });

  it("knows where the sites are", () => {
    expect(placeOf(site.meta.origin)).toBe("mumbai");
    expect(placeOf([72.58, 23.06])).toBe("ahmedabad");
    expect(placeOf([77.2, 28.6])).toBe("other");
  });
});

describe("schema and prompt", () => {
  const ctx: E.BriefContext = { rules: summary.rules.map((r) => ({ name: r.name, kind: r.kind as E.Rule["kind"] })),
    snippets: ["a#1", "b#2"], patterns: [21, 60] };
  const schema = briefSchema(ctx) as { properties: Record<string, any>; required: string[] };

  it("offers only this site's constrained rules, these snippets and these patterns", () => {
    const rule = schema.properties.rule_changes.items.properties.rule.enum;
    expect(rule).toContain("rain hollows");
    expect(rule).not.toContain("deep flooding in 2050");
    expect(schema.properties.patterns.items.properties.id.enum).toEqual([21, 60]);
    expect(schema.properties.fsi.anyOf[0].properties.sources.items.enum).toEqual(["a#1", "b#2"]);
    expect(schema.required).toContain("fsi");
  });

  it("covers every field the validator knows", () => {
    const fields = Object.keys(E.validateBrief({}, ctx).brief).filter((k) => k !== "version");
    expect(Object.keys(schema.properties).sort()).toEqual(fields.sort());
  });

  it("puts the site, description and snippets in the message", () => {
    const m = userMessage(summary, "Keep it low", CORPUS.slice(0, 1));
    expect(m).toContain(`[${CORPUS[0].id}]`);
    expect(m).toContain("Keep it low");
    expect(m).toContain('"place": "mumbai"');
  });
});

describe("POST /api/brief", () => {
  beforeEach(resetRateLimit);
  const reply = (args: unknown) => new Response(JSON.stringify({
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(args) } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }));
  const deps = (respond: (body: any) => Response, env: Record<string, string> = { OPENROUTER_API_KEY: "k" }): Deps & { sent: any[] } => {
    const sent: any[] = [];
    return {
      sent, env, now: () => 1e12,
      fetch: (async (_url: string, init: RequestInit) => { const b = JSON.parse(init.body as string); sent.push(b); return respond(b); }) as typeof fetch,
    };
  };
  const request = (body: unknown, origin: string | null = "https://permutationcity.vercel.app", ip = "1.2.3.4") =>
    new Request("https://permutationcity.vercel.app/api/brief", {
      method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(origin ? { Origin: origin } : {}) },
    });
  const body = { site: summary, description: "A low, green waterfront", uploads: [] };

  it("answers only the app and its previews", async () => {
    const d = deps(() => reply({}));
    expect((await handle(request(body, null), CORPUS, d)).status).toBe(403);
    expect((await handle(request(body, "https://permutation-city.vercel.app"), CORPUS, d)).status).toBe(403);
    expect((await handle(request(body, "https://permutation-city-git-v2-phase4-raghav-6207s-projects.vercel.app"), CORPUS, d)).status).toBe(200);
    expect((await handle(request(body, "http://localhost:5173"), CORPUS, d)).status).toBe(200);
  });

  it("says so when there is no key", async () => {
    const r = await handle(request(body), CORPUS, deps(() => reply({}), {}));
    expect(r.status).toBe(503);
  });

  it("returns the validated brief, the warnings and the snippets it showed", async () => {
    const d = deps((sent) => {
      const ids: string[] = sent.tools[0].function.parameters.properties.fsi.anyOf[0].properties.sources.items.enum;
      return reply({ summary: "Low and green.", fsi: { value: 2.0, sources: [ids.find((i) => i.startsWith("mumbai-dcpr-fsi"))], note: "" },
        height_limit_levels: { value: 99, sources: [], note: "" }, nonsense: 1 });
    });
    const r = await handle(request(body), CORPUS, d);
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(out.brief.fsi.value).toBe(2.0);
    expect(out.brief.fsi.sources[0]).toMatch(/^mumbai-dcpr-fsi#/);
    expect(out.brief.height_limit_levels).toBeNull();
    expect(out.warnings).toEqual(["unknown field nonsense dropped", "height_limit_levels: outside the allowed range; left out"]);
    expect(out.snippets.map((s: { id: string }) => s.id)).toContain(out.brief.fsi.sources[0]);
    expect(out.model).toBe("anthropic/claude-sonnet-5.5");
    expect(d.sent[0].tool_choice.function.name).toBe("propose_brief");
    expect(d.sent[0].messages[1].content).toContain("A low, green waterfront");
  });

  it("uses the careful model when asked", async () => {
    const d = deps(() => reply({}));
    const out = await (await handle(request({ ...body, quality: "careful" }), CORPUS, d)).json();
    expect(out.model).toBe("anthropic/claude-opus-5.5");
  });

  it("refuses bad requests and too many of them", async () => {
    const d = deps(() => reply({}));
    expect((await handle(request({ description: "x" }), CORPUS, d)).status).toBe(400);
    expect((await handle(request({ ...body, description: "x".repeat(5000) }), CORPUS, d)).status).toBe(413);
    expect((await handle(request({ ...body, uploads: [{ id: "corpus#1", text: "x" }] }), CORPUS, d)).status).toBe(400);
    resetRateLimit();
    const codes = [];
    for (let k = 0; k < 9; k++) codes.push((await handle(request(body, undefined, "9.9.9.9"), CORPUS, d)).status);
    expect(codes.slice(0, 8).every((c) => c === 200)).toBe(true);
    expect(codes[8]).toBe(429);
  });

  it("explains when the model fails or answers with something else", async () => {
    const bad = await handle(request(body), CORPUS, deps(() => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 })));
    expect(bad.status).toBe(502);
    expect((await bad.json()).error).toContain("overloaded");
    const prose = await handle(request(body), CORPUS, deps(() => new Response(JSON.stringify({ choices: [{ message: { content: "Sure! Here is a brief." } }] }))));
    expect(prose.status).toBe(502);
  });
});
