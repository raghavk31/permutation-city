// Editing a brief by hand, and carrying it in a link (app/ui/new/brief.ts, app/ui/sites.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as E from "../../app/engine";
import * as B from "../../app/ui/new/brief";
import * as Sites from "../../app/ui/sites";

const site: E.SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const rules = site.rules!;
const cited = (value: unknown, sources = ["mumbai-dcpr-fsi#1"]) => ({ value, sources, note: "from the table" });
const base = (): E.Brief => ({ ...B.emptyBrief(rules), fsi: cited(2.4) as E.Cited<number> });

describe("editing by hand", () => {
  it("a changed value loses its citation and says so; an unchanged one keeps it", () => {
    const b = base();
    expect(B.setCited(b, "fsi", 2.4)).toBe(b);
    const c = B.setCited(b, "fsi", 3);
    expect(c.fsi).toEqual({ value: 3, sources: [], note: B.BY_HAND });
    expect(B.setCited(c, "fsi", null).fsi).toBeNull();
  });

  it("weights, ranges, lists, rules, patterns and tags", () => {
    let b = base();
    b = B.setWeight(b, "objective_weights", "storage", 1.5);
    expect(b.objective_weights!.value).toEqual({ storage: 1 });
    b = B.setWeight(b, "objective_weights", "storage", null);
    expect(b.objective_weights).toBeNull();
    b = B.setRange(b, "green_share", 0.5, 0.2);
    expect(b.gene_ranges!.value.green_share).toEqual([0.2, 0.45]); // clamped to the default, ordered
    b = B.setRanked(b, "typology_priors", "type", "tower", 0.5);
    b = B.setRanked(b, "typology_priors", "type", "slab", 1);
    b = B.setRanked(b, "typology_priors", "type", "tower", null);
    expect(b.typology_priors!.value).toEqual([{ type: "slab", weight: 1 }]);
    b = B.setRuleChange(b, "rain hollows", { max_levels: 3 });
    b = B.setRuleChange(b, "rain hollows", { enabled: false });
    expect(b.rule_changes).toEqual([{ rule: "rain hollows", max_levels: 3, enabled: false, sources: [], note: B.BY_HAND }]);
    b = B.togglePattern(b, 106, true);
    b = B.togglePattern(b, 21, true);
    expect(b.patterns.map((p) => p.id)).toEqual([21, 106]);
    b = B.setTags(b, "brick, , lime plaster, brick");
    expect(b.tags).toEqual(["brick", "lime plaster"]);
    // Everything set by hand still passes the validator.
    expect(Sites.recheck(b, rules).warnings).toEqual([]);
  });

  it("describes a brief in a line", () => {
    const b = B.togglePattern(B.setCited(base(), "design_storm_mm", 250), 21, true);
    expect(B.describe(b)).toEqual(["FSI 2.4", "up to 4 storeys (pattern 21)", "250 mm storm (assumed)", "patterns 21"]);
  });

  it("downloads only the snippets the brief cites", () => {
    const f = B.briefFile("mumbai-docks", base(), [
      { id: "mumbai-dcpr-fsi#1", title: "", heading: "", ref: "", source: "", place: "", kind: "", text: "" },
      { id: "other#1", title: "", heading: "", ref: "", source: "", place: "", kind: "", text: "" },
    ]);
    expect(f.snippets.map((s) => s.id)).toEqual(["mumbai-dcpr-fsi#1"]);
  });
});

describe("a brief in a link", () => {
  it("survives the round trip and keeps its citations when checked again", () => {
    const b = B.togglePattern(base(), 60, true);
    const back = Sites.decodeBrief(Sites.encodeBrief({ brief: b, seeds: true }));
    expect(back.seeds).toBe(true);
    const { brief, warnings } = Sites.recheck(back.brief, rules);
    expect(warnings).toEqual([]);
    expect(brief).toEqual(b);
  });

  it("refuses a link it can't read", () => {
    expect(() => Sites.decodeBrief("not-json")).toThrow("can't be read");
  });

  it("sets the site's targets, storm, rules and design ground", () => {
    let b = B.setCited(base(), "design_storm_mm", 300);
    b = B.setCited(b, "height_limit_levels", 5);
    b = B.setRuleChange(b, "industrial land", { enabled: false });
    const { site: s, config } = Sites.withBrief(site, rules, b);
    expect(s.meta.target_far).toBe(2.4);
    expect(s.meta.design_storm_mm).toBe(300);
    expect(config.rules.defaults.max_levels).toBe(5);
    const G = E.prepare(s);
    expect(Math.max(...G.cap)).toBeLessThanOrEqual(5);
    expect(s.meta.target_ha).toBeCloseTo(2.4 * s.meta.design_ha, 0);
  });
});
