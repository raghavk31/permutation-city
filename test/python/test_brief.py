"""pc/brief.py beyond parity: saving a brief with a site, and the rules round trip."""

import json
import shutil

import pytest

from pc import brief, export, rules, site as site_mod


@pytest.fixture
def docks(tmp_path, monkeypatch):
    """A copy of sites/mumbai-docks to save briefs into."""
    shutil.copytree(site_mod.SITES / "mumbai-docks", tmp_path / "mumbai-docks", ignore=shutil.ignore_patterns("maps"))
    monkeypatch.setattr(site_mod, "SITES", tmp_path)
    return site_mod.load("mumbai-docks")


def test_rules_round_trip():
    r = rules.load_rules(site_mod.SITES / "mumbai-docks" / "rules.yaml")
    table = export.rule_table(r)
    assert rules.compile_rules(brief.rules_yaml(table)) == table["list"]


def test_pattern_cards():
    assert brief.pattern_numbers() == [21, 60, 61, 106, 107, 159]


def test_save_writes_the_brief_and_the_targets(docks):
    raw = {"format": "permutation-city-brief", "site": "mumbai-docks",
           "brief": {"fsi": {"value": 2.4, "sources": ["mumbai-dcpr-fsi#1"], "note": ""},
                     "design_storm_mm": {"value": 250, "sources": [], "note": ""},
                     "patterns": [{"id": 21, "sources": [], "note": ""}],
                     "rule_changes": [{"rule": "rain hollows", "min_permeable": 0.9, "sources": [], "note": ""}],
                     "gene_ranges": {"value": {"green_share": [0.2, 0.4]}, "sources": [], "note": ""}},
           "snippets": [{"id": "mumbai-dcpr-fsi#1", "title": "FSI"}]}
    warnings = brief.save(docks, raw)
    assert warnings == []
    saved = json.loads((docks.folder / "brief.json").read_text(encoding="utf-8"))
    assert saved["brief"]["fsi"]["sources"] == ["mumbai-dcpr-fsi#1"]
    again = site_mod.load("mumbai-docks")
    assert (again.target_far, again.target_floor_area_ha, again.design_storm_mm) == (2.4, None, 250)

    cfg = brief.run_config(again)
    assert cfg["ranges"]["green_share"] == [0.2, 0.4]
    assert cfg["rules"]["defaults"]["max_levels"] == 4  # pattern 21
    hollows = next(r for r in cfg["rules"]["list"] if r["name"] == "rain hollows")
    assert hollows["limits"]["min_permeable"] == 0.9


def test_a_bare_brief_keeps_its_citations(docks):
    warnings = brief.save(docks, {"fsi": {"value": 2.0, "sources": ["x#1"], "note": ""}})
    assert warnings == []
    assert brief.run_config(docks)["target_far"] == 2.0


def test_no_brief_no_config(docks):
    assert brief.run_config(docks) is None
