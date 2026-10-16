// The layer cake's rule editing, and rules travelling in a link.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRules, type RuleSet, type SiteExport } from "../../app/engine";
import * as Cake from "../../app/ui/new/cake";
import { decodeRules, encodeRules, withRules } from "../../app/ui/sites";

const site: SiteExport = JSON.parse(readFileSync(join(__dirname, "..", "..", "app", "public", "sites", "mumbai-docks.json"), "utf8"));
const rules = site.rules!;
const byName = (r: RuleSet, name: string) => r.list.find((x) => x.name === name)!;

describe("rule editing", () => {
  it("finds every comparison, through not/all", () => {
    const retained = byName(rules, "outside the design area");
    expect(Cake.leaves(retained.when).map((l) => [l.layer, l.negated])).toEqual([["in_design", true], ["industrial", true]]);
    expect(Cake.leaves(byName(rules, "rain hollows").when)).toEqual([{ path: [], layer: "pool", op: ">", value: 0.2, negated: false }]);
  });

  it("changes one threshold and nothing else", () => {
    const r = byName(rules, "rain hollows");
    const next = Cake.editLeaf(rules, r.id, [], { value: 0.05 });
    expect(byName(next, "rain hollows").when).toEqual({ layer: "pool", op: ">", value: 0.05 });
    expect(byName(rules, "rain hollows").when).toEqual({ layer: "pool", op: ">", value: 0.2 }); // original untouched
    const n = site.grid.x.length;
    const before = applyRules(rules, site.grid.layers!, n).hits[r.id].reduce((a, b) => a + b, 0);
    const after = applyRules(next, site.grid.layers!, n).hits[r.id].reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("turns a rule off and back on", () => {
    const r = byName(rules, "breeze edge");
    const off = Cake.setOff(rules, r.id, true);
    expect(Cake.isOff(byName(off, "breeze edge"))).toBe(true);
    expect(applyRules(off, site.grid.layers!, site.grid.x.length).hits[r.id].every((v) => v === 0)).toBe(true);
    expect(Cake.setOff(off, r.id, false)).toEqual(rules);
  });

  it("sets and clears limits", () => {
    const r = byName(rules, "existing trees");
    expect(byName(Cake.editLimit(rules, r.id, "max_levels", 3), "existing trees").limits.max_levels).toBe(3);
    expect(byName(Cake.editLimit(rules, r.id, "max_levels", undefined), "existing trees").limits.max_levels).toBeUndefined();
  });

  it("describes conditions in words", () => {
    expect(Cake.describe(byName(rules, "outside the design area").when)).toBe("not design area and not industry and rail");
  });
});

describe("rules in a link", () => {
  it("carries only the changes, and round-trips", () => {
    const r = byName(rules, "rain hollows");
    const edited = Cake.setOff(Cake.editLeaf(rules, r.id, [], { value: 0.05 }), byName(rules, "breeze edge").id, true);
    const text = encodeRules(edited, rules);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text.length).toBeLessThan(400);
    expect(decodeRules(text, rules)).toEqual(edited);
    expect(decodeRules(encodeRules(rules, rules), rules)).toEqual(rules);
    expect(() => decodeRules("not-base64!", rules)).toThrow("can't be read");
  });

  it("rebuilds the site the engine grows on", () => {
    const same = withRules(site, rules).site;
    expect(same.design).toEqual(site.design);
    expect(same.meta.design_ha).toBe(site.meta.design_ha);
    expect(same.meta.target_ha).toBe(site.meta.target_ha);
    const looser = withRules(site, Cake.setOff(rules, byName(rules, "water's edge").id, true)).site;
    expect(looser.design.x.length).toBeGreaterThan(site.design.x.length);
  });
});
