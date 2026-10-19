"""Phase 5: evolution (NSGA-II style, with the Sem 06 workshop's breeding rules).

Each generation:
    1. pick parents by tournament: lower Pareto rank wins; ties go to the more distinct
    2. crossover, 60/40 as in the Sem 06 workshop: each attractor slot (all 5 genes
       together, so attractors pass on whole) and each site-wide gene comes from parent A
       with probability 0.6, otherwise from parent B
    3. mutation: each gene has a small chance of a nudge (near-Gaussian, kept within 0..1)
    4. immigration: ~10% of children are random newcomers (the workshop's G0.11), so the
       population keeps exploring instead of collapsing onto one genome
    5. parents and children compete; the best `pop` by rank, then distinctness, survive.
       With search="nsga3", whole fronts survive while they fit and the front that doesn't
       is cut by niching on reference directions instead of crowding (pc.niche)

Individuals are named G{generation}.{nn}; each records its parents.

Random numbers come from pc.rng, drawn in the same order as app/engine/evolve.ts, so a
seed gives the same run in Python and in the browser.
"""

from dataclasses import dataclass, field

import numpy as np

from pc import fitness, genome
from pc.niche import divisions_for, niche_select, reference_points
from pc.rng import Rng


@dataclass
class Individual:
    name: str
    design: genome.Design
    parents: tuple = ()
    rank: int = 0
    crowd: float = 0.0
    cell: int = -1        # MAP-Elites: the archive cell it holds
    quality: float = 0.0  # MAP-Elites: what it holds the cell by

    @property
    def scores(self):
        return self.design.scores


@dataclass
class Run:
    site: object
    ground: genome.Ground
    pop: list
    history: list = field(default_factory=list)   # per generation: summary of the front
    fronts: list = field(default_factory=list)     # per generation: front members' scores
    everyone: list = field(default_factory=list)   # every individual ever made (lineage)


def _make(g, ground, site, name, parents=(), locked=None, storm=1.0, ranges=genome.RANGES):
    d = genome.grow(g, ground, locked, ranges)
    fitness.evaluate(d, ground, site, storm)
    return Individual(name=name, design=d, parents=parents)


def _first_genomes(rng: Rng, pop, start):
    """Generation 0: `pop` random genomes, the first ones replaced by `start`."""
    genomes = [genome.random_genome(rng) for _ in range(pop)]
    for k, g in enumerate(start or []):
        genomes[k % pop] = np.asarray(g)
    return genomes


def _niche_survivors(ranked, pop, refs):
    """NSGA-III survival: whole fronts while they fit, then niching on the front that
    doesn't. `ranked` is sorted by rank."""
    end = 0
    while end < pop:
        nxt = end
        while nxt < len(ranked) and ranked[nxt].rank == ranked[end].rank:
            nxt += 1
        if nxt > pop:
            break
        end = nxt
    if end >= pop:
        return ranked[:pop]
    nxt = end
    while nxt < len(ranked) and ranked[nxt].rank == ranked[end].rank:
        nxt += 1
    chosen, last = ranked[:end], ranked[end:nxt]
    picks = niche_select([i.scores for i in chosen], [i.scores for i in last], pop - end, refs)
    return chosen + [last[k] for k in picks]


def _rank(inds):
    scores = [i.scores for i in inds]
    ranks = fitness.pareto_ranks(scores)
    for r in set(ranks):
        idx = np.flatnonzero(ranks == r)
        crowd = fitness.crowding(scores, idx)
        for k, i in enumerate(idx):
            inds[i].rank, inds[i].crowd = int(r), float(crowd[k])
    # Copies: a design that differs from a better one in fewer than 5% of its cells is
    # pushed to the back, so distinct families keep their places.
    diff = fitness.difference(np.stack([genome.use_codes(i.design) for i in inds]))
    kept = []
    for i in sorted(range(len(inds)), key=lambda i: (inds[i].rank, -inds[i].crowd)):
        if any(diff[i, j] < fitness.DUPLICATE for j in kept):
            inds[i].rank += 1000
        else:
            kept.append(i)


def _better(a, b):
    return a if (a.rank, -a.crowd) < (b.rank, -b.crowd) else b


def _pick(pop, rng: Rng):
    """Binary tournament between two different individuals."""
    i = rng.integer(len(pop))
    j = rng.integer(len(pop) - 1)
    if j >= i:
        j += 1
    return _better(pop[i], pop[j])


def _crossover(a, b, rng: Rng, p_a=0.6):
    child = np.array(b, dtype=float)
    n_att = genome.N_ATTRACTORS * genome.ATTRACTOR_GENES
    for k in range(genome.N_ATTRACTORS):
        if rng.random() < p_a:
            s = slice(k * genome.ATTRACTOR_GENES, (k + 1) * genome.ATTRACTOR_GENES)
            child[s] = a[s]
    for k in range(n_att, genome.LENGTH):
        if rng.random() < p_a:
            child[k] = a[k]
    return child


def _mutate(g, rng: Rng, rate=2 / genome.LENGTH, sigma=0.12):
    out = np.array(g, dtype=float)
    for k in range(len(out)):
        if rng.random() < rate:
            out[k] = min(max(float(out[k]) + rng.normal(0, sigma), 0.0), 1.0)
    return out


def breed(a: np.ndarray, b: np.ndarray, rng: Rng, n=6) -> list[np.ndarray]:
    """Children of two genomes, for breeding by hand (Biomorphs mode)."""
    return [_mutate(_crossover(a, b, rng), rng) for _ in range(n)]


def _record(run, gen, storm=1.0):
    """Per generation: how many designs are on brief, and the best of them on each score."""
    on = [i for i in run.pop if i.scores["gap"] <= fitness.TARGET_TOLERANCE]
    h = {"generation": gen, "on_brief": len(on), "front_size": sum(i.rank == 1 for i in run.pop),
         "storm_factor": storm}
    for k, (_, _, up) in fitness.SCORES.items():
        vals = [i.scores[k] for i in on]
        h[k] = (max(vals) if up else min(vals)) if vals else None
    run.history.append(h)
    run.fronts.append([dict(i.scores, name=i.name, floor_area_ha=float(i.design.floor_area.sum() / 1e4))
                       for i in run.pop if i.rank == 1])


def evolve(site, ground, generations=30, pop=60, seed=1, immigrants=0.1, log=print,
           locked=None, shock=None, start=None, progress=None, ranges=genome.RANGES, search="nsga2"):
    """Breed `generations` of `pop` designs.

    search    "nsga2" (crowding) or "nsga3" (reference directions; pc.niche)

    locked    use code per cell (genome.use_codes); those cells keep their use
    shock     (generation, storm_factor): from that generation on, the design storm is
              heavier, and the current population is re-judged under it
    start     genomes to include in Generation 0 (e.g. designs bred by hand, or a brief's
              typology seeds)
    ranges    how genes are read (pc.genome.RANGES; a brief may narrow them)
    progress  callback(generation, run) after each generation
    """
    if search not in ("nsga2", "nsga3"):
        raise ValueError(f"unknown search '{search}' (nsga2 or nsga3; MAP-Elites is pc.elites)")
    rng = Rng(seed)
    storm = 1.0
    m = len(fitness.SCORES)
    refs = reference_points(m, divisions_for(m, pop)) if search == "nsga3" else None
    # Generation 0: the same random genomes `pc grow` makes with this seed (plus any start).
    genomes = _first_genomes(rng, pop, start)
    first = [_make(g, ground, site, f"G0.{k + 1:02d}", locked=locked, ranges=ranges) for k, g in enumerate(genomes)]
    run = Run(site=site, ground=ground, pop=first, everyone=list(first))
    _rank(run.pop)
    _record(run, 0)

    for gen in range(1, generations + 1):
        if shock and gen == shock[0]:
            storm = shock[1]
            for i in run.pop:
                fitness.evaluate(i.design, ground, site, storm)
            _rank(run.pop)
            if log:
                log(f"  gen {gen:3d}  SHOCK: design storm x{storm:.2f}")
        children = []
        for k in range(pop):
            name = f"G{gen}.{k + 1:02d}"
            if rng.random() < immigrants:
                child = _make(genome.random_genome(rng), ground, site, name, ("immigrant",), locked, storm, ranges)
            else:
                pa, pb = _pick(run.pop, rng), _pick(run.pop, rng)
                g = _mutate(_crossover(pa.design.genome, pb.design.genome, rng), rng)
                child = _make(g, ground, site, name, (pa.name, pb.name), locked, storm, ranges)
            children.append(child)
        run.everyone += children

        both = run.pop + children
        _rank(both)
        ranked = sorted(both, key=lambda i: (i.rank, -i.crowd))
        run.pop = _niche_survivors(ranked, pop, refs) if refs else ranked[:pop]
        _rank(run.pop)
        _record(run, gen, storm)
        if progress:
            progress(gen, run)
        h = run.history[-1]
        if log and (gen % 5 == 0 or gen == generations):
            if h["on_brief"]:
                best = "  ".join(f"{k} {fmt.format(h[k])}".replace("°C", "C").replace("²", "2")
                                 for k, (_, fmt, _) in fitness.SCORES.items())
                log(f"  gen {gen:3d}  on brief {h['on_brief']:2d}  front {h['front_size']:2d}  best: {best}")
            else:
                log(f"  gen {gen:3d}  none on brief yet")
    return run
