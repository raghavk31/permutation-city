// The kind of design exercise: the first choice in the workbench (docs/architecture-v3.md section
// 15). It decides which steps follow and which places can be picked.

export type ExerciseId = "city" | "riverfront" | "junction" | "plot";

export interface Exercise {
  id: ExerciseId;
  name: string;
  /** What it designs, in one plain sentence. */
  words: string;
  /** What it leaves alone. */
  keeps: string;
  /** Can it be chosen yet? */
  built: boolean;
  /** How far it goes today, said plainly. */
  state: string;
}

// COPY: the design exercises
export const EXERCISES: Exercise[] = [
  { id: "city", name: "A whole neighbourhood", words: "Grow streets, plots, public ground and buildings over a large piece of land.",
    keeps: "The land's water and landform, and whatever you draw.", built: true, state: "Ready" },
  { id: "riverfront", name: "A river edge", words: "Design the edge as public space: ground, water, planting and the ways down to it.",
    keeps: "The city behind it, its monuments and the river's course.", built: true, state: "Analysis ready; design comes next" },
  { id: "junction", name: "A street junction", words: "Redesign a junction and its public space between the buildings that stand there.",
    keeps: "Every building, and where the streets run.", built: false, state: "Not built yet" },
  { id: "plot", name: "One plot", words: "Compose buildings and open ground together on one plot, for a known programme.",
    keeps: "The neighbours and the streets around it.", built: false, state: "Not built yet" },
];

export const exerciseOf = (id: string | null | undefined): Exercise | null => EXERCISES.find((e) => e.id === id) ?? null;
