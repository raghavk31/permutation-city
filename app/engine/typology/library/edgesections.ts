// Each river edge's section in the family's genes (typology/openshape.ts). Hardly anyone publishes a
// riverfront's section, so most of these are read off photographs or assumed, and `sure` names the
// ones that come from a figure in the entry. The rest are placeholders to start a search from.
// They aren't measurements.
/** Not case studies, and kept out of the search: a member seeds designs, so it has to be one worth
 *  starting from (docs/typologies.md). Sabarmati is a bund that narrows the river. */
export const REJECTED_EDGES = ["sabarmati-riverfront"];

export interface EdgeSection { reach: number; drop: number; tiers: number; low: number; lowWide: number; wall: number; bank: number; wet: number; trees: number; sure: string }

export const EDGE_SECTIONS: Record<string, EdgeSection> = {
  // The place's own precedents. Drop from our terrain at Agra: about 148 m at the bank, 153 m in
  // Mehtab Bagh and 159 m in the Taj's garden (sites/agra-taj), so rough.
  "mehtab-bagh": { reach: 300, drop: 5, tiers: 2, low: 0.8, lowWide: 0.5, wall: 0.9, bank: 0.5, wet: 0.7, trees: 0.4, sure: "reach; drop from our terrain, rough" },
  "riverfront-terrace": { reach: 300, drop: 11, tiers: 2, low: 0.9, lowWide: 0.2, wall: 1, bank: 0.5, wet: 0.3, trees: 0.4, sure: "drop from our terrain, rough; a wall and terrace from photographs" },
  // Ghats, stone platforms and steps from the top of the bank to the water.
  ghats: { reach: 30, drop: 12, tiers: 6, low: 0, lowWide: 0.2, wall: 0.2, bank: 0.5, wet: 0.35, trees: 0, sure: "steps down to the water; sizes assumed" },
  "maheshwar-ghat": { reach: 25, drop: 8, tiers: 4, low: 0, lowWide: 0.3, wall: 0.4, bank: 0.5, wet: 0.4, trees: 0, sure: "platforms and bastions from photographs; sizes assumed" },
  // Modern city riverfronts.
  "berges-du-rhone": { reach: 20, drop: 5, tiers: 2, low: 0.3, lowWide: 0.5, wall: 0.7, bank: 0.5, wet: 0.5, trees: 0.25, sure: "reach (area over length; 5 to 75 m in places); two levels and a sloping stone wall" },
  // Parks that give the river its ground.
  "buffalo-bayou": { reach: 88, drop: 12, tiers: 3, low: 0.1, lowWide: 0.33, wall: 0, bank: 0.33, wet: 0.9, trees: 0.45, sure: "reach (area over length, per bank); bank 3:1 as the designers preferred; flood reaches most of it" },
  "yanweizhou": { reach: 80, drop: 6, tiers: 4, low: 0.1, lowWide: 0.25, wall: 0, bank: 0.2, wet: 0.6, trees: 0.3, sure: "terraces under the 20-year flood; sizes assumed" },
  "nijmegen-river": { reach: 350, drop: 6, tiers: 2, low: 0.1, lowWide: 0.5, wall: 0, bank: 0.1, wet: 0.7, trees: 0.15, sure: "reach (the dike moved back 350 m); the rest assumed" },
  "asita-east": { reach: 350, drop: 4, tiers: 1, low: 0.2, lowWide: 0.9, wall: 0, bank: 0.05, wet: 0.9, trees: 0.2, sure: "none: same river as Agra's, its section assumed" },
  "adyar-poonga": { reach: 150, drop: 4, tiers: 2, low: 0.1, lowWide: 0.5, wall: 0, bank: 0.2, wet: 0.5, trees: 0.4, sure: "none: mounds from dug earth round the water, sizes assumed" },
};
