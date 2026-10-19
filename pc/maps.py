"""Maps of a site's grid, layers and rules. Saved to sites/<id>/maps/."""

import geopandas as gpd
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Patch

from pc.site import Site, read_polygon

INK, INK_2, MUTED = "#0b0b0b", "#52514e", "#898781"
SURFACE, WATER, PAPER = "#fcfcfb", "#e1e0d9", "#f0efec"
# One hue, light to dark, for magnitude.
BLUES = LinearSegmentedColormap.from_list(
    "blues", ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])
# Categorical slots in fixed order (validated with the dataviz palette script).
STATE_COLOURS = {"forbidden": "#2a78d6", "constrained": "#eb6834", "open": "#1baf7a",
                 "retained": PAPER}
MAJOR_ROADS = ["motorway", "trunk", "primary", "secondary"]


def _name(n):
    return n.get("primary") if isinstance(n, dict) else None


def context(site: Site):
    def load(theme):  # a theme with nothing in the box (or not fetched) is empty
        p = site.overture(theme)
        if not p.exists():
            return gpd.GeoDataFrame({"subtype": [], "class": [], "names": []}, geometry=[], crs=site.crs)
        return gpd.read_parquet(p).to_crs(site.crs)

    seg = load("segment")
    div = load("division")
    div = div[div["subtype"].isin(["neighborhood", "macrohood", "locality"])
              & div.geom_type.eq("Point")]
    edge = (gpd.GeoSeries([read_polygon(site.boundary)], crs=4326).to_crs(site.crs)
            if site.boundary else gpd.GeoSeries([], crs=site.crs))
    return {"roads": seg[(seg["subtype"] == "road") & seg["class"].isin(MAJOR_ROADS)],
            "rail": seg[seg["subtype"] == "rail"],
            "places": div.assign(label=div["names"].map(_name)).dropna(subset=["label"]),
            "boundary": edge}


# Where activities are today (Overture places, fetched with the `place` theme), by kind, for
# semilattice richness (pc.metrics). Places below this confidence are left out: about half
# of Mumbai's fall below 0.5, and many of those are duplicates or closed.
PLACE_MIN_CONFIDENCE = 0.4
SCHOOLS = {"school", "high_school", "elementary_school", "middle_school", "preschool", "private_school",
           "public_school", "kindergarten", "college_university", "specialty_school", "montessori_school"}
TRANSIT = {"public_transit_facility_or_service", "rail_facility_or_service", "bus_station", "train_station",
           "metro_station", "light_rail_and_subway_stations", "ferry_service", "bus_stop"}


def activities(site: Site) -> dict:
    """Shops (and food), schools and transit points, as GeoDataFrames in the site's CRS."""
    p = site.overture("place")
    empty = {k: gpd.GeoDataFrame(geometry=[], crs=site.crs) for k in ("shops", "schools", "transit")}
    if not p.exists():
        return empty
    g = gpd.read_parquet(p).to_crs(site.crs)
    g = g[(g["confidence"].fillna(0) >= PLACE_MIN_CONFIDENCE) & g.geom_type.eq("Point")]
    if "operating_status" in g:
        g = g[g["operating_status"].fillna("open").isin(["open"])]
    hier = [list(t["hierarchy"]) if isinstance(t, dict) and t.get("hierarchy") is not None else [] for t in g["taxonomy"]]
    top = [h[0] if h else None for h in hier]
    kind = ["schools" if h and h[0] == "education" and SCHOOLS & set(h)
            else "transit" if TRANSIT & set(h)
            else "shops" if t in ("shopping", "food_and_drink") else None for h, t in zip(hier, top)]
    g = g.assign(kind=kind)
    return {k: g[g["kind"] == k][["geometry"]] for k in ("shops", "schools", "transit")}


def _overlay(ax, ctx, labels=False):
    ctx["rail"].plot(ax=ax, color=INK_2, linewidth=0.5, linestyle=(0, (4, 2)))
    ctx["roads"].plot(ax=ax, color=INK, linewidth=0.6)
    if len(ctx["boundary"]):
        ctx["boundary"].boundary.plot(ax=ax, color=INK, linewidth=1.4)
    if labels:
        for _, p in ctx["places"].iterrows():
            ax.annotate(p["label"], (p.geometry.x, p.geometry.y), fontsize=7.5, color=INK,
                        ha="center", bbox=dict(boxstyle="round,pad=0.2", fc=SURFACE,
                                               ec="none", alpha=0.8))


def _frame(ax, grid, title, note):
    xmin, ymin, xmax, ymax = grid.total_bounds
    ax.set_xlim(xmin, xmax)
    ax.set_ylim(ymin, ymax)
    ax.set_axis_off()
    ax.set_title(title, loc="left", fontsize=12, color=INK, fontweight="bold", pad=18)
    ax.text(0, 1.01, note, transform=ax.transAxes, fontsize=8.5, color=INK_2, va="bottom")
    # Scale bar: a round length near a fifth of the width.
    span = (xmax - xmin) / 5
    length = min((100, 200, 250, 500, 1000, 2000, 5000), key=lambda v: abs(v - span))
    x, y = xmin + (xmax - xmin) * 0.03, ymin + (ymax - ymin) * 0.04
    ax.plot([x, x + length], [y, y], color=INK, linewidth=2, solid_capstyle="butt")
    ax.text(x + length / 2, y + (ymax - ymin) * 0.02, f"{length:,} m", ha="center",
            fontsize=7.5, color=INK)


def _sequential(ax, fig, cells, col, vmin, vmax, fmt):
    cells.plot(ax=ax, column=col, cmap=BLUES, vmin=vmin, vmax=vmax, linewidth=0)
    sm = plt.cm.ScalarMappable(cmap=BLUES, norm=plt.Normalize(vmin, vmax))
    cb = fig.colorbar(sm, ax=ax, shrink=0.55, pad=0.01)
    cb.outline.set_visible(False)
    cb.ax.tick_params(labelsize=7.5, colors=MUTED, length=0)
    cb.ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: fmt.format(v)))
    return cb


def _no_colorbar(ax, fig):
    """Reserve the colour bar's space so every panel has the same frame."""
    fig.colorbar(plt.cm.ScalarMappable(cmap=BLUES), ax=ax, shrink=0.55, pad=0.01).ax.set_visible(False)


def layers_sheet(site: Site, grid, out):
    """McHarg's overlay sheets: one panel per layer, same frame."""
    ctx = context(site)
    land, water = grid[~grid.water], grid[grid.water]
    flood = [c for c in grid.columns if c.startswith("flood_")]
    top = max(site.sea_levels, key=site.sea_levels.get) if site.sea_levels else None
    # Each site's own height range, so a plateau at 40-53 m still shows its relief.
    lo, hi = np.floor(land.ground.quantile(0.02)), np.ceil(land.ground.quantile(0.98))

    # Size the sheet to the site's shape: two rows of panels, each ~5 inches wide.
    xmin, ymin, xmax, ymax = grid.total_bounds
    panel_h = 5.0 * (ymax - ymin) / (xmax - xmin)
    fig, axes = plt.subplots(2, 3, figsize=(18, 2 * panel_h + 2.4), facecolor=SURFACE)
    for ax, key in zip(axes.flat, ["ground", "flood", "rain", "green", "built", "industrial"]):
        water.plot(ax=ax, color=WATER, linewidth=0)
        if key == "ground":
            _sequential(ax, fig, land, "ground", lo, max(hi, lo + 2), "{:.0f} m")
            _frame(ax, grid, "1 · Ground", "bare-earth height above sea level (FABDEM)")
        elif key == "flood":
            land.plot(ax=ax, color=PAPER, linewidth=0)
            if top:
                col = f"flood_{top}"
                _sequential(ax, fig, land[land[col] > 0], col, 0, 3, "{:.1f} m")
                _frame(ax, grid, "2 · Sea flooding",
                       f"depth at +{site.sea_levels[top]} m ({top.replace('_', ' ')})")
            else:
                _no_colorbar(ax, fig)
                _frame(ax, grid, "2 · Sea flooding", "not a coastal site (no sea_levels in site.yaml)")
        elif key == "rain":
            _sequential(ax, fig, land, "pool", 0, 1, "{:.1f} m")
            lines = land[land["valley_order"] >= 1].centroid if "valley_order" in land else land.iloc[:0].centroid
            ax.scatter(lines.x, lines.y, s=1.2, color=INK, linewidths=0)
            _frame(ax, grid, "3 · Rain", "pooling depth in hollows; dots = valleys (pc/landform.py)")
        elif key == "green":
            veg = land.assign(veg=land["trees"] + land["green"] + land["mangrove"])
            _sequential(ax, fig, veg, "veg", 0, 1, "{:.0%}")
            _frame(ax, grid, "4 · Green cover", "trees and other vegetation (ESA WorldCover 2021)")
        elif key == "built":
            _sequential(ax, fig, land, "built", 0, 1, "{:.0%}")
            _frame(ax, grid, "5 · Buildings", "footprint cover (Overture: Google Open Buildings + OSM)")
        else:
            land.plot(ax=ax, color=PAPER, linewidth=0)
            land[land["industrial"]].plot(ax=ax, color="#1c5cab", linewidth=0)
            _no_colorbar(ax, fig)
            _frame(ax, grid, "6 · Industrial and rail land", "stand-in for contaminated land (Overture land use)")
        _overlay(ax, ctx, labels=(key == "ground"))

    fig.text(0.01, 0.01, f"{site.name} · {len(grid):,} {'hex' if site.grid_type == 'hex' else 'square'} cells ({site.cell_size:.0f} m) · "
             "grey = water · black lines = major roads · dashed = rail · "
             "heights carry ±2–3 m error: treat depths as indicative", fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(out, dpi=150, facecolor=SURFACE)
    plt.close(fig)


USE_COLOURS = {"water": "#2a78d6", "landscape": "#1baf7a"}  # categorical slots 1 and 3
# Buildings: one hue (slot 2, orange), light to dark by height.
ORANGES = LinearSegmentedColormap.from_list("oranges", ["#fbd5c4", "#f19a74", "#eb6834", "#b9481c", "#7a2c0e"])
KIND_STYLE = {"core": "-", "green": "--", "water": ":"}


def _design_panel(ax, suit, design, ctx, bounds, title, note):
    water = suit[suit.water]
    water.plot(ax=ax, color=WATER, linewidth=0)
    suit[~suit.water & (suit.state == "forbidden")].plot(ax=ax, color=WATER, linewidth=0)
    suit[~suit.water & (suit.state == "retained")].plot(ax=ax, color=PAPER, linewidth=0)
    for u, c in USE_COLOURS.items():
        part = design[design["use"] == u]
        if len(part):
            part.plot(ax=ax, color=c, linewidth=0)
    b = design[design["use"] == "building"]
    if len(b):
        b.plot(ax=ax, column="levels", cmap=ORANGES, vmin=1, vmax=15, linewidth=0)
    for a in design.attrs.get("attractors", []):
        ax.add_patch(plt.Circle((a.x, a.y), a.radius, fill=False, color=INK, linewidth=0.7,
                                linestyle=KIND_STYLE[a.kind], alpha=0.7))
    _overlay(ax, ctx)
    xmin, ymin, xmax, ymax = bounds
    ax.set_xlim(xmin, xmax)
    ax.set_ylim(ymin, ymax)
    ax.set_aspect("equal")
    ax.set_axis_off()
    lines = note.count("\n") + 1
    ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="bold", pad=6 + 11 * lines)
    ax.text(0, 1.01, note, transform=ax.transAxes, fontsize=7.5, color=INK_2, va="bottom",
            linespacing=1.4)


def generation_sheet(site: Site, suit, designs, labels, notes, out, title):
    """A generation as a sheet of individuals, cropped to the design ground."""
    ctx = context(site)
    pad = 60
    allb = np.array([d.total_bounds for d in designs])
    bounds = (allb[:, 0].min() - pad, allb[:, 1].min() - pad, allb[:, 2].max() + pad, allb[:, 3].max() + pad)
    aspect = (bounds[3] - bounds[1]) / (bounds[2] - bounds[0])
    ncol = 5
    nrow = int(np.ceil(len(designs) / ncol))
    w = 3.6
    note_h = 0.25 * max(n.count("\n") + 1 for n in notes)  # inches of text above each map
    fig, axes = plt.subplots(nrow, ncol, figsize=(ncol * w, nrow * (w * aspect + 0.6 + note_h) + 1.2),
                             facecolor=SURFACE, squeeze=False)
    for ax in axes.flat[len(designs):]:
        ax.set_axis_off()
    for ax, d, lab, note in zip(axes.flat, designs, labels, notes):
        _design_panel(ax, suit, d, ctx, bounds, lab, note)

    sm = plt.cm.ScalarMappable(cmap=ORANGES, norm=plt.Normalize(1, 15))
    cax = fig.add_axes([0.25, 0.035, 0.2, 0.012])
    cb = fig.colorbar(sm, cax=cax, orientation="horizontal")
    cb.outline.set_visible(False)
    cb.ax.tick_params(labelsize=7.5, colors=MUTED, length=0)
    cb.set_label("building levels", fontsize=8, color=MUTED)
    handles = [Patch(color=USE_COLOURS["water"], label="water and wetland"),
               Patch(color=USE_COLOURS["landscape"], label="landscape"),
               Patch(facecolor=WATER, label="existing water and protected edge"),
               plt.Line2D([], [], color=INK, linestyle="-", label="core attractor"),
               plt.Line2D([], [], color=INK, linestyle="--", label="green attractor"),
               plt.Line2D([], [], color=INK, linestyle=":", label="water attractor")]
    fig.legend(handles=handles, loc="lower right", ncol=3, fontsize=8, frameon=False,
               labelcolor=INK, bbox_to_anchor=(0.98, 0.005))
    fig.suptitle(title, x=0.01, ha="left", fontsize=13, fontweight="bold", color=INK)
    fig.tight_layout(rect=(0, 0.07, 1, 0.97))
    fig.savefig(out, dpi=140, facecolor=SURFACE)
    plt.close(fig)


def _plain(ax):
    ax.set_facecolor(SURFACE)
    ax.grid(color="#e1e0d9", linewidth=0.6)
    ax.set_axisbelow(True)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=8, length=0)


def tradeoffs(site: Site, rows, labels, target_ha, out, title, highlight=None):
    """Parallel coordinates: one line per design across floor area and the five scores.
    Every score axis has 'better' at the top. Blue = Pareto front of designs on brief."""
    from pc.fitness import SCORES, TARGET_TOLERANCE

    keys = ["floor_area_ha"] + list(SCORES)
    names = ["floor area"] + [SCORES[k][0] for k in SCORES]
    fmts = ["{:.0f} ha"] + [SCORES[k][1] for k in SCORES]
    up = [True] + [SCORES[k][2] for k in SCORES]
    vals = np.array([[r[k] for k in keys] for r in rows], dtype=float)
    lo, hi = vals.min(axis=0), vals.max(axis=0)
    span = np.where(hi > lo, hi - lo, 1)
    norm = (vals - lo) / span
    norm[:, ~np.array(up)] = 1 - norm[:, ~np.array(up)]
    x = np.arange(len(keys))

    on_brief = np.array([r["gap"] <= TARGET_TOLERANCE for r in rows])
    front = np.array([r["rank"] == 1 for r in rows])
    highlight = set(highlight or [])

    fig, ax = plt.subplots(figsize=(15, 6.5), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_yticks([])
    ax.set_xticks([])
    for k in x:
        ax.axvline(k, color="#e1e0d9", linewidth=1, zorder=0)
    # Target band on the floor-area axis.
    t_lo, t_hi = [(v - lo[0]) / span[0] for v in (target_ha * (1 - TARGET_TOLERANCE), target_ha * (1 + TARGET_TOLERANCE))]
    ax.fill_between([-0.06, 0.06], max(t_lo, -0.02), min(t_hi, 1.02), color="#2a78d6", alpha=0.15, linewidth=0)
    ax.text(0.08, (max(t_lo, 0) + min(t_hi, 1)) / 2, "brief", fontsize=7.5, color="#1c5cab", va="center")

    for i in np.flatnonzero(~on_brief):
        ax.plot(x, norm[i], color=MUTED, alpha=0.12, linewidth=0.8)
    for i in np.flatnonzero(on_brief & ~front):
        ax.plot(x, norm[i], color=MUTED, alpha=0.5, linewidth=1)
    for i in np.flatnonzero(front):
        strong = labels[i] in highlight
        ax.plot(x, norm[i], color="#2a78d6", linewidth=2.2 if strong else 1.2, alpha=1 if strong else 0.55,
                zorder=3)
        if strong:
            ax.annotate(labels[i], (x[-1], norm[i, -1]), xytext=(6, 0), textcoords="offset points",
                        fontsize=7.5, color=INK, va="center")

    for k in x:
        best, worst = (hi[k], lo[k]) if up[k] else (lo[k], hi[k])
        ax.text(k, 1.11, names[k], ha="center", fontsize=9.5, color=INK, fontweight="bold")
        ax.text(k, -0.07, fmts[k].format(worst), ha="center", fontsize=8, color=MUTED)
        ax.text(k, 1.04, fmts[k].format(best), ha="center", fontsize=8, color=MUTED)
    ax.set_xlim(-0.2, len(keys) - 0.5)
    ax.set_ylim(-0.12, 1.17)
    handles = [plt.Line2D([], [], color="#2a78d6", linewidth=2, label="Pareto front (on brief)"),
               plt.Line2D([], [], color=MUTED, alpha=0.5, linewidth=1, label="on brief, behind the front"),
               plt.Line2D([], [], color=MUTED, alpha=0.2, linewidth=1, label="off brief")]
    ax.legend(handles=handles, loc="upper left", bbox_to_anchor=(0, -0.1), ncol=3, fontsize=8,
              frameon=False, labelcolor=INK)
    fig.suptitle(f"{site.name} · {title} · trade-offs", x=0.01, ha="left", fontsize=13,
                 fontweight="bold", color=INK)
    fig.text(0.01, 0.01, "Each line is one design. Score axes: better at the top. Brief = within "
             f"{TARGET_TOLERANCE:.0%} of the floor-area target. Scores are indicative (see pc/fitness.py).",
             fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.04, 1, 0.95))
    fig.savefig(out, dpi=140, facecolor=SURFACE)
    plt.close(fig)


def evolution(site: Site, run, target_ha, out, title):
    """Per generation: designs on brief, and the best of them on each score."""
    from pc.fitness import SCORES

    hist = run.history
    gens = [h["generation"] for h in hist]
    panels = [("on_brief", "designs on brief (of the population)", "{:.0f}")] + \
             [(k, f"best {SCORES[k][0]}" + (" (lower is better)" if not SCORES[k][2] else ""), SCORES[k][1])
              for k in SCORES]
    fig, axes = plt.subplots(2, 3, figsize=(15, 7.5), facecolor=SURFACE)
    for ax, (key, t, fmt) in zip(axes.flat, panels):
        _plain(ax)
        y = np.array([np.nan if h[key] is None else h[key] for h in hist], dtype=float)
        ax.plot(gens, y, color="#2a78d6", linewidth=2)
        ok = ~np.isnan(y)
        if ok.any():
            first, last = np.flatnonzero(ok)[0], np.flatnonzero(ok)[-1]
            ax.annotate(fmt.format(y[last]), (gens[last], y[last]), xytext=(4, 0),
                        textcoords="offset points", fontsize=8.5, color=INK, va="center")
            ax.annotate(fmt.format(y[first]), (gens[first], y[first]), xytext=(-4, 0),
                        textcoords="offset points", fontsize=8, color=MUTED, va="center", ha="right")
        ax.set_title(t, loc="left", fontsize=9.5, color=INK_2)
        ax.set_xlabel("generation", fontsize=8, color=MUTED)
        if "%" in fmt:
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.0%}"))
        ax.margins(x=0.08)
    fig.suptitle(f"{site.name} · {title}", x=0.01, ha="left", fontsize=13, fontweight="bold", color=INK)
    fig.text(0.01, 0.01, f"Best values among designs on brief (floor area within 10% of {target_ha:.0f} ha). "
             "Scores are indicative (see pc/fitness.py).", fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95))
    fig.savefig(out, dpi=140, facecolor=SURFACE)
    plt.close(fig)


def rules_map(site: Site, g, out):
    """The McHarg overlay result: what the land allows."""
    ctx = context(site)
    land, water = g[~g.water], g[g.water]
    design = land[land.state.isin(["constrained", "open"])]
    ha = lambda s: land.loc[land.state == s].area.sum() / 1e4

    fig = plt.figure(figsize=(18, 10), facecolor=SURFACE)
    gs = fig.add_gridspec(2, 2, width_ratios=[1.6, 1], hspace=0.25, wspace=0.08)
    ax = fig.add_subplot(gs[:, 0])
    water.plot(ax=ax, color=WATER, linewidth=0)
    for s, c in STATE_COLOURS.items():
        part = land[land.state == s]
        if len(part):
            part.plot(ax=ax, color=c, edgecolor=SURFACE, linewidth=0.3)
    _overlay(ax, ctx, labels=True)
    _frame(ax, g, "What the land allows", "McHarg overlay: rules.yaml applied to the layers")
    labels = {"forbidden": "Forbidden: never built on", "constrained": "Constrained: buildable with limits",
              "open": "Open: the genes decide", "retained": "Retained: kept as context"}
    ax.legend(handles=[Patch(facecolor=STATE_COLOURS[s], edgecolor=MUTED if s == "retained" else "none",
                             label=f"{labels[s]}  ·  {ha(s):.0f} ha")
                       for s in ["forbidden", "constrained", "open", "retained"]],
              loc="lower right", fontsize=9, facecolor=SURFACE, edgecolor="none", labelcolor=INK)

    panels = [("max_levels", "Height cap", "levels allowed on design ground", 0, 15, "{:.0f}"),
              ("min_permeable", "Permeable ground", "minimum unsealed share on design ground", 0, 1, "{:.0%}")]
    for k, (col, title, note, vmin, vmax, fmt) in enumerate(panels):
        a = fig.add_subplot(gs[k, 1])
        water.plot(ax=a, color=WATER, linewidth=0)
        land.plot(ax=a, color=PAPER, linewidth=0)
        _sequential(a, fig, design, col, vmin, vmax, fmt)
        _overlay(a, ctx)
        _frame(a, g, title, note)

    fig.text(0.01, 0.01, f"{site.name} · design ground {design.area.sum() / 1e4:.0f} ha in "
             f"{len(design):,} cells · edit sites/{site.id}/rules.yaml and run `pc rules {site.id}`",
             fontsize=8, color=MUTED)
    fig.savefig(out, dpi=150, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)
