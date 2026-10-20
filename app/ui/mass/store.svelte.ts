// What the massing chapter is looking at: set by the main page (a design picked in Families
// or the pen), read by Massing.svelte. Raw state: the ground and the site are large and never
// change in place, so they are swapped whole, never proxied.
import type { Source } from "./massing";

class MassStore {
  src = $state.raw<Source | null>(null);
}

export const mass = new MassStore();

export function openMassing(src: Source) { mass.src = src; }
export function closeMassing() { mass.src = null; }
