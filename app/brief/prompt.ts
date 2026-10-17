// The brief compiler's instructions and the tool it must fill. The tool's schema mirrors
// app/engine/brief.ts, with the choices narrowed to this site: its changeable rules, the
// snippets it was given, the pattern cards. The validator checks everything again after.
import * as E from "../engine";
import type { Snippet } from "./chunk";
import type { SiteSummary } from "./summary";

export const TOOL = "propose_brief";

type Json = Record<string, unknown>;

const num = (min: number, max: number, integer = false): Json => ({ type: integer ? "integer" : "number", minimum: min, maximum: max });
const obj = (properties: Record<string, Json>, required = Object.keys(properties)): Json =>
  ({ type: "object", properties, required, additionalProperties: false });
const nullable = (s: Json): Json => ({ anyOf: [s, { type: "null" }] });

export function briefSchema(ctx: E.BriefContext): Json {
  const sources: Json = { type: "array", items: ctx.snippets.length ? { type: "string", enum: ctx.snippets } : { type: "string" },
    description: "ids of the snippets that support the value; empty means assumed" };
  const note: Json = { type: "string", description: "one short sentence: why this value" };
  const cited = (value: Json, what: string) => nullable({ ...obj({ value, sources, note }), description: what });
  const weights = (keys: readonly string[]) => obj(Object.fromEntries(keys.map((k) => [k, num(0, 1)])), []);
  const ranked = (field: string, keys: readonly string[]) =>
    ({ type: "array", items: obj({ [field]: { type: "string", enum: [...keys] }, weight: num(0, 1) }) });
  const changeable = ctx.rules.filter((r) => r.kind === "constrained").map((r) => r.name);
  return obj({
    summary: { type: "string", description: "the brief in two or three plain sentences" },
    fsi: cited(num(0.1, 8), "floor-area target as FSI over the design ground"),
    floor_area_ha: cited(num(0.1, 10000), "or an absolute floor-area target in hectares (wins over FSI); null to use FSI"),
    height_limit_levels: cited(num(1, 60, true), "height cap in storeys over all design ground; null for none"),
    ground_coverage_max: cited(num(0.2, 0.9), "most of a building plot a building may cover"),
    design_storm_mm: cited(num(10, 1500), "rain in the design storm, mm, for flood storage"),
    setbacks_m: cited(obj({ front: num(0, 30), side: num(0, 30), rear: num(0, 30) }), "plot margins in metres (recorded for building-scale massing)"),
    programme_mix: cited(weights(E.PROGRAMMES), "share of floor area per use, 0 to 1 (recorded)"),
    objective_weights: cited(weights(E.SCORE_KEYS), "how much each score matters, 0 to 1; orders the designs shown first"),
    gene_ranges: cited(obj(Object.fromEntries(E.RANGE_KEYS.map((k) => [k, {
      type: "array", items: num(E.DEFAULT_RANGES[k][0], E.DEFAULT_RANGES[k][1]), minItems: 2, maxItems: 2,
      description: `[low, high] within ${E.DEFAULT_RANGES[k][0]} to ${E.DEFAULT_RANGES[k][1]}`,
    }])), []), "narrow how the site-wide genes are read; leave out genes you don't want to change"),
    typology_priors: cited(ranked("type", E.TYPOLOGIES), "building types to lean towards, with weights"),
    aesthetic_priorities: cited(ranked("metric", E.AESTHETICS), "form qualities to watch (recorded until the metrics exist)"),
    rule_changes: {
      type: "array", description: "changes to the site's constrained rules only",
      items: obj({
        rule: changeable.length ? { type: "string", enum: changeable } : { type: "string" },
        enabled: { type: "boolean" }, max_levels: num(1, 60, true), min_permeable: num(0, 1), sources, note,
      }, ["rule", "sources", "note"]),
    },
    patterns: {
      type: "array", description: "Pattern Language patterns to switch on",
      items: obj({ id: { type: "integer", enum: ctx.patterns }, sources, note }),
    },
    tags: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 8, description: "materials and textures (recorded only)" },
  });
}

export const SYSTEM = `You write the brief for an urban design study in Permutation City, a tool that breeds site designs on a cell grid. Designs place three uses (building, landscape, water) with a height per building cell, inside rules derived from the site's layers. You do not design; you set the brief the designs are judged against.

Fill the ${TOOL} tool. Rules:
- Use only the snippets given. Cite a snippet's id in "sources" for every value it supports. If no snippet supports a value, leave "sources" empty: the value is then shown as assumed. Never cite a snippet for something it does not say.
- Prefer regulations about this site's place. A studio note is a precedent, not a rule; say so in the note.
- Leave a field null when neither the snippets nor the description give a reason to set it. Fewer, well-supported values beat many guesses.
- FSI is floor area over the design ground (not per plot). A storey is about 3.2 m, so 10 m is 3 storeys and 16.5 m about 5.
- The height cap applies to all design ground. Rules may already cap some land lower.
- Forbidden and retained rules are fixed. You may only change constrained rules: switch one off, or change its max_levels or min_permeable.
- Gene ranges narrow how the engine reads its genes. Stay inside each gene's default range.
- Switch on a pattern only if the description or a snippet calls for what it does. Pattern numbers in the cards are unchecked against the book; cite the card.
- Notes are one short plain sentence. No marketing tone. No em dashes.`;

/** The user message: the site, the person's description, and the snippets with their ids. */
export function userMessage(site: SiteSummary, description: string, snippets: Snippet[]): string {
  const docs = snippets.map((s) => `[${s.id}] ${s.title}: ${s.heading}${s.ref ? ` (${s.ref})` : ""}\n${s.text}`).join("\n\n");
  return `SITE\n${JSON.stringify(site, null, 1)}\n\n`
    + `DESCRIPTION FROM THE PERSON\n${description.trim() || "(none given)"}\n\n`
    + `SNIPPETS (cite by the id in brackets)\n${docs || "(none)"}\n\n`
    + `Write the brief with the ${TOOL} tool.`;
}
