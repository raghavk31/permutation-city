"""Permutation City command line.

    uv run pc new <site> --name "..." (--bbox W S E N | --boundary site.geojson) [--hex 20] [--sea]
    uv run pc fetch <site> [--only dem terrain landcover overture]
    uv run pc build <site>     grid + layers + rules + maps
    uv run pc rules <site>     re-apply rules.yaml and redraw (fast; after editing rules)
    uv run pc grow <site> [--n 60] [--seed 1]                  generation 0, scored
    uv run pc evolve <site> [--gens 30] [--pop 60] [--seed 1]  breed generations
    uv run pc sites            list sites
    uv run pc app              the designer's sandbox (Streamlit, in the browser)
    uv run pc export <site>... [--fixture]   sites for the web app (app/public/sites/)
"""

import argparse
import json
import shutil
import time
import warnings

import geopandas as gpd
import numpy as np
import yaml

from pc import fetch, maps, pipeline
from pc.rng import Rng
from pc.site import ROOT, SITES, load

warnings.filterwarnings("ignore", category=UserWarning)

TEMPLATE_RULES = ROOT / "rules.template.yaml"


def cmd_new(a):
    folder = SITES / a.site
    if folder.exists():
        raise SystemExit(f"sites/{a.site} already exists")
    if not a.bbox and not a.boundary:
        raise SystemExit("give --bbox W S E N or --boundary polygon.geojson")
    folder.mkdir(parents=True)
    cfg = {"name": a.name or a.site, "hex_radius": a.hex, "design_storm_mm": 100, "target_far": 1.5}
    if a.boundary:
        import geopandas as gpd

        gpd.read_file(a.boundary).to_crs(4326).to_file(folder / "boundary.geojson", driver="GeoJSON")
        cfg |= {"boundary": "boundary.geojson", "context_m": 250}
    else:
        cfg["bbox"] = a.bbox
    if a.sea:
        # Placeholder levels (metres above mean sea level); check them for the site.
        cfg["sea_levels"] = {"high_tide": 1.5, "surge_today": 2.5, "surge_2050": 2.8}
    (folder / "site.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    shutil.copy(TEMPLATE_RULES, folder / "rules.yaml")
    print(f"created sites/{a.site}/ (site.yaml, rules.yaml). Next: pc fetch {a.site}")


def cmd_fetch(a):
    site = load(a.site)
    print(f"{site.name}: downloading for {site.bbox}")
    fetch.fetch(site, only=a.only)
    print("done. Next: pc build", a.site)


def cmd_build(a):
    pipeline.build(load(a.site))


def cmd_rules(a):
    pipeline.apply_rules(load(a.site))


# --- generations --------------------------------------------------------------------

def _ground(site):
    from pc import export

    suit = gpd.read_file(site.layers / "suitability.gpkg", layer="cells")
    return suit, export.engine_ground(suit)[0]


def _note(scores, floor_ha):
    return (f"{floor_ha:.0f} ha · storage {scores['storage']:.0%} · +{scores['heat']:.1f}°C\n"
            f"{scores['carbon']:.0f} kg/m² · daylight {scores['daylight']:.0%} · human {scores['human']:.0%}")


def _table(rows, order, labels, extra=None):
    print(f"  {'':7s} {'floor ha':>8s} {'storage':>8s} {'heat C':>7s} {'carbon':>7s} "
          f"{'daylight':>9s} {'human':>6s} {'levels':>7s}  {extra or ''}")
    for i in order:
        r = rows[i]
        print(f"  {labels[i]:7s} {r['floor_area_ha']:8.0f} {r['storage']:8.0%} {r['heat']:7.1f} "
              f"{r['carbon']:7.0f} {r['daylight']:9.0%} {r['human']:6.0%} "
              f"{r['mean_levels']:4.1f}/{r['max_levels']:<2.0f}  {r.get('_extra', '')}")


def _best_order(rows, ranks, scores):
    from pc import fitness

    order = []
    for r in sorted(set(ranks)):
        idx = np.flatnonzero(ranks == r)
        order += list(idx[np.argsort(-fitness.crowding(scores, idx))])
    return order


def cmd_grow(a):
    """Generation 0: random genomes grown and scored; the best shown on a sheet."""
    from pc import fitness, genome

    site = load(a.site)
    suit, ground = _ground(site)
    rng = Rng(a.seed)
    designs = [genome.grow(genome.random_genome(rng), ground) for _ in range(a.n)]
    scores = [fitness.evaluate(d, ground, site) for d in designs]
    ranks = fitness.pareto_ranks(scores)
    labels = [f"G0.{i + 1:02d}" for i in range(a.n)]
    rows = [genome.stats(d, ground) | d.scores | {"rank": int(r)} for d, r in zip(designs, ranks)]

    run = site.layers.parent / "runs" / f"seq{a.seed}"
    run.mkdir(parents=True, exist_ok=True)
    np.save(run / "gen0.npy", np.array([d.genome for d in designs]))
    (run / "gen0.json").write_text(json.dumps(dict(zip(labels, rows)), indent=1), encoding="utf-8")

    order = _best_order(rows, ranks, scores)
    show = order[:a.show]
    target = fitness.floor_area_target(site, ground) / 1e4
    on = sum(r["gap"] <= fitness.TARGET_TOLERANCE for r in rows)

    site.maps.mkdir(parents=True, exist_ok=True)
    out = site.maps / f"03-seq{a.seed}-gen0.png"
    maps.generation_sheet(site, suit, [genome.to_frame(designs[i], ground) for i in show],
                          [labels[i] for i in show], [_note(rows[i], rows[i]["floor_area_ha"]) for i in show],
                          out, f"{site.name} · Seq{a.seed} · Generation 0 · best {len(show)} of {a.n} "
                               f"({on} on brief)")
    maps.tradeoffs(site, rows, labels, target, site.maps / f"04-seq{a.seed}-gen0-tradeoffs.png",
                   f"Seq{a.seed} · Generation 0", highlight=[labels[i] for i in show if rows[i]["rank"] == 1])
    print(f"  brief: {target:.0f} ha of floor area (±{fitness.TARGET_TOLERANCE:.0%}); {on} of {a.n} on brief")
    _table(rows, order[:max(a.show, 12)], labels)
    print(f"  sheets: sites/{site.id}/maps/{out.name}, 04-seq{a.seed}-gen0-tradeoffs.png")


def cmd_evolve(a):
    """Breed generations from Generation 0; draw the final families and the progress."""
    from pc import evolve, fitness, genome

    site = load(a.site)
    suit, ground = _ground(site)
    target = fitness.floor_area_target(site, ground) / 1e4
    print(f"{site.name}: Seq{a.seed}, population {a.pop}, {a.gens} generations "
          f"(brief: {target:.0f} ha ±{fitness.TARGET_TOLERANCE:.0%})")
    t0 = time.time()
    run = evolve.evolve(site, ground, generations=a.gens, pop=a.pop, seed=a.seed)
    print(f"  {len(run.everyone):,} designs grown in {time.time() - t0:.0f} s")

    out = site.layers.parent / "runs" / f"seq{a.seed}"
    out.mkdir(parents=True, exist_ok=True)
    np.save(out / "final.npy", np.array([i.design.genome for i in run.pop]))
    (out / "history.json").write_text(json.dumps(run.history, indent=1), encoding="utf-8")
    (out / "lineage.json").write_text(json.dumps(
        {i.name: {"parents": list(i.parents), **i.scores} for i in run.everyone}), encoding="utf-8")

    # Final population: the front, grouped into families of similar designs.
    pop = run.pop
    labels = [i.name for i in pop]
    rows = [genome.stats(i.design, ground) | i.scores | {"rank": i.rank} for i in pop]
    front = [k for k, i in enumerate(pop) if i.rank == 1]
    order = sorted(front, key=lambda k: -pop[k].crowd)
    fams = fitness.families(np.stack([genome.use_codes(pop[k].design) for k in range(len(pop))]), order)
    reps = [f[0] for f in fams]
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for n, f in enumerate(fams):
        for k in f:
            rows[k]["_extra"] = f"family {letters[n % 26]} ({len(f)})" if k == f[0] else ""

    show = reps[:a.show]
    sheet = site.maps / f"05-seq{a.seed}-gen{a.gens}-families.png"
    maps.generation_sheet(
        site, suit, [genome.to_frame(pop[k].design, ground) for k in show],
        [f"Family {letters[n % 26]} · {labels[k]}" for n, k in enumerate(show)],
        [_note(rows[k], rows[k]["floor_area_ha"]) for k in show], sheet,
        f"{site.name} · Seq{a.seed} · Generation {a.gens} · {len(front)} designs on the front "
        f"in {len(fams)} families")
    maps.tradeoffs(site, rows, labels, target, site.maps / f"04-seq{a.seed}-gen{a.gens}-tradeoffs.png",
                   f"Seq{a.seed} · Generation {a.gens}", highlight=[labels[k] for k in show])
    maps.evolution(site, run, target, site.maps / f"06-seq{a.seed}-evolution.png",
                   f"Seq{a.seed} · {a.gens} generations of {a.pop}")

    print(f"  final front: {len(front)} designs in {len(fams)} families (one shown per family)")
    _table(rows, show, labels)
    print(f"  sheets: sites/{site.id}/maps/{sheet.name}, 04-seq{a.seed}-gen{a.gens}-tradeoffs.png, "
          f"06-seq{a.seed}-evolution.png")


def cmd_export(a):
    from pc import export

    for sid in a.sites:
        site = load(sid)
        print(f"{site.name}:")
        export.write(site, with_fixture=a.fixture)


def cmd_app(a):
    import subprocess
    import sys

    print("Permutation City: open http://localhost:8501 (Ctrl+C to stop)")
    subprocess.run([sys.executable, "-m", "streamlit", "run", str(ROOT / "sandbox" / "app.py"),
                    "--server.headless", "true", "--browser.gatherUsageStats", "false"])


def cmd_sites(a):
    for f in sorted(SITES.glob("*/site.yaml")):
        s = load(f.parent.name)
        print(f"  {s.id:20s} {s.name}  {s.bbox}")


def main():
    p = argparse.ArgumentParser(prog="pc", description="Permutation City")
    sub = p.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new", help="create a site")
    n.add_argument("site")
    n.add_argument("--name")
    n.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"))
    n.add_argument("--boundary", help="GeoJSON polygon of the site (instead of --bbox)")
    n.add_argument("--hex", type=float, default=20.0, help="hex radius in metres")
    n.add_argument("--sea", action="store_true", help="coastal site: add sea levels")
    f = sub.add_parser("fetch", help="download data for a site")
    f.add_argument("site")
    f.add_argument("--only", nargs="+", choices=list(fetch.STEPS))
    for name in ("build", "rules"):
        sub.add_parser(name).add_argument("site")
    gr = sub.add_parser("grow", help="generation 0: random designs, scored")
    gr.add_argument("site")
    gr.add_argument("--n", type=int, default=60, help="individuals to grow")
    gr.add_argument("--show", type=int, default=10, help="best individuals to draw")
    gr.add_argument("--seed", type=int, default=1, help="run number (Seq)")
    ev = sub.add_parser("evolve", help="breed generations")
    ev.add_argument("site")
    ev.add_argument("--gens", type=int, default=30)
    ev.add_argument("--pop", type=int, default=60)
    ev.add_argument("--seed", type=int, default=1, help="run number (Seq)")
    ev.add_argument("--show", type=int, default=10, help="families to draw")
    sub.add_parser("sites")
    sub.add_parser("app", help="open the designer's sandbox in the browser")
    ex = sub.add_parser("export", help="export sites for the web app (app/public/sites/)")
    ex.add_argument("sites", nargs="+")
    ex.add_argument("--fixture", action="store_true", help="also write a parity test fixture")
    a = p.parse_args()
    {"new": cmd_new, "fetch": cmd_fetch, "build": cmd_build, "rules": cmd_rules,
     "grow": cmd_grow, "evolve": cmd_evolve, "sites": cmd_sites, "app": cmd_app,
     "export": cmd_export}[a.cmd](a)


if __name__ == "__main__":
    main()
