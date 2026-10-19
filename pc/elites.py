"""MAP-Elites: an archive over two traits of a design, keeping the best design per cell
(Mouret and Clune 2015). Where NSGA-II looks for the best trade-offs, this looks for the
best design of every kind: tall and open, low and dense, and so on.

Same breeding and budget as pc.evolve: Generation 0 is the same random genomes, then each
generation breeds `pop` children from elites picked at random from the archive. Random
numbers are drawn in the same order as app/engine/elites.ts, and the arithmetic is plain
Python numbers in the browser's order, so a seed gives the same archive in both.
"""

import math

from pc import fitness, genome, metrics
from pc.evolve import Individual, Run, _crossover, _first_genomes, _make, _mutate, _rank, _record
from pc.rng import Rng


def _level_stats(d) -> tuple[float, float]:
    b = d.use == "building"
    n = int(b.sum())
    if not n:
        return 0.0, 0.0
    lv = d.levels[b]
    s1, s2 = int(lv.sum()), int((lv * lv).sum())  # integers: exact, as in the browser
    mean = s1 / n
    return mean, math.sqrt(max(s2 / n - mean * mean, 0))


def _share(*uses):
    return lambda d, ground: int(sum(int((d.use == u).sum()) for u in uses)) / len(d.use)


def _score(k):
    return lambda d, ground: d.scores[k]


# name: (label, range the bins cover, how to read it). Values outside the range go in the
# end bins. Ranges checked against 1,500 random designs on three sites (`npm run ranges`
# in app/; docs/experiments/search-comparison.md).
DESCRIPTORS = {
    "mean_levels": ("average storeys", (1, 10), lambda d, ground: _level_stats(d)[0]),
    "height_variety": ("height variety (spread of storeys)", (0, 3.5), lambda d, ground: _level_stats(d)[1]),
    "open_share": ("open ground (landscape and water)", (0.2, 0.8), _share("landscape", "water")),
    "green_share": ("landscape share", (0.1, 0.5), _share("landscape")),
    "water_share": ("water share", (0.05, 0.3), _share("water")),
    "storage": ("flood storage", (0.4, 1.8), _score("storage")),
    "heat": ("heat", (0.4, 3.0), _score("heat")),
    "daylight": ("daylight", (0.3, 1.0), _score("daylight")),
    "human": ("human scale", (0.5, 0.9), _score("human")),
}

# Any form metric can be a trait too (pc.metrics), binned over where most designs fall.
for _key, (_, _, _fn) in metrics.METRICS.items():
    DESCRIPTORS[_key] = (_key.replace("_", " "), metrics.RANGES.get(_key, (0.0, 1.0)),
                         (lambda fn: lambda d, ground: float(fn(metrics.network(d, ground))))(_fn))

# What an elite holds its cell by: designs off the floor-area brief score below zero (the
# closer the better); on brief, the mean of the five scores, each scaled 0..1 over this
# range with 1 the good end. Weights (a brief's) make it a weighted mean.
QUALITY_RANGE = {"storage": (0.4, 1.8), "heat": (0.4, 3.0), "carbon": (400, 440),
                 "daylight": (0.3, 1.0), "human": (0.5, 0.9)}


def quality(s: dict, weights: dict | None = None) -> float:
    if s["gap"] > fitness.TARGET_TOLERANCE:
        return -s["gap"]
    weighted = bool(weights) and any((weights.get(k) or 0) > 0 for k in fitness.SCORES)
    total_w, total = 0.0, 0.0
    for k, (_, _, up) in fitness.SCORES.items():
        w = (weights.get(k) or 0) if weighted else 1
        if not w > 0:
            continue
        lo, hi = QUALITY_RANGE[k]
        t = (s[k] - lo) / (hi - lo)
        if not up:
            t = 1 - t
        total += w * min(max(t, 0), 1)
        total_w += w
    return total / total_w


def bin_of(v: float, rng: tuple, bins: int) -> int:
    """The bin a value falls in, 0..bins-1."""
    lo, hi = rng
    return min(max(math.floor((v - lo) / (hi - lo) * bins), 0), bins - 1)


def map_elites(site, ground, generations=30, pop=60, seed=1, immigrants=0.1, log=print, locked=None,
               shock=None, start=None, progress=None, ranges=genome.RANGES, axes=("mean_levels", "open_share"),
               bins=10, weights=None) -> Run:
    """Run MAP-Elites. The run's `pop` is the archive's elites in cell order (cell = row ×
    bins + column; columns are the first axis), ranked like a population; `run.archive`
    says which axes and how many bins."""
    for k in axes:
        if k not in DESCRIPTORS:
            raise ValueError(f"unknown trait '{k}'; one of {', '.join(DESCRIPTORS)}")
    (_, rx, fx), (_, ry, fy) = DESCRIPTORS[axes[0]], DESCRIPTORS[axes[1]]
    rng = Rng(seed)
    storm = 1.0
    archive: dict[int, Individual] = {}

    def insert(ind):
        d = ind.design
        ind.cell = bin_of(fy(d, ground), ry, bins) * bins + bin_of(fx(d, ground), rx, bins)
        ind.quality = quality(d.scores, weights)
        cur = archive.get(ind.cell)
        if cur is None or ind.quality > cur.quality:
            archive[ind.cell] = ind

    def elites():
        return [archive[c] for c in sorted(archive)]

    run = Run(site=site, ground=ground, pop=[])
    run.archive = {"axes": list(axes), "bins": bins}

    def note(gen):
        run.pop = elites()
        _rank(run.pop)
        _record(run, gen, storm)
        qd = 0.0
        for i in run.pop:
            qd += max(i.quality, 0)
        run.history[-1].update(filled=len(run.pop), qd=qd)
        if progress:
            progress(gen, run)

    for k, g in enumerate(_first_genomes(rng, pop, start)):
        ind = _make(g, ground, site, f"G0.{k + 1:02d}", locked=locked, ranges=ranges)
        run.everyone.append(ind)
        insert(ind)
    note(0)

    for gen in range(1, generations + 1):
        if shock and gen == shock[0]:
            storm = shock[1]
            everyone = elites()
            archive.clear()
            for i in everyone:
                fitness.evaluate(i.design, ground, site, storm)
                insert(i)
            if log:
                log(f"  gen {gen:3d}  SHOCK: design storm x{storm:.2f}")
        parents = elites()
        n = len(parents)
        children = []
        for k in range(pop):
            name = f"G{gen}.{k + 1:02d}"
            if rng.random() < immigrants:
                children.append(_make(genome.random_genome(rng), ground, site, name, ("immigrant",), locked, storm, ranges))
                continue
            i = rng.integer(n)
            j = rng.integer(n - 1)
            if n < 2:
                j = i
            elif j >= i:
                j += 1
            pa, pb = parents[i], parents[j]
            g = _mutate(_crossover(pa.design.genome, pb.design.genome, rng), rng)
            children.append(_make(g, ground, site, name, (pa.name, pb.name), locked, storm, ranges))
        run.everyone += children
        for c in children:
            insert(c)
        note(gen)
        h = run.history[-1]
        if log and (gen % 5 == 0 or gen == generations):
            log(f"  gen {gen:3d}  archive {h['filled']:3d}/{bins * bins}  on brief {h['on_brief']:2d}  "
                f"front {h['front_size']:2d}  quality {h['qd']:.2f}")
    return run
