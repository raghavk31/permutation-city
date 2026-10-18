"""The brief: a fixed schema the brief compiler fills, its validator, and how a confirmed
brief becomes a run's settings. The browser engine has the same (app/engine/brief.ts);
test/parity checks both give the same validated brief, warnings and run settings.

The compiler may only choose values from this vocabulary, within these limits, and cites a
retrieved snippet for each value or leaves it "assumed" (no sources). Anything else is
dropped with a warning. The genome schema never changes: a brief changes how genes are
read (gene ranges), the rules' limits, and the targets designs are judged against.

    uv run pc brief <site> <brief.json>   check a confirmed brief and save it with the site:
                                          sites/<site>/brief.json, and its floor-area target
                                          and design storm into site.yaml. `pc grow` and
                                          `pc evolve` then use its gene ranges and rules.
"""

import json
import math

from pc import fitness, genome
from pc.rng import Rng

VERSION = 1
PROGRAMMES = ["residential", "commercial", "civic", "industrial", "open_space"]
TYPOLOGIES = ["courtyard", "l_shape", "u_shape", "tower", "slab", "podium_tower"]
AESTHETICS = [
    "levels_of_scale", "strong_centres", "boundaries", "alternating_repetition", "positive_space",
    "local_symmetries", "contrast", "gradients", "roughness", "echoes", "the_void", "not_separateness",
    "human_scale", "permeability", "connection_to_nature", "harmony_variety", "semilattice_richness", "legibility",
]
RANGE_KEYS = list(genome.GLOBAL_GENES)
SCORE_KEYS = list(fitness.SCORES)

NUMBERS = {"fsi": (0.1, 8), "floor_area_ha": (0.1, 10000), "height_limit_levels": (1, 60),
           "ground_coverage_max": (0.2, 0.9), "design_storm_mm": (10, 1500)}
SETBACK_MAX = 30
MAX_SUMMARY, MAX_NOTE, MAX_TAG, MAX_TAGS = 800, 300, 40, 8
EPS = 1e-9
FIELDS = ["version", "summary", "fsi", "floor_area_ha", "height_limit_levels", "ground_coverage_max",
          "design_storm_mm", "setbacks_m", "programme_mix", "objective_weights", "gene_ranges", "typology_priors",
          "aesthetic_priorities", "rule_changes", "patterns", "tags"]
FOUR_STORY_PATTERN, FOUR_STORIES = 21, 4

# Each typology as a site-scale density pattern (see app/engine/brief.ts TYPOLOGY_GENES).
TYPOLOGY_GENES = {
    "courtyard": {"coverage": 0.8, "peak": 0.15, "intensity": 0.45, "base": 0.8},
    "l_shape": {"coverage": 0.6, "peak": 0.2, "intensity": 0.45, "base": 0.65},
    "u_shape": {"coverage": 0.7, "peak": 0.2, "intensity": 0.45, "base": 0.7},
    "tower": {"coverage": 0.15, "peak": 0.9, "intensity": 0.9, "base": 0.1},
    "slab": {"coverage": 0.5, "peak": 0.45, "intensity": 0.65, "base": 0.5},
    "podium_tower": {"coverage": 0.9, "peak": 0.85, "intensity": 0.8, "base": 0.2},
}
SEED_JITTER = 0.05


# --- validation ---------------------------------------------------------------------------

def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _in_range(v, lo, hi):
    return _is_num(v) and lo <= v <= hi


def _share(v):
    return _in_range(v, 0, 1)


def _is_int(v):
    return _is_num(v) and float(v).is_integer()


def _text(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _sources(v, where, ctx, warn):
    if not isinstance(v, list):
        return []
    out = []
    for s in v:
        if isinstance(s, str) and s in ctx["snippets"]:
            if s not in out:
                out.append(s)
        else:
            warn(f"{where}: a source that wasn't among the snippets was dropped")
    return out


def _cited(raw, key, ctx, warn, check):
    v = raw.get(key)
    if v is None:
        return None
    if not isinstance(v, dict) or "value" not in v:
        warn(f"{key}: not in the form {{value, sources, note}}; left out")
        return None
    value = check(v["value"])
    if isinstance(value, str):
        warn(f"{key}: {value}; left out")
        return None
    return {"value": value, "sources": _sources(v.get("sources"), key, ctx, warn), "note": _text(v.get("note"), MAX_NOTE)}


def _number_in(lo, hi, integer=False):
    def check(v):
        if not _in_range(v, lo, hi):
            return "outside the allowed range"
        if integer and not _is_int(v):
            return "not a whole number"
        return v
    return check


def _weights(keys, warn, key):
    def check(v):
        if not isinstance(v, dict):
            return "not an object"
        out = {}
        for k, w in v.items():
            if k not in keys:
                warn(f"{key}: unknown key {k} dropped")
                continue
            if not _share(w):
                warn(f"{key}: {k} outside 0 to 1, dropped")
                continue
            out[k] = w
        return out if out else "nothing valid"
    return check


def _ranked(keys, field, most, warn, key):
    def check(v):
        if not isinstance(v, list):
            return "not a list"
        out = []
        for item in v:
            name = item.get(field) if isinstance(item, dict) else None
            if not isinstance(name, str) or name not in keys:
                warn(f"{key}: unknown {field} dropped")
                continue
            if not _share(item.get("weight")):
                warn(f"{key}: {name} weight outside 0 to 1, dropped")
                continue
            if any(o[field] == name for o in out):
                warn(f"{key}: {name} given twice; the first kept")
                continue
            out.append({field: name, "weight": item["weight"]})
        if len(out) > most:
            warn(f"{key}: more than {most}; the rest dropped")
            out = out[:most]
        return out if out else "nothing valid"
    return check


def _setbacks(v):
    if not isinstance(v, dict):
        return "not an object"
    out = {"front": v.get("front"), "side": v.get("side"), "rear": v.get("rear")}
    if all(_in_range(x, 0, SETBACK_MAX) for x in out.values()):
        return out
    return "front, side and rear must each be 0 to 30 m"


def _gene_ranges(warn):
    def check(v):
        if not isinstance(v, dict):
            return "not an object"
        out = {}
        for k, pair in v.items():
            if k not in RANGE_KEYS:
                warn(f"gene_ranges: unknown gene {k} dropped")
                continue
            dlo, dhi = genome.RANGES[k]
            if (not isinstance(pair, list) or len(pair) != 2 or not _is_num(pair[0]) or not _is_num(pair[1])
                    or pair[0] > pair[1] or pair[0] < dlo - EPS or pair[1] > dhi + EPS):
                warn(f"gene_ranges: {k} must be [low, high] within its default range; dropped")
                continue
            out[k] = [pair[0], pair[1]]
        return out if out else "nothing valid"
    return check


def validate(raw, ctx: dict) -> tuple[dict, list[str]]:
    """ctx: {rules: [{name, kind}], snippets: [ids], patterns: [numbers]}. Never raises:
    what fails is left out, with a warning."""
    warnings = []
    warn = warnings.append
    if isinstance(raw, dict):
        r = raw
    else:
        warn("the brief is not an object")
        r = {}
    for k in r:
        if k not in FIELDS:
            warn(f"unknown field {k} dropped")

    summary = _text(r.get("summary"), MAX_SUMMARY)
    if isinstance(r.get("summary"), str) and len(r["summary"].strip()) > MAX_SUMMARY:
        warn("summary: shortened")

    changes = []
    rc = r.get("rule_changes")
    if isinstance(rc, list):
        for c in rc:
            name = c.get("rule") if isinstance(c, dict) else None
            rule = next((x for x in ctx["rules"] if x["name"] == name), None)
            if rule is None:
                warn("rule_changes: a rule that isn't in the site's rules was dropped")
                continue
            if rule["kind"] != "constrained":
                warn(f"rule_changes: {rule['name']} is {rule['kind']} and can't be changed; dropped")
                continue
            ch = {"rule": rule["name"], "sources": [], "note": ""}
            if isinstance(c.get("enabled"), bool):
                ch["enabled"] = c["enabled"]
            elif "enabled" in c:
                warn(f"rule_changes: {rule['name']} enabled is not true or false; ignored")
            if "max_levels" in c:
                if _in_range(c["max_levels"], 1, 60) and _is_int(c["max_levels"]):
                    ch["max_levels"] = c["max_levels"]
                else:
                    warn(f"rule_changes: {rule['name']} max_levels outside 1 to 60; ignored")
            if "min_permeable" in c:
                if _share(c["min_permeable"]):
                    ch["min_permeable"] = c["min_permeable"]
                else:
                    warn(f"rule_changes: {rule['name']} min_permeable outside 0 to 1; ignored")
            if not any(k in ch for k in ("enabled", "max_levels", "min_permeable")):
                warn(f"rule_changes: {rule['name']} changes nothing; dropped")
                continue
            if any(x["rule"] == rule["name"] for x in changes):
                warn(f"rule_changes: {rule['name']} given twice; the first kept")
                continue
            ch["sources"] = _sources(c.get("sources"), f"rule_changes {rule['name']}", ctx, warn)
            ch["note"] = _text(c.get("note"), MAX_NOTE)
            changes.append(ch)
    elif rc is not None:
        warn("rule_changes: not a list; left out")

    patterns = []
    ps = r.get("patterns")
    if isinstance(ps, list):
        for p in ps:
            pid = p.get("id") if isinstance(p, dict) else None
            if not _is_num(pid) or pid not in ctx["patterns"]:
                warn("patterns: a pattern without a card was dropped")
                continue
            if any(x["id"] == pid for x in patterns):
                warn(f"patterns: {pid} given twice; the first kept")
                continue
            patterns.append({"id": pid, "sources": _sources(p.get("sources"), f"patterns {pid}", ctx, warn),
                             "note": _text(p.get("note"), MAX_NOTE)})
    elif ps is not None:
        warn("patterns: not a list; left out")

    tags = []
    ts = r.get("tags")
    if isinstance(ts, list):
        for t in ts:
            s = t.strip() if isinstance(t, str) else ""
            if not s or len(s) > MAX_TAG:
                warn("tags: an empty or long tag was dropped")
                continue
            if len(tags) >= MAX_TAGS:
                warn(f"tags: more than {MAX_TAGS}; the rest dropped")
                break
            if s not in tags:
                tags.append(s)
    elif ts is not None:
        warn("tags: not a list; left out")

    brief = {
        "version": VERSION,
        "summary": summary,
        "fsi": _cited(r, "fsi", ctx, warn, _number_in(*NUMBERS["fsi"])),
        "floor_area_ha": _cited(r, "floor_area_ha", ctx, warn, _number_in(*NUMBERS["floor_area_ha"])),
        "height_limit_levels": _cited(r, "height_limit_levels", ctx, warn, _number_in(*NUMBERS["height_limit_levels"], True)),
        "ground_coverage_max": _cited(r, "ground_coverage_max", ctx, warn, _number_in(*NUMBERS["ground_coverage_max"])),
        "design_storm_mm": _cited(r, "design_storm_mm", ctx, warn, _number_in(*NUMBERS["design_storm_mm"])),
        "setbacks_m": _cited(r, "setbacks_m", ctx, warn, _setbacks),
        "programme_mix": _cited(r, "programme_mix", ctx, warn, _weights(PROGRAMMES, warn, "programme_mix")),
        "objective_weights": _cited(r, "objective_weights", ctx, warn, _weights(SCORE_KEYS, warn, "objective_weights")),
        "gene_ranges": _cited(r, "gene_ranges", ctx, warn, _gene_ranges(warn)),
        "typology_priors": _cited(r, "typology_priors", ctx, warn,
                                  _ranked(TYPOLOGIES, "type", len(TYPOLOGIES), warn, "typology_priors")),
        "aesthetic_priorities": _cited(r, "aesthetic_priorities", ctx, warn,
                                       _ranked(AESTHETICS, "metric", 12, warn, "aesthetic_priorities")),
        "rule_changes": changes,
        "patterns": patterns,
        "tags": tags,
    }
    return brief, warnings


# --- a confirmed brief → a run's settings -------------------------------------------------

def is_off(rule) -> bool:
    w = rule["when"]
    return isinstance(w, dict) and "all" in w and len(w["all"]) == 2 and w["all"][1] == {"not": w["all"][0]}


def switched(rule, on: bool) -> dict:
    if is_off(rule) == (not on):
        return rule
    when = rule["when"]["all"][0] if on else {"all": [rule["when"], {"not": rule["when"]}]}
    return {**rule, "when": when}


def height_limit(brief) -> int | None:
    if brief["height_limit_levels"]:
        return brief["height_limit_levels"]["value"]
    return FOUR_STORIES if any(p["id"] == FOUR_STORY_PATTERN for p in brief["patterns"]) else None


def apply(brief: dict, rules: dict, meta: dict) -> dict:
    """rules: the compiled table ({defaults, list}, pc.export.rule_table); meta: target_far,
    target_floor_area_ha, design_storm_mm. Returns the run config."""
    target_far, target_ha = meta["target_far"], meta["target_floor_area_ha"]
    if brief["floor_area_ha"]:
        target_ha = brief["floor_area_ha"]["value"]
    elif brief["fsi"]:
        target_far, target_ha = brief["fsi"]["value"], None

    ranges = {k: list(v) for k, v in genome.RANGES.items()}
    for k in RANGE_KEYS:
        v = (brief["gene_ranges"] or {"value": {}})["value"].get(k)
        if v:
            ranges[k] = [v[0], v[1]]
    if brief["ground_coverage_max"]:
        c = brief["ground_coverage_max"]["value"]
        lo, hi = ranges["coverage"]
        ranges["coverage"] = [min(lo, c), min(hi, c)]

    h = height_limit(brief)
    defaults = dict(rules["defaults"])
    if h is not None:
        defaults["max_levels"] = min(defaults["max_levels"], h)
    out_list = []
    for rule in rules["list"]:
        ch = next((c for c in brief["rule_changes"] if c["rule"] == rule["name"]), None)
        if ch is None or rule["kind"] != "constrained":
            out_list.append(rule)
            continue
        nxt = rule if "enabled" not in ch else switched(rule, ch["enabled"])
        limits = dict(nxt["limits"])
        if "max_levels" in ch:
            limits["max_levels"] = ch["max_levels"]
        if "min_permeable" in ch:
            limits["min_permeable"] = ch["min_permeable"]
        out_list.append({**nxt, "limits": limits})
    return {
        "target_far": target_far, "target_floor_area_ha": target_ha,
        "design_storm_mm": brief["design_storm_mm"]["value"] if brief["design_storm_mm"] else meta["design_storm_mm"],
        "ranges": ranges, "rules": {**rules, "defaults": defaults, "list": out_list},
    }


def typology_seeds(priors: list[dict], count: int, seed: int) -> list[list[float]]:
    """Up to `count` starting genomes shared out by weight: random attractors, site-wide
    genes near each typology's pattern (app/engine/brief.ts typologySeeds)."""
    total = sum(p["weight"] for p in priors)
    if not total > 0 or count < 1:
        return []
    rng = Rng(seed)
    out = []
    base = genome.N_ATTRACTORS * genome.ATTRACTOR_GENES
    for p in priors:
        k = min(round(count * p["weight"] / total), count - len(out))
        for _ in range(k):
            g = [rng.random() for _ in range(genome.LENGTH)]
            for i, name in enumerate(genome.GLOBAL_GENES):
                target = TYPOLOGY_GENES[p["type"]].get(name)
                if target is None:
                    continue
                g[base + i] = min(max(target + rng.normal(0, SEED_JITTER), 0), 1)
            out.append(g)
    return out


# --- the site's saved brief -----------------------------------------------------------------

def context_for(rules_table: dict, snippets=(), patterns=()) -> dict:
    return {"rules": [{"name": r["name"], "kind": r["kind"]} for r in rules_table["list"]],
            "snippets": list(snippets), "patterns": list(patterns)}


def saved_sources(brief: dict) -> list[str]:
    """Every snippet id a saved brief cites (they stay valid when the brief is re-checked)."""
    ids = []
    def add(xs):
        for s in xs:
            if s not in ids:
                ids.append(s)
    for k in FIELDS:
        v = brief.get(k)
        if isinstance(v, dict) and "sources" in v:
            add(v["sources"])
    for item in (brief.get("rule_changes") or []) + (brief.get("patterns") or []):
        if isinstance(item, dict):
            add(item.get("sources") or [])
    return [s for s in ids if isinstance(s, str)]


def rules_yaml(table: dict) -> dict:
    """A compiled rule table back in rules.yaml's shape (pc.rules.apply reads that)."""
    out = {"defaults": table["defaults"]}
    for kind in ("forbidden", "retained", "constrained"):
        out[kind] = [{"name": r["name"], "when": r["when"], "limits": r["limits"], "roles": r["roles"],
                      "why": r["why"], "source": r["source"]} for r in table["list"] if r["kind"] == kind]
    return out


def pattern_numbers() -> list[int]:
    """The pattern cards in corpus/patterns/ (their file names start with the number)."""
    from pc.site import ROOT
    return sorted(int(p.name[:3]) for p in (ROOT / "corpus" / "patterns").glob("[0-9][0-9][0-9]-*.md"))


def saved_path(site):
    return site.folder / "brief.json"


def run_config(site) -> dict | None:
    """The run config from the site's saved brief, or None if it has none."""
    from pc import export, rules
    path = saved_path(site)
    if not path.exists():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    table = export.rule_table(rules.load_rules(site.rules))
    meta = {"target_far": site.target_far, "target_floor_area_ha": site.target_floor_area_ha,
            "design_storm_mm": site.design_storm_mm}
    return apply(saved["brief"], table, meta)


def save(site, raw) -> list[str]:
    """Check a brief (bare, or as the web app downloads it: {brief, snippets, ...}), save it
    as sites/<id>/brief.json, and write its targets and storm into site.yaml. Returns the
    validator's warnings."""
    from pc import export, rules
    from pc.site import set_value
    data = raw if isinstance(raw, dict) and "brief" in raw else {"brief": raw}
    snippets = data.get("snippets") or []
    ids = [s["id"] for s in snippets if isinstance(s, dict) and isinstance(s.get("id"), str)]
    table = export.rule_table(rules.load_rules(site.rules))
    brief, warnings = validate(data["brief"], context_for(table, ids or saved_sources(data["brief"]),
                                                          pattern_numbers()))
    saved_path(site).write_text(json.dumps({"site": site.id, "brief": brief, "snippets": snippets}, indent=1,
                                           ensure_ascii=False), encoding="utf-8")
    if brief["floor_area_ha"]:
        set_value(site.id, "target_floor_area_ha", brief["floor_area_ha"]["value"])
    elif brief["fsi"]:
        set_value(site.id, "target_far", brief["fsi"]["value"])
        set_value(site.id, "target_floor_area_ha", "null")
    if brief["design_storm_mm"]:
        set_value(site.id, "design_storm_mm", brief["design_storm_mm"]["value"])
    return warnings
