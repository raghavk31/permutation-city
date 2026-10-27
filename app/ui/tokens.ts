// Permutation City: design tokens. The one place colours, ramps, type and spacing are defined
// (docs/ui/colour.md). Maps, charts, 3D materials, legends and CSS all read from here: CSS
// through the custom properties `applyTokens` sets, canvas and three.js through `tokens`.
//
// One meaning per colour:
//   water     one blue family: deep for permanent water, lighter for flood extent, lightest
//             for storage (the design's ponds and tanks)
//   green     one muted green family: darker for existing or retained green, lighter for proposed
//   building  a warm neutral ramp, light (low) to dark (tall)
//   street    off-white on the design, mid grey on light ground
//   existing  light grey, always quieter than the design
//   forbidden a muted red hatch; constrained a thin grey hatch, never a fill
//   elevation, heat and measures have ramps of their own, sharing no hue with water or building
//   accent    selection and highlight, used for nothing else

export const tokens = {
  paper: "#fafaf8",        // raghavkohli.xyz's ground
  paper2: "#f2f1ec",
  ink: "#1c1b18",          // and its ink
  ink2: "#57544d",
  muted: "#8c887f",
  line: "#e3e1da",

  water: { deep: "#3d74b0", flood: "#93b8e0", storage: "#b9d4f1", edge: "#3d74b0" },
  green: { existing: "#2f8a85", proposed: "#7fc4c0", light: "#cfe9e7" },
  /** Buildings by storeys, light (low) to dark (tall). */
  building: ["#e8d6b2", "#d9c19a", "#c4a67d", "#a68862", "#7f674b", "#56463a"],
  street: { onDesign: "#fbfaf7", onGround: "#b3afa6", primary: "#8c887f" },
  existing: { fill: "#dfe1e2", edge: "#c8cbcd", road: "#b9b5ad", rail: "#c2beb6" },
  /** The existing city as a layer (how built up a cell is): light to mid grey, never as dark
   *  as the design. */
  existingRamp: ["#eceeef", "#dadddf", "#c5c9cc", "#adb2b6", "#949a9f"],
  forbidden: "#c0503f",
  constrained: "#8c887f",
  accent: "#f26b1d",
  /** Street frontage types (plan/shared.ts FRONTAGES order): shops at ground, homes, beside
   *  shared ground, along the water. */
  frontage: { active: "#c98a2b", residential: "#a39f96", green: "#2f8a85", lake: "#3d74b0" },

  /** Ground height: rose to umber, a redder hue than the building ramp. */
  elevation: ["#f6eeea", "#ead5cb", "#d9b5a5", "#c1907d", "#a06b58", "#7a4a3b"],
  /** Heat: inferno from 0.3 to 0.95 (perceptually uniform), cool to hot. */
  heat: ["#6a176e", "#932667", "#bc3754", "#dd513a", "#f37819", "#fca50a", "#f6d746"],
  /** Any other measure (space syntax, a metric chosen to colour by): pale to deep violet. */
  measure: ["#eee9f6", "#cfc3e6", "#a895cf", "#8067b5", "#5a3f94", "#36236b"],

  font: {
    text: '"Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  /** Type scale (px): no more than five sizes. */
  size: { small: 12, ui: 14, body: 16, title: 24, display: 42 },
  space: 8,
  radius: 6,
  border: 1,
};

export type Tokens = typeof tokens;

/** Dark theme: only the neutrals change; the semantic colours keep their meaning. */
export const dark: Partial<Record<"paper" | "paper2" | "ink" | "ink2" | "muted" | "line", string>> = {
  paper: "#1b1a18", paper2: "#252421", ink: "#f1efe9", ink2: "#c3c0b7", muted: "#9a968c", line: "#3a3834",
};

/** The page's custom properties, from the tokens. With `followSystem`, a reader whose system is
 *  dark gets the dark neutrals too (the design system page does; the app follows only an
 *  explicit data-theme so far). */
export function cssVariables(followSystem = false): string {
  const t = tokens, v: Record<string, string> = {
    "--pc-surface": t.paper, "--pc-surface-2": t.paper2, "--pc-ink": t.ink, "--pc-ink-2": t.ink2,
    "--pc-muted": t.muted, "--pc-line": t.line,
    "--pc-water": t.water.deep, "--pc-water-flood": t.water.flood, "--pc-water-storage": t.water.storage,
    "--pc-green": t.green.existing, "--pc-green-proposed": t.green.proposed, "--pc-green-light": t.green.light,
    "--pc-build": t.building[3], "--pc-existing": t.existing.fill, "--pc-existing-edge": t.existing.edge,
    "--pc-forbidden": t.forbidden, "--pc-constrained": t.constrained,
    "--pc-street": t.street.onDesign, "--pc-street-ground": t.street.onGround,
    "--pc-accent": t.accent, "--pc-sea": t.paper2, "--pc-retained": t.existing.fill,
    "--pc-font": t.font.text, "--pc-mono": t.font.mono,
    "--pc-measure": `linear-gradient(90deg, ${t.measure.join(", ")})`,
    "--pc-radius": `${t.radius}px`, "--pc-border": `${t.border}px`, "--pc-space": `${t.space}px`,
  };
  for (const [k, px] of Object.entries(t.size)) v[`--pc-size-${k}`] = `${px}px`;
  for (const ramp of ["building", "elevation", "heat", "measure"] as const)
    t[ramp].forEach((c, i) => { v[`--pc-${ramp}-${i}`] = c; });
  const body = (o: Record<string, string>) => Object.entries(o).map(([k, x]) => `${k}: ${x};`).join(" ");
  const d: Record<string, string> = {
    "--pc-surface": dark.paper!, "--pc-surface-2": dark.paper2!, "--pc-ink": dark.ink!, "--pc-ink-2": dark.ink2!,
    "--pc-muted": dark.muted!, "--pc-line": dark.line!, "--pc-sea": dark.paper2!, "--pc-retained": "#34322e",
  };
  const system = followSystem
    ? ` @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${body(d)} color-scheme: dark; } }`
    : "";
  return `:root, .pc { ${body(v)} }${system} :root[data-theme="dark"], :root[data-theme="dark"] .pc { ${body(d)} color-scheme: dark; }`;
}

/** Put the tokens on the page (once). */
export function applyTokens() {
  if (typeof document === "undefined" || document.getElementById("pc-tokens")) return;
  const s = document.createElement("style");
  s.id = "pc-tokens";
  s.textContent = cssVariables();
  document.head.prepend(s);
}

/** The neutrals for the theme in use (canvas drawing reads these). */
export function neutrals() {
  const isDark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  return isDark ? { ...pick(tokens), ...dark } : pick(tokens);
}
const pick = (t: Tokens) => ({ paper: t.paper, paper2: t.paper2, ink: t.ink, ink2: t.ink2, muted: t.muted, line: t.line });

/** Storeys to the building ramp (15 storeys or more is the darkest). */
export const buildingAt = (storeys: number, top = 15) =>
  tokens.building[Math.min(tokens.building.length - 1, Math.max(0, Math.floor((storeys / top) * tokens.building.length)))];
