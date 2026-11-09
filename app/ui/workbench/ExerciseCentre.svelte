<script lang="ts">
  // The first step: what kind of design exercise this is. It decides the steps that follow.
  import { EXERCISES, type ExerciseId } from "../../engine/focus/exercise";
  import * as Iso from "../diagrams/iso";
  import { bench } from "./bench.svelte";

  const PICTURE: Record<ExerciseId, () => string> = {
    city: () => Iso.exerciseCity().svg, riverfront: () => Iso.exerciseRiver().svg,
    junction: () => Iso.exerciseJunction().svg, plot: () => Iso.exercisePlot().svg,
  };
</script>

<div class="wb-exercises">
  <!-- COPY: the first question -->
  <h1>What are you designing?</h1>
  <div class="wb-exercise-grid">
    {#each EXERCISES as e (e.id)}
      <button class="wb-exercise" type="button" disabled={!e.built} aria-pressed={bench.exercise === e.id} onclick={() => bench.chooseExercise(e.id)}>
        <figure>{@html PICTURE[e.id]()}</figure>
        <b>{e.name}</b>
        <span>{e.words}</span>
        <span class="wb-quiet-line">Stays: {e.keeps}</span>
        <span class="wb-tag" class:is-low={!e.built}>{e.state}</span>
      </button>
    {/each}
  </div>
</div>
