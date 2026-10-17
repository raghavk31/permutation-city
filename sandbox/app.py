"""Permutation City: the designer's sandbox.  Run: uv run pc app

Tabs:
    Site      layers and rules; edit rules.yaml and apply
    Evolve    brief, storm, climate shock, locks; run generations
    Families  the front, one design per family; view in 3D, lock, send to breeding
    Breed     pick two parents, get children, keep breeding (Biomorphs mode)
"""

import dataclasses
import io
import re
import sys
import time
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pydeck as pdk
import streamlit as st
from matplotlib.collections import PolyCollection
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pc import evolve, export, fitness, genome, maps, rules  # noqa: E402
from pc.rng import Rng  # noqa: E402
from pc.site import SITES, load  # noqa: E402

st.set_page_config(page_title="Permutation City", page_icon="🧬", layout="wide")

WATER_C, GREEN_C, EDGE_C, PAPER_C = "#2a78d6", "#1baf7a", "#e1e0d9", "#f0efec"
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def hex_to_rgb(h, a=255):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)] + [a]


# --- loading (cached per site) ------------------------------------------------------

@st.cache_resource(show_spinner="Loading site ...")
def load_ground(site_id: str, version: int):
    site = load(site_id)
    suit = gpd.read_file(site.layers / "suitability.gpkg", layer="cells")
    ground = export.site_ground(site, suit)[0]  # same inputs as the browser engine
    # Polygons for fast thumbnails: design cells, and the background within the frame.
    pad = 60
    xmin, ymin, xmax, ymax = ground.cells.centroid.total_bounds
    frame = (xmin - pad, ymin - pad, xmax + pad, ymax + pad)
    bg = suit.cx[frame[0]:frame[2], frame[1]:frame[3]]
    bg = bg[bg["water"] | (bg["state"] == "forbidden") | (bg["state"] == "retained")]
    coords = lambda g: [np.asarray(p.exterior.coords) for p in g.geometry]
    thumbs = {
        "frame": frame,
        "cells": coords(ground.cells),
        "edge": coords(bg[bg["water"] | (bg["state"] == "forbidden")]),
        "retained": coords(bg[~bg["water"] & (bg["state"] == "retained")]),
    }
    return site, suit, ground, thumbs


def site_ids():
    return sorted(p.parent.name for p in SITES.glob("*/site.yaml")
                  if (p.parent.parent.parent / "data" / p.parent.name / "layers" / "suitability.gpkg").exists())


# --- drawing ------------------------------------------------------------------------

def cell_colours(d: genome.Design):
    cols = []
    for u, lv in zip(d.use, d.levels):
        if u == "water":
            cols.append(WATER_C)
        elif u == "landscape":
            cols.append(GREEN_C)
        else:
            cols.append(matplotlib.colors.to_hex(maps.ORANGES(min(lv, 15) / 15)))
    return cols


def thumbnail(d: genome.Design, thumbs) -> bytes:
    fig, ax = plt.subplots(figsize=(2.6, 2.6 * (thumbs["frame"][3] - thumbs["frame"][1])
                                    / (thumbs["frame"][2] - thumbs["frame"][0])), dpi=110)
    ax.add_collection(PolyCollection(thumbs["retained"], facecolors=PAPER_C, edgecolors="none"))
    ax.add_collection(PolyCollection(thumbs["edge"], facecolors=EDGE_C, edgecolors="none"))
    ax.add_collection(PolyCollection(thumbs["cells"], facecolors=cell_colours(d), edgecolors="none"))
    f = thumbs["frame"]
    ax.set_xlim(f[0], f[2])
    ax.set_ylim(f[1], f[3])
    ax.set_aspect("equal")
    ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="#fcfcfb")
    plt.close(fig)
    return buf.getvalue()


def deck(d: genome.Design, ground):
    f = genome.to_frame(d, ground).to_crs(4326)
    f["colour"] = [hex_to_rgb(c, 230) for c in cell_colours(d)]
    f["height"] = np.where(f["use"] == "building", f["levels"] * fitness.STOREY_M, 0.5)
    f["label"] = [f"{u}" + (f", {lv} storeys" if u == "building" else "") for u, lv in zip(f["use"], f["levels"])]
    centre = f.union_all().centroid
    layer = pdk.Layer("GeoJsonLayer", data=f.__geo_interface__, extruded=True, wireframe=False,
                      get_fill_color="properties.colour", get_elevation="properties.height",
                      pickable=True, auto_highlight=True)
    view = pdk.ViewState(latitude=centre.y, longitude=centre.x, zoom=14.2, pitch=50, bearing=-20)
    return pdk.Deck(layers=[layer], initial_view_state=view, map_provider="carto", map_style="light",
                    tooltip={"text": "{label}"})


def scores_text(s, floor_ha):
    return (f"**{floor_ha:.0f} ha** · storage {s['storage']:.0%} · +{s['heat']:.1f}°C  \n"
            f"{s['carbon']:.0f} kg/m² · daylight {s['daylight']:.0%} · human {s['human']:.0%}")


# --- state --------------------------------------------------------------------------

ss = st.session_state
ss.setdefault("version", 0)
ss.setdefault("pen", [])          # breeding pen: [{"name", "genome"}]
ss.setdefault("children", [])     # last brood
ss.setdefault("brood", 0)
ss.setdefault("locks", None)      # use code per cell, or None
ss.setdefault("lock_note", [])
ss.setdefault("run", None)
ss.setdefault("selected", None)   # (name, genome) of the design in the 3D view

# --- sidebar ------------------------------------------------------------------------

def draw_map(centre, zoom, overlays=()):
    """A map to draw a polygon or rectangle on; returns the last shape drawn (GeoJSON) or None."""
    import folium
    from folium import plugins
    from streamlit_folium import st_folium

    m = folium.Map(location=centre, zoom_start=zoom, tiles="CartoDB positron", control_scale=True)
    plugins.Geocoder(collapsed=False, add_marker=False).add_to(m)
    for gj, colour in overlays:
        folium.GeoJson(gj, style_function=lambda _, c=colour: {"color": c, "weight": 2, "fillOpacity": 0.08}).add_to(m)
    plugins.Draw(export=False, draw_options={"polyline": False, "circle": False, "marker": False,
                                             "circlemarker": False, "polygon": True, "rectangle": True},
                 edit_options={"edit": False}).add_to(m)
    out = st_folium(m, height=520, use_container_width=True, returned_objects=["all_drawings"])
    shapes = [f for f in (out or {}).get("all_drawings") or [] if f["geometry"]["type"] == "Polygon"]
    return shapes[-1] if shapes else None


def shape_area_ha(feature) -> float:
    from shapely.geometry import shape

    from pc.site import utm_crs

    g = shape(feature["geometry"])
    return gpd.GeoSeries([g], crs=4326).to_crs(utm_crs(g.bounds)).area.iloc[0] / 1e4


def new_site_page():
    """Draw a site boundary, name it, fetch its data and build it."""
    import shutil

    import yaml

    from pc import fetch, pipeline
    from pc.site import ROOT

    st.header("New site")
    st.caption("Search for a place, then draw the site with the polygon or rectangle tool (left of the map). "
               "The analysis runs on the polygon plus a 250 m context margin, then crops to the polygon.")
    feature = draw_map([19.07, 72.88], 11)
    if feature:
        st.success(f"Drawn: {shape_area_ha(feature):.0f} ha")
    c1, c2, c3, c4, c5 = st.columns([2, 3, 1, 1, 1])
    sid = c1.text_input("Site id (folder name)", placeholder="pune-riverfront")
    name = c2.text_input("Name", placeholder="Pune: Mula-Mutha riverfront")
    gtype = c3.selectbox("Grid", ["hex", "quad"], help="Hexes (6 neighbours) or squares (4)")
    size = c4.number_input("Cell size (m)", 10, 100, 20, 5,
                           help="Hex: centre to corner. Square: side.")
    coastal = c5.checkbox("Coastal", help="Adds sea levels to check and edit in site.yaml")
    valid = bool(feature and re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", sid or "") and name)
    if st.button("Create site", type="primary", disabled=not valid):
        folder = SITES / sid
        if folder.exists():
            st.error(f"sites/{sid} already exists")
        else:
            folder.mkdir(parents=True)
            gpd.GeoDataFrame.from_features([feature], crs=4326).to_file(folder / "boundary.geojson",
                                                                        driver="GeoJSON")
            cfg = {"name": name, "boundary": "boundary.geojson", "context_m": 250,
                   "grid": {"type": gtype, "size": size},
                   "design_storm_mm": 100, "target_far": 1.5}
            if coastal:
                cfg["sea_levels"] = {"high_tide": 1.5, "surge_today": 2.5, "surge_2050": 2.8}
            (folder / "site.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
            shutil.copy(ROOT / "rules.template.yaml", folder / "rules.yaml")
            st.success(f"Created sites/{sid}. Fetch its data below.")
    if not valid:
        st.caption("Draw a shape, and give an id (lowercase letters, digits, dashes) and a name.")

    unbuilt = sorted(p.parent.name for p in SITES.glob("*/site.yaml") if p.parent.name not in site_ids())
    if unbuilt:
        st.subheader("Sites waiting to be built")
        pick = st.selectbox("Site", unbuilt)
        s = load(pick)
        st.caption(f"{s.name} · box {s.bbox}" + (" · coastal: check sea_levels in site.yaml" if s.sea_levels else ""))
        if st.button("Fetch data and build", type="primary"):
            with st.status("Fetching (1-5 minutes; Overture can be slow) ...", expanded=True) as status:
                for step_name, step in fetch.STEPS.items():
                    status.write(f"fetching {step_name} ...")
                    step(s)
                status.update(label="Building layers, rules and maps ...")
                pipeline.build(s, log=lambda t: status.code(t))
                status.update(label="Done. Switch to Design mode and pick the site.", state="complete")
            st.cache_resource.clear()


ids = site_ids()
with st.sidebar:
    st.title("Permutation City")
    st.caption("Generative design with nature")
    mode = st.radio("Mode", ["Design", "New site"], horizontal=True, label_visibility="collapsed")
if mode == "New site" or not ids:
    if not ids:
        st.info("No built sites yet: draw one.")
    new_site_page()
    st.stop()
with st.sidebar:
    site_id = st.selectbox("Site", ids)
    if ss.get("site_id") != site_id:  # a new site resets everything site-specific
        ss.update(site_id=site_id, run=None, pen=[], children=[], locks=None, lock_note=[], selected=None)
    site0, suit, ground, thumbs = load_ground(site_id, ss.version)

    st.subheader("Brief")
    by_area = st.toggle("Target as floor area (ha)", value=site0.target_floor_area_ha is not None)
    if by_area:
        target_ha = st.number_input("Floor-area target (ha)", 10.0, 5000.0,
                                    float(site0.target_floor_area_ha or site0.target_far * ground.area.sum() / 1e4), 10.0)
        site = dataclasses.replace(site0, target_floor_area_ha=target_ha)
    else:
        far = st.number_input("Target FAR over design ground", 0.2, 8.0, float(site0.target_far), 0.1)
        site = dataclasses.replace(site0, target_far=far, target_floor_area_ha=None)
    storm = st.number_input("Design storm (mm)", 20.0, 1000.0, float(site0.design_storm_mm), 10.0)
    site = dataclasses.replace(site, design_storm_mm=storm)
    target = fitness.floor_area_target(site, ground) / 1e4
    st.caption(f"Design ground {ground.area.sum() / 1e4:.0f} ha · target {target:.0f} ha ±10%. "
               "Changes here apply to this session; edit site.yaml to keep them.")

    if ss.locks is not None:
        st.subheader("Locks")
        st.caption("; ".join(ss.lock_note))
        if st.button("Clear locks"):
            ss.locks, ss.lock_note = None, []
            st.rerun()

tab_site, tab_evolve, tab_fam, tab_breed = st.tabs(["Site", "Evolve", "Families", "Breed"])

# --- Site ---------------------------------------------------------------------------

with tab_site:
    st.header(site.name)
    land = suit[~suit.water]
    ha = lambda m: land.loc[m].area.sum() / 1e4
    c = st.columns(4)
    for col, s in zip(c, rules.STATES):
        col.metric(s.capitalize(), f"{ha(land.state == s):.0f} ha")
    left, right = st.columns([3, 2])
    with left:
        for img, cap in [("02-rules.png", "What the land allows"), ("01-layers.png", "McHarg layers")]:
            p = site.maps / img
            if p.exists():
                st.image(str(p), caption=cap)
    with st.expander("Design area: draw the ground to design"):
        st.caption("Cells outside the design area become 'retained' (kept as context) through the "
                   "rules, except industrial land. Saving rebuilds the layers (~1 minute).")
        bnd = (gpd.read_file(site.boundary).__geo_interface__ if site.boundary
               else gpd.GeoSeries([box(*site.bbox)], crs=4326).__geo_interface__)
        overlays = [(bnd, "#52514e")]
        if site.design_area and site.design_area.exists():
            overlays.append((gpd.read_file(site.design_area).__geo_interface__, "#eb6834"))
        cy, cx = (site.bbox[1] + site.bbox[3]) / 2, (site.bbox[0] + site.bbox[2]) / 2
        area_shape = draw_map([cy, cx], 15, overlays)
        d1, d2 = st.columns(2)
        if area_shape and d1.button(f"Save design area ({shape_area_ha(area_shape):.0f} ha) and rebuild",
                                    type="primary"):
            from pc import pipeline
            from pc.site import set_value

            gpd.GeoDataFrame.from_features([area_shape], crs=4326).to_file(
                site.folder / "design_area.geojson", driver="GeoJSON")
            set_value(site.id, "design_area", "design_area.geojson")
            with st.spinner("Rebuilding layers, rules and maps ..."):
                pipeline.build(load(site.id), log=lambda t: None)
            ss.version += 1
            ss.update(run=None, locks=None, lock_note=[], selected=None)
            st.rerun()
        if site.design_area and d2.button("Remove design area and rebuild"):
            from pc import pipeline
            from pc.site import set_value

            set_value(site.id, "design_area", "null")
            with st.spinner("Rebuilding layers, rules and maps ..."):
                pipeline.build(load(site.id), log=lambda t: None)
            ss.version += 1
            ss.update(run=None, locks=None, lock_note=[], selected=None)
            st.rerun()

    with right:
        st.subheader("Rules")
        st.caption("Each `when` tests the layer columns. Apply re-runs the overlay (~20 s) and resets runs.")
        text = st.text_area("rules.yaml", site.rules.read_text(encoding="utf-8"), height=520,
                            label_visibility="collapsed")
        if st.button("Apply rules", type="primary"):
            import yaml
            try:
                parsed = yaml.safe_load(text)
                grid = gpd.read_file(site.layers / "grid.gpkg", layer="cells")
                g, skipped = rules.apply(grid, parsed)
            except Exception as e:  # show the designer what went wrong, keep the old rules
                st.error(f"Rules not applied: {e}")
            else:
                site.rules.write_text(text, encoding="utf-8")
                g.to_file(site.layers / "suitability.gpkg", layer="cells", driver="GPKG")
                with st.spinner("Redrawing the rules map ..."):
                    maps.rules_map(site, g, site.maps / "02-rules.png")
                if skipped:
                    st.warning("Skipped (layer missing): " + ", ".join(skipped))
                ss.version += 1
                ss.update(run=None, locks=None, lock_note=[], selected=None)
                st.rerun()

# --- Evolve -------------------------------------------------------------------------

with tab_evolve:
    st.header("Evolve")
    c1, c2, c3, c4 = st.columns(4)
    gens = c1.slider("Generations", 5, 100, 30, 5)
    pop = c2.slider("Population", 20, 120, 60, 10)
    seed = c3.number_input("Run (Seq)", 1, 999, 1)
    use_pen = c4.checkbox(f"Start from breeding pen ({len(ss.pen)})", value=False, disabled=not ss.pen)
    s1, s2 = st.columns(2)
    do_shock = s1.checkbox("Climate shock during the run")
    shock = None
    if do_shock:
        shock_gen = s1.slider("Shock at generation", 1, gens, max(1, gens // 2))
        shock_x = s2.slider("Design storm becomes ×", 1.1, 2.5, 1.3, 0.1,
                            help="A heavier storm, e.g. ×1.3 for 2050-type monsoon extremes")
        shock = (shock_gen, shock_x)
    if ss.locks is not None:
        st.info("Locked: " + "; ".join(ss.lock_note))

    if st.button("Run evolution", type="primary"):
        bar = st.progress(0.0, text="Generation 0")
        t0 = time.time()
        run = evolve.evolve(site, ground, generations=gens, pop=pop, seed=int(seed), log=None,
                            locked=ss.locks, shock=shock,
                            start=[p["genome"] for p in ss.pen] if use_pen else None,
                            progress=lambda g, r: bar.progress(g / gens, text=f"Generation {g} of {gens}"))
        bar.empty()
        ss.run = {"run": run, "shock": shock, "seed": int(seed), "secs": time.time() - t0}
        ss.selected = None

    if ss.run:
        run = ss.run["run"]
        st.success(f"Seq{ss.run['seed']}: {len(run.everyone):,} designs grown in {ss.run['secs']:.0f} s. "
                   "See Families.")
        hist = pd.DataFrame(run.history).set_index("generation")
        st.caption("Best among designs on brief, by generation"
                   + (f" · shock at generation {ss.run['shock'][0]} (storm ×{ss.run['shock'][1]:.1f})"
                      if ss.run["shock"] else ""))
        cols = st.columns(3)
        charts = [("on_brief", "designs on brief")] + [(k, fitness.SCORES[k][0]) for k in fitness.SCORES]
        for k, (key, label) in enumerate(charts):
            with cols[k % 3]:
                st.markdown(f"**{label}**")
                st.line_chart(hist[[key]], height=160, color=WATER_C)

# --- Families -----------------------------------------------------------------------

def gallery(items, key, actions):
    """items: [(title, design, floor_ha)]; actions: [(label, fn(item))]."""
    cols = st.columns(5)
    for k, (title, d, fl) in enumerate(items):
        with cols[k % 5]:
            st.image(thumbnail(d, thumbs), width="stretch")
            st.markdown(f"**{title}**")
            st.caption(scores_text(d.scores, fl))
            for label, fn in actions:
                if st.button(label, key=f"{key}-{label}-{k}"):
                    fn(title, d)


def select(title, d):
    ss.selected = (title, d)


def to_pen(title, d):
    name = re.search(r"[GBR][\d.]+", title).group(0)  # "A · G24.44 (12)" → "G24.44"
    if all(p["name"] != name for p in ss.pen):
        ss.pen.append({"name": name, "genome": d.genome.copy()})
        st.toast(f"{name} added to the breeding pen")


with tab_fam:
    if not ss.run:
        st.info("Run an evolution first (Evolve tab).")
    else:
        run = ss.run["run"]
        front = [i for i in run.pop if i.rank == 1]
        order = sorted(range(len(front)), key=lambda k: -front[k].crowd)
        fams = fitness.families(np.stack([genome.use_codes(i.design) for i in front]), order)
        st.header(f"{len(front)} designs on the front, in {len(fams)} families")
        st.caption("One design per family. View one in 3D, lock parts of it for the next run, "
                   "or send it to the breeding pen.")
        items = [(f"{LETTERS[n % 26]} · {front[f[0]].name} ({len(f)})", front[f[0]].design,
                  front[f[0]].design.floor_area.sum() / 1e4) for n, f in enumerate(fams)]
        gallery(items, "fam", [("View in 3D", select), ("To breeding pen", to_pen)])

    if ss.selected:
        title, d = ss.selected
        st.divider()
        st.subheader(f"{title} in 3D")
        st.markdown(scores_text(d.scores, d.floor_area.sum() / 1e4))
        st.pydeck_chart(deck(d, ground), height=560)
        st.caption("Orange = buildings (darker and taller = more storeys) · aqua = landscape · blue = water. "
                   "Hover for cell details; drag to orbit (right-click or ctrl).")
        b1, b2, b3, b4 = st.columns(4)
        codes = genome.use_codes(d)

        def lock(use_name):
            code = genome.USES.index(use_name) + 1
            locks = np.zeros(len(codes), dtype=np.int8) if ss.locks is None else ss.locks.copy()
            locks[codes == code] = code
            ss.locks = locks
            ss.lock_note.append(f"{use_name} of {title}")
            st.toast(f"Locked the {use_name} of {title}. The next run evolves around it.")

        if b1.button("Lock its water"):
            lock("water")
        if b2.button("Lock its landscape"):
            lock("landscape")
        if b3.button("Lock its buildings"):
            lock("building")
        design_name = re.search(r"[GBR][\d.]+", title).group(0)
        b4.download_button("Download GeoJSON", genome.to_frame(d, ground).to_crs(4326).to_json(),
                           file_name=f"{site.id}-{design_name}.geojson", mime="application/geo+json")

# --- Breed --------------------------------------------------------------------------

with tab_breed:
    st.header("Breeding pen")
    st.caption("Biomorphs mode: pick two parents, breed six children, keep the ones you like, repeat. "
               "Start a new evolution from the pen in the Evolve tab.")
    if not ss.pen:
        st.info("Empty. Send designs here from Families, or start with random ones.")
    if st.button("Add 4 random designs"):
        rng = Rng(int(time.time() * 1000) % 2**31)
        for _ in range(4):
            ss.brood += 1
            ss.pen.append({"name": f"R{ss.brood}", "genome": genome.random_genome(rng)})
        st.rerun()

    if ss.pen:
        grown = []
        for p in ss.pen:
            d = genome.grow(p["genome"], ground, ss.locks)
            fitness.evaluate(d, ground, site)
            grown.append((p["name"], d, d.floor_area.sum() / 1e4))
        names = [p["name"] for p in ss.pen]
        c1, c2, c3 = st.columns([2, 2, 1])
        pa = c1.selectbox("Parent A", names, index=0)
        pb = c2.selectbox("Parent B", names, index=min(1, len(names) - 1))
        if c3.button("Breed 6", type="primary"):
            ga = next(p["genome"] for p in ss.pen if p["name"] == pa)
            gb = next(p["genome"] for p in ss.pen if p["name"] == pb)
            ss.brood += 1
            kids = evolve.breed(ga, gb, Rng(int(time.time() * 1000) % 2**31), 6)
            ss.children = [{"name": f"B{ss.brood}.{k + 1}", "genome": g, "parents": (pa, pb)}
                           for k, g in enumerate(kids)]
        gallery(grown, "pen", [("View in 3D", select)])
        if st.button("Empty the pen"):
            ss.pen, ss.children = [], []
            st.rerun()

    if ss.children:
        st.divider()
        st.subheader(f"Children of {ss.children[0]['parents'][0]} × {ss.children[0]['parents'][1]}")
        kids = []
        for c in ss.children:
            d = genome.grow(c["genome"], ground, ss.locks)
            fitness.evaluate(d, ground, site)
            kids.append((c["name"], d, d.floor_area.sum() / 1e4))
        gallery(kids, "kid", [("Keep", to_pen), ("View in 3D", select)])
