"""pc.rules: the condition parser and how overlapping rules combine."""

import numpy as np
import pytest

from pc import rules


def test_parse_comparison():
    assert rules.parse("flood_surge_2050 > 1.5") == {"layer": "flood_surge_2050", "op": ">", "value": 1.5}


def test_parse_flag_and_not():
    assert rules.parse("not in_design and not industrial") == {
        "all": [{"not": {"layer": "in_design"}}, {"not": {"layer": "industrial"}}]}


def test_parse_precedence_and_brackets():
    assert rules.parse("a or b and c") == {"any": [{"layer": "a"}, {"all": [{"layer": "b"}, {"layer": "c"}]}]}
    assert rules.parse("(a or b) and c") == {"all": [{"any": [{"layer": "a"}, {"layer": "b"}]}, {"layer": "c"}]}


@pytest.mark.parametrize("bad", ["__import__('os')", "pool >", "pool > x", "a and", "(a", "a b", "pool > 1; x", ""])
def test_parse_rejects_anything_else(bad):
    with pytest.raises(ValueError):
        rules.parse(bad)


def test_structured_condition_is_checked():
    assert rules.condition({"layer": "pool", "op": ">=", "value": 2}) == {"layer": "pool", "op": ">=", "value": 2}
    for bad in [{"layer": "pool", "op": "~", "value": 1}, {"layer": "a.b"}, {"all": []}, {"layer": "pool", "op": ">", "value": "1"}]:
        with pytest.raises(ValueError):
            rules.condition(bad)


def test_evaluate():
    cols = {"pool": np.array([0.0, 0.3, 0.5]), "industrial": np.array([True, False, True])}
    assert rules.evaluate(rules.parse("pool > 0.2 and not industrial"), cols).tolist() == [False, True, False]
    with pytest.raises(rules.MissingLayer):
        rules.evaluate(rules.parse("flood > 0"), cols)


RULES = {
    "defaults": {"max_levels": 15, "min_permeable": 0.2, "uses": ["water", "wetland", "landscape", "building", "street"]},
    "forbidden": [{"name": "water", "when": "water"}],
    "retained": [{"name": "old city", "when": "old"}],
    "constrained": [
        {"name": "hollow", "when": "pool > 0.2", "roles": ["flood_storage"],
         "limits": {"min_permeable": 0.7, "uses": ["water", "wetland", "landscape"]}},
        {"name": "edge", "when": "edge < 100", "roles": ["public_edge"], "limits": {"max_levels": 4}},
        {"name": "yard", "when": "yard", "limits": {"uses": ["building", "street"]}},
        {"name": "inland flood", "when": "flood > 0"},
    ],
}


def _run(**cols):
    n = len(next(iter(cols.values())))
    base = {"water": [0] * n, "old": [0] * n, "pool": [0] * n, "edge": [999] * n, "yard": [0] * n}
    base.update(cols)
    c = rules.compile_rules(RULES)
    hits, skipped = rules.matches(c, {k: np.array(v) for k, v in base.items()}, n)
    return rules.combine(c, hits, RULES["defaults"], n), skipped


def test_overlap_keeps_every_membership_and_role():
    out, skipped = _run(pool=[0.5, 0.0], edge=[50, 50])
    assert skipped == ["inland flood"]  # no `flood` layer here
    assert out["memberships"].tolist() == [0b1100, 0b1000]  # hollow (bit 2) and edge (bit 3)
    assert out["roles"] == ["flood_storage,public_edge", "public_edge"]
    assert out["max_levels"].tolist() == [4, 4]
    assert out["min_permeable"].tolist() == [0.7, 0.2]
    assert out["state"].tolist() == ["constrained", "constrained"]
    assert out["reasons"][0] == "hollow; edge"


def test_uses_intersect_then_fall_back_to_union_as_a_conflict():
    out, _ = _run(pool=[0.5, 0.5, 0.0], yard=[1, 0, 0])
    assert out["uses"] == ["water,wetland,landscape,building,street", "water,wetland,landscape",
                           "water,wetland,landscape,building,street"]
    assert out["conflict"].tolist() == [True, False, False]


def test_forbidden_is_absolute():
    out, _ = _run(water=[1], old=[1], pool=[0.5], yard=[1])
    assert out["state"].tolist() == ["forbidden"]
    assert out["max_levels"].tolist() == [0] and out["min_permeable"].tolist() == [1.0]
    assert out["uses"] == ["water,wetland,landscape"]
    assert not out["conflict"][0]
    assert out["memberships"][0] & 1  # still recorded as a member of every rule it matches


def test_too_many_rules():
    many = {"defaults": RULES["defaults"], "constrained": [{"name": f"r{i}", "when": "x"} for i in range(33)]}
    with pytest.raises(ValueError):
        rules.compile_rules(many)
