// Rules in plain words (app/ui/workbench/words.ts): the sentences read as sentences, and every
// number shown edits back to the value the rule stores.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type * as E from "../../app/engine";
import * as Cake from "../../app/ui/new/cake";
import * as Words from "../../app/ui/workbench/words";

const dir = join(__dirname, "..", "..", "app", "public", "sites");
const load = (id: string): E.SiteExport => JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
const text = (ps: Words.Part[]) => ps.map((p) => ("text" in p ? p.text : `${p.shown}${p.unit}`)).join("");

describe("rule sentences", () => {
  const site = load("guwahati-bharalu"), rules = site.rules!;
  const byName = (n: string) => rules.list.find((r) => r.name === n)!;

  it("say what the rule does in plain words", () => {
    expect(text(Words.sentence(byName("steep hillside"), site))).toBe("Where the slope is steeper than 25%");
    expect(text(Words.sentence(byName("water"), site))).toBe("On water");
    expect(text(Words.sentence(byName("water's edge"), site))).toBe("Where the distance to water is under 30 m");
  });

  it("edit back to the stored value, in the stored units", () => {
    const r = byName("steep hillside");
    const p = Words.sentence(r, site).find((x): x is Extract<Words.Part, { leaf: Cake.Leaf }> => "leaf" in x)!;
    const edited = Cake.editLeaf(rules, r.id, p.leaf.path, { value: 30 / p.scale });
    const after = edited.list.find((x) => x.id === r.id)!;
    expect((after.when as { value: number }).value).toBeCloseTo(0.3);
  });

  it("every site's every rule makes a sentence with its numbers in it", () => {
    for (const id of Object.keys(JSON.parse(readFileSync(join(dir, "sites.json"), "utf8")))) {
      const s = load(id);
      for (const r of s.rules?.list ?? []) {
        const ps = Words.sentence(r, s);
        expect(ps.filter((p) => "leaf" in p).length).toBe(Cake.leaves(r.when).filter((l) => l.op).length);
        expect(text(ps)).toMatch(/^[A-Z]/);
      }
    }
  });
});
