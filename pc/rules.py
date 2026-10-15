"""Apply a site's McHarg rules (sites/<id>/rules.yaml) to its layers.

Every cell gets:
    state          forbidden / retained / constrained / open
    reasons        the rules that touched it
    max_levels     height cap (levels)
    min_permeable  share of ground that must stay unsealed
    uses           allowed uses, comma-separated
    raised_ground  ground floor must sit above flood level
    remediate      clean-up before building

A rule that refers to a layer the site doesn't have (e.g. sea flooding on an inland
site) is skipped and reported.
"""

import geopandas as gpd
import pandas as pd
import yaml

STATES = ["forbidden", "retained", "constrained", "open"]


def load_rules(path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _match(g, rule, skipped):
    try:
        return g.eval(rule["when"]).astype(bool)
    except (pd.errors.UndefinedVariableError, NameError, KeyError):
        skipped.append(rule["name"])
        return pd.Series(False, index=g.index)


def apply(grid: gpd.GeoDataFrame, rules: dict) -> tuple[gpd.GeoDataFrame, list[str]]:
    g = grid.copy()
    d = rules["defaults"]
    skipped = []
    g["state"] = "open"
    g["reasons"] = ""
    g["max_levels"] = d["max_levels"]
    g["min_permeable"] = d["min_permeable"]
    g["uses"] = ",".join(d["uses"])
    g["raised_ground"] = False
    g["remediate"] = False

    def note(mask, name):
        g.loc[mask, "reasons"] = (g.loc[mask, "reasons"] + "; " + name).str.lstrip("; ")

    # Constrained first; retained and forbidden then override the state.
    for rule in rules.get("constrained") or []:
        m = _match(g, rule, skipped)
        g.loc[m, "state"] = "constrained"
        note(m, rule["name"])
        lim = rule.get("limits", {})
        if "max_levels" in lim:
            g.loc[m, "max_levels"] = g.loc[m, "max_levels"].clip(upper=lim["max_levels"])
        if "min_permeable" in lim:
            g.loc[m, "min_permeable"] = g.loc[m, "min_permeable"].clip(lower=lim["min_permeable"])
        if "uses" in lim:
            keep = set(lim["uses"])
            g.loc[m, "uses"] = g.loc[m, "uses"].map(
                lambda u: ",".join(x for x in u.split(",") if x in keep))
        for flag in ("raised_ground", "remediate"):
            if lim.get(flag):
                g.loc[m, flag] = True

    for state in ("retained", "forbidden"):
        for rule in rules.get(state) or []:
            m = _match(g, rule, skipped)
            g.loc[m, "state"] = state
            note(m, rule["name"])

    # Forbidden and retained cells are fixed: nothing is built there.
    fixed = g["state"].isin(["forbidden", "retained"])
    g.loc[fixed, ["max_levels", "min_permeable"]] = [0, 1.0]
    g.loc[g["state"] == "forbidden", "uses"] = "water,wetland,landscape"
    g.loc[g["state"] == "retained", "uses"] = ""
    return g, skipped


def summary(g, rules, skipped) -> str:
    land = g[~g["water"]]
    ha = lambda m: land.loc[m].area.sum() / 1e4
    lines = [f"  {s:12s} {ha(land.state == s):5.0f} ha" for s in STATES]
    lines.append("  rule hits (ha):")
    for kind in ("forbidden", "retained", "constrained"):
        for r in rules.get(kind) or []:
            hit = "skipped (layer missing)" if r["name"] in skipped else f"{ha(_match(land, r, [])):5.0f}"
            lines.append(f"    {kind[:4]}  {r['name']:26s} {hit}")
    design = land[land.state.isin(["constrained", "open"])]
    lines.append(f"  design ground: {design.area.sum() / 1e4:.0f} ha in {len(design):,} cells")
    return "\n".join(lines)
