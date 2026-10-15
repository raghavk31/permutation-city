// Runs evolution off the main thread, so the page stays responsive.
import { prepare, evolve, frontFamilies } from "./engine.js";

let G = null;

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "site") {
    G = prepare(msg.site);
    return;
  }
  if (msg.type === "evolve") {
    const run = evolve(G, {
      ...msg.options,
      progress: (gen, r) => postMessage({ type: "progress", gen, row: r.history[r.history.length - 1] }),
    });
    // Send back the family leads as genomes; the page regrows them (fast, and identical).
    postMessage({
      type: "done",
      history: run.history,
      everyone: run.everyone,
      frontSize: run.pop.filter((i) => i.rank === 1).length,
      families: frontFamilies(run).map((f) => ({
        name: f.lead.name, size: f.members.length, genome: f.lead.design.genome, parents: f.lead.parents,
      })),
    });
  }
};
