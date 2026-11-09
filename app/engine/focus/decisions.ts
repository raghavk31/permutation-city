// Stakeholders' decisions as records (docs/architecture-v3.md section 15, F3). Who decided, what, on
// what reason, and what it changed. The log only grows: reversing a decision adds a record, so the
// history stays. Agents read this log and have no way to write to it.
import { type Brief, lineIndex, type Place, type Stay } from "./place.js";
import { inRings } from "./river.js";

/** One person acts in these roles for now; logins come later (section 15.7, Q2). */
export const ROLES = [
  { id: "asi", words: "Archaeological Survey of India" },
  { id: "ada", words: "Agra Development Authority" },
  { id: "irrigation", words: "Irrigation department" },
  { id: "residents", words: "Residents" },
  { id: "boats", words: "Boat and ghat users" },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

export type Choice = "keep" | "change" | "reopen";

export interface Decision {
  stay: string; choice: Choice; by: RoleId; because: string;
  /** ISO time, supplied by the caller. */
  at: string;
  /** What it changed, in words, worked out when it was recorded. */
  changed: string;
}

export type Draft = Omit<Decision, "changed" | "at">;

export const roleWords = (id: string) => ROLES.find((r) => r.id === id)?.words ?? id;

export function checkDecision(brief: Brief, d: Draft): string[] {
  const out: string[] = [];
  if (!brief.stays.some((s) => s.id === d.stay)) out.push(`nothing called ${d.stay} is in the brief`);
  if (!ROLES.some((r) => r.id === d.by)) out.push("a decision needs a stakeholder role");
  if (!d.because?.trim()) out.push("a decision needs a reason");
  if (!["keep", "change", "reopen"].includes(d.choice)) out.push("a decision is keep, change or reopen");
  return out;
}

/** The record standing for each stay: the last one, unless that reopened it. */
export function standing(log: Decision[]): Map<string, Decision> {
  const out = new Map<string, Decision>();
  for (const d of log) { if (d.choice === "reopen") out.delete(d.stay); else out.set(d.stay, d); }
  return out;
}

/** What stays, with what has been decided filled in. */
export function withDecisions(stays: Stay[], log: Decision[]): Stay[] {
  const now = standing(log);
  return stays.map((s) => {
    const d = now.get(s.id);
    return d ? { ...s, decision: d.choice as "keep" | "change", decided_by: d.by } : s;
  });
}

function stayCells(place: Place, stay: Stay, into: Uint8Array) {
  const { x, y } = place.cells;
  if (stay.rings) for (let i = 0; i < x.length; i++) if (inRings(stay.rings, x[i], y[i])) into[i] = 1;
}

/** Cells that stop staying: inside a stay decided "change", and in no other stay still standing. */
export function releasedCells(place: Place, log: Decision[]): Uint8Array | null {
  const now = standing(log);
  const stays = place.brief.stays.filter((s) => s.rings);
  const off = stays.filter((s) => now.get(s.id)?.choice === "change");
  if (!off.length) return null;
  const out = new Uint8Array(place.cells.x.length), held = new Uint8Array(out.length);
  for (const s of off) stayCells(place, s, out);
  for (const s of stays) if (!off.includes(s)) stayCells(place, s, held);
  for (let i = 0; i < out.length; i++) if (held[i]) out[i] = 0;
  return out;
}

/** What a choice changes, at the brief's line, in words. A rule still applies whatever is decided. */
export function effectOf(place: Place, stayId: string, choice: Choice): string {
  const stay = place.brief.stays.find((s) => s.id === stayId);
  if (!stay) return "";
  if (choice !== "change") return choice === "keep" ? "It stays. Nothing else moves." : "It's waiting for a decision again.";
  if (!stay.rings) return "No land moves. This limit no longer binds the design, and any law behind it still applies.";
  const cells = new Uint8Array(place.cells.x.length);
  stayCells(place, stay, cells);
  const { band } = place.cells, line = lineIndex(place.brief);
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] && band[i] >= 1 && band[i] <= line + 1) n++;
  const ha = Math.round((n * place.meta.cell_area) / 1e3) / 10;
  return `Adds up to ${ha} ha to what can change at the line. Monument and floodplain rules still apply.`;
}

export function record(place: Place, d: Draft, at: string): Decision {
  const wrong = checkDecision(place.brief, d);
  if (wrong.length) throw new Error(wrong.join("; "));
  return { ...d, because: d.because.trim(), at, changed: effectOf(place, d.stay, d.choice) };
}
