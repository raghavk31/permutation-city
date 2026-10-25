"""pc/maps.py: place labels (no network)."""

from pc.maps import _name


def test_label_prefers_the_english_name():
    # Overture keeps common names as (language, name) pairs; Guwahati's primary names are Assamese.
    assert _name({"primary": "ভাঙাগড়", "common": [("en", "Bhangagarh")]}) == "Bhangagarh"
    assert _name({"primary": "Anil Nagar", "common": None}) == "Anil Nagar"
    assert _name(None) is None
