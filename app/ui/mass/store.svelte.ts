// What the massing chapter is looking at: set by the main page (a design picked in Families
// or the pen), read by Massing.svelte. Raw state: the ground and the site are large and never
// change in place, so they are swapped whole, never proxied. The heights people set on
// existing buildings are kept per site here, so a saved run (ui/runs.ts) carries them.
import type { Source } from "./massing";

class MassStore {
  src = $state.raw<Source | null>(null);
  heights = $state.raw<Record<string, Record<number, number>>>({});
}

export const mass = new MassStore();

export function openMassing(src: Source) { mass.src = src; }
export function closeMassing() { mass.src = null; }
export function setHeights(site: string, h: Record<number, number>) { mass.heights = { ...mass.heights, [site]: h }; }
