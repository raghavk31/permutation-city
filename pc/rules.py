"""Apply a site's McHarg rules (sites/<id>/rules.yaml) to its layers.

A rule is a test on the layer columns (see pc/layers.py) plus what follows from it:

    forbidden    nature's: never built on. Absolute: nothing overrides it.
    retained     the existing city kept as it is (context, not design ground).
    constrained  buildable, with limits (heights, permeable ground, uses) and roles.

Rules overlap (Alexander, "A City is Not a Tree"): a cell can belong to several rules at
once, e.g. a rain hollow that is also a drainage line and sits by the water. Every cell
gets:
    memberships    bitmask of the rules it belongs to (bit k = rule k, file order)
    state          forbidden / retained / constrained / open, derived from memberships
    reasons        the rules that touched it
    max_levels     height cap (levels): the strictest of its rules
    min_permeable  share of ground that must stay unsealed: the strictest of its rules
    uses           allowed uses, comma-separated: what all its rules allow; if they share
                   none, what any of them allows, and the cell is marked as a conflict
    conflict       its rules' allowed uses don't overlap; a person should decide
    roles          what the cell does for the city (flood storage, breeze corridor ...),
                   the union of its rules' roles
    raised_ground  ground floor must sit above flood level
    remediate      clean-up before building

`when` is structured:
    {layer: pool, op: ">", value: 0.2}      a comparison (op: > >= < <= == !=)
    {layer: water}                          a yes/no layer
    {all: [...]}, {any: [...]}, {not: ...}  combinations
The older string form (`pool > 0.2`, `not in_design and not industrial`) is parsed into
that structure. Nothing is ever run through eval, so rules can come from the web app.

A rule that refers to a layer the site doesn't have (e.g. sea flooding on an inland
site) is skipped and reported.
"""

import re

import geopandas as gpd
import numpy as np
import yaml

STATES = ["forbidden", "retained", "constrained", "open"]
KINDS = ["forbidden", "retained", "constrained"]
OPS = {">": np.greater, ">=": np.greater_equal, "<": np.less, "<=": np.less_equal,
       "==": np.equal, "!=": np.not_equal}
LIMITS = ["max_levels", "min_permeable", "uses", "raised_ground", "remediate"]
MAX_RULES = 32  # memberships are one 32-bit word per cell


class MissingLayer(KeyError):
    pass


def load_rules(path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# --- conditions -----------------------------------------------------------------------

_TOKEN = re.compile(r"\s*(?:(>=|<=|==|!=|>|<|\(|\))|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|([A-Za-z_]\w*))")


def parse(text: str) -> dict:
    """`flood_surge_2050 > 1.5 and not industrial` → a structured condition."""
    tokens, pos, text = [], 0, text.strip()
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            raise ValueError(f"can't read rule condition {text!r} at {text[pos:]!r}")
        op, num, word = m.groups()
        tokens.append(("op", op) if op else ("num", float(num)) if num else ("word", word))
        pos = m.end()
    k = 0

    def peek():
        return tokens[k] if k < len(tokens) else (None, None)

    def take():
        nonlocal k
        if k >= len(tokens):
            return (None, None)
        k += 1
        return tokens[k - 1]

    def either():
        parts = [both()]
        while peek() == ("word", "or"):
            take()
            parts.append(both())
        return parts[0] if len(parts) == 1 else {"any": parts}

    def both():
        parts = [negation()]
        while peek() == ("word", "and"):
            take()
            parts.append(negation())
        return parts[0] if len(parts) == 1 else {"all": parts}

    def negation():
        if peek() == ("word", "not"):
            take()
            return {"not": negation()}
        return comparison()

    def comparison():
        kind, v = take()
        if (kind, v) == ("op", "("):
            inner = either()
            if take() != ("op", ")"):
                raise ValueError(f"missing ) in {text!r}")
            return inner
        if kind != "word" or v in ("and", "or", "not"):
            raise ValueError(f"expected a layer name in {text!r}")
        if peek()[0] == "op" and peek()[1] in OPS:
            _, op = take()
            kind2, value = take()
            if kind2 != "num":
                raise ValueError(f"expected a number after {op} in {text!r}")
            return {"layer": v, "op": op, "value": value}
        return {"layer": v}

    out = either()
    if k != len(tokens):
        raise ValueError(f"unexpected {tokens[k][1]!r} in {text!r}")
    return out


def condition(when) -> dict:
    """A rule's `when`, string or structured, as a checked structure."""
    c = parse(when) if isinstance(when, str) else when
    _check(c)
    return c


def _check(c):
    if not isinstance(c, dict) or len(c) == 0:
        raise ValueError(f"bad rule condition: {c!r}")
    if "all" in c or "any" in c:
        parts = c.get("all", c.get("any"))
        if not isinstance(parts, list) or not parts:
            raise ValueError(f"all/any needs a list: {c!r}")
        for p in parts:
            _check(p)
    elif "not" in c:
        _check(c["not"])
    elif "layer" in c:
        if not re.fullmatch(r"[A-Za-z_]\w*", str(c["layer"])):
            raise ValueError(f"bad layer name: {c['layer']!r}")
        if "op" in c and (c["op"] not in OPS or not isinstance(c.get("value"), (int, float))):
            raise ValueError(f"bad comparison: {c!r}")
    else:
        raise ValueError(f"bad rule condition: {c!r}")


def layers_used(c) -> set:
    if "all" in c or "any" in c:
        return set().union(*(layers_used(p) for p in c.get("all", c.get("any"))))
    if "not" in c:
        return layers_used(c["not"])
    return {c["layer"]}


def evaluate(c, cols) -> np.ndarray:
    """Where a condition holds, on a mapping of layer name → column."""
    if "all" in c:
        out = evaluate(c["all"][0], cols)
        for p in c["all"][1:]:
            out = out & evaluate(p, cols)
        return out
    if "any" in c:
        out = evaluate(c["any"][0], cols)
        for p in c["any"][1:]:
            out = out | evaluate(p, cols)
        return out
    if "not" in c:
        return ~evaluate(c["not"], cols)
    if c["layer"] not in cols:
        raise MissingLayer(c["layer"])
    v = np.asarray(cols[c["layer"]], dtype=float)
    if "op" in c:
        return OPS[c["op"]](v, float(c["value"]))
    return v != 0


# --- rules ----------------------------------------------------------------------------

def compile_rules(rules: dict) -> list[dict]:
    """rules.yaml → a flat list in membership order (forbidden, retained, constrained,
    each in file order), every rule with a structured condition."""
    out = []
    for kind in KINDS:
        for r in rules.get(kind) or []:
            lim = r.get("limits") or {}
            unknown = set(lim) - set(LIMITS)
            if unknown:
                raise ValueError(f"rule {r['name']!r}: unknown limits {sorted(unknown)}")
            out.append({"id": len(out), "kind": kind, "name": r["name"], "when": condition(r["when"]),
                        "limits": lim, "roles": list(r.get("roles") or []),
                        "why": r.get("why", ""), "source": r.get("source", "")})
    if len(out) > MAX_RULES:
        raise ValueError(f"{len(out)} rules; at most {MAX_RULES}")
    return out


def matches(compiled: list[dict], cols, n: int) -> tuple[list[np.ndarray], list[str]]:
    """Each rule's cells, and the rules skipped for a missing layer."""
    hits, skipped = [], []
    for r in compiled:
        try:
            hits.append(evaluate(r["when"], cols).astype(bool))
        except MissingLayer:
            skipped.append(r["name"])
            hits.append(np.zeros(n, dtype=bool))
    return hits, skipped


def combine(compiled, hits, defaults, n) -> dict:
    """Per-cell results from the rules' matches (see the module docstring)."""
    default_uses = list(defaults["uses"])
    member = np.zeros(n, dtype=np.int64)
    max_levels = np.full(n, float(defaults["max_levels"]))
    min_perm = np.full(n, float(defaults["min_permeable"]))
    raised = np.zeros(n, dtype=bool)
    remediate = np.zeros(n, dtype=bool)
    forbidden = np.zeros(n, dtype=bool)
    retained = np.zeros(n, dtype=bool)
    constrained = np.zeros(n, dtype=bool)
    for r, m in zip(compiled, hits):
        member[m] |= 1 << r["id"]
        if r["kind"] == "forbidden":
            forbidden |= m
        elif r["kind"] == "retained":
            retained |= m
        else:
            constrained |= m
            lim = r["limits"]
            if "max_levels" in lim:
                max_levels[m] = np.minimum(max_levels[m], lim["max_levels"])
            if "min_permeable" in lim:
                min_perm[m] = np.maximum(min_perm[m], lim["min_permeable"])
            if lim.get("raised_ground"):
                raised |= m
            if lim.get("remediate"):
                remediate |= m

    state = np.where(forbidden, "forbidden", np.where(retained, "retained",
                     np.where(constrained, "constrained", "open")))

    # Reasons: constrained rules first, then retained, then forbidden (file order within).
    order = [r for r in compiled if r["kind"] == "constrained"] + \
            [r for r in compiled if r["kind"] == "retained"] + \
            [r for r in compiled if r["kind"] == "forbidden"]
    reasons, uses, roles, conflict = [], [], [], np.zeros(n, dtype=bool)
    use_rules = [r for r in compiled if r["kind"] == "constrained" and "uses" in r["limits"]]
    for i in range(n):
        bits = int(member[i])
        reasons.append("; ".join(r["name"] for r in order if bits >> r["id"] & 1))
        roles.append(",".join(sorted({x for r in compiled if bits >> r["id"] & 1 for x in r["roles"]})))
        sets = [set(r["limits"]["uses"]) for r in use_rules if bits >> r["id"] & 1]
        keep = set(default_uses).intersection(*sets) if sets else set(default_uses)
        if sets and not keep:
            keep = set(default_uses).intersection(set().union(*sets))
            conflict[i] = True
        uses.append(",".join(u for u in default_uses if u in keep))

    # Forbidden and retained cells are fixed: nothing is built there.
    fixed = forbidden | retained
    max_levels[fixed], min_perm[fixed] = 0, 1.0
    uses = ["water,wetland,landscape" if f else "" if t else u
            for u, f, t in zip(uses, state == "forbidden", state == "retained")]
    conflict &= ~fixed
    return {"state": state, "memberships": member, "reasons": reasons, "max_levels": max_levels,
            "min_permeable": min_perm, "uses": uses, "conflict": conflict, "roles": roles,
            "raised_ground": raised, "remediate": remediate}


def apply(grid: gpd.GeoDataFrame, rules: dict) -> tuple[gpd.GeoDataFrame, list[str]]:
    compiled = compile_rules(rules)
    g = grid.copy()
    cols = {c: g[c].to_numpy() for c in g.columns if c != "geometry"}
    hits, skipped = matches(compiled, cols, len(g))
    for k, v in combine(compiled, hits, rules["defaults"], len(g)).items():
        g[k] = v
    g["max_levels"] = g["max_levels"].astype(int)
    return g, skipped


def summary(g, rules, skipped) -> str:
    land = g[~g["water"]]
    ha = lambda m: land.loc[m].area.sum() / 1e4
    lines = [f"  {s:12s} {ha(land.state == s):5.0f} ha" for s in STATES]
    compiled = compile_rules(rules)
    lines.append("  rule hits (ha):")
    for r in compiled:
        hit = "skipped (layer missing)" if r["name"] in skipped \
            else f"{ha((land['memberships'].to_numpy() >> r['id'] & 1) > 0):5.0f}"
        lines.append(f"    {r['kind'][:4]}  {r['name']:26s} {hit}")
    design = land[land.state.isin(["constrained", "open"])]
    lines.append(f"  design ground: {design.area.sum() / 1e4:.0f} ha in {len(design):,} cells")
    n_conflict = int(design["conflict"].sum())
    if n_conflict:
        lines.append(f"  conflicts (rules allow no common use): {n_conflict:,} cells")
    return "\n".join(lines)
