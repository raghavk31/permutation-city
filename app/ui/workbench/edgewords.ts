// The river's edge in plain words, for the design step.
import type { Law, Room, Stop, Stretch } from "../../engine/focus/edge";

// COPY: a stretch of bank
export const ROOM_WORDS: Record<Room, string> = {
  none: "No room", narrow: "Narrow", wide: "Wide", broad: "Very wide",
};
export const LAW_WORDS: Record<Law, string> = {
  prohibited: "Next to a monument: no construction",
  regulated: "Near a monument: needs permission",
  free: "Outside the monuments' limits",
};
export const STOP_WORDS: Record<Stop, string> = {
  rises: "the ground rises above the line",
  building: "a building",
  street: "a street or railway",
  stays: "something that stays",
  water: "water",
  box: "the edge of the study area",
  far: "nothing within 500 m",
};

/** What usually ends the ground here. */
export function mainStop(s: Stretch): Stop {
  return (Object.entries(s.stops) as [Stop, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}
