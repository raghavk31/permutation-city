"""pc/wind.py: the seasonal summary of hourly wind (no network)."""

from pc import wind


def hourly(rows):
    """rows: (iso time UTC, speed m/s, from degrees)."""
    return {"latitude": 19.0, "longitude": 73.0, "hourly": {
        "time": [r[0] for r in rows], "wind_speed_10m": [r[1] for r in rows], "wind_direction_10m": [r[2] for r in rows]}}


def test_axis_serves_both_ends_and_calms_are_left_out():
    # April, 09:00 UTC = 14:30 IST: half from 280°, half from 100° (the same axis), one calm hour.
    rows = [(f"2020-04-{d:02d}T09:00", 4.0, 280 if d % 2 else 100) for d in range(1, 21)]
    rows.append(("2020-04-21T09:00", 0.2, 10))
    out = wind.summarise(hourly(rows), 18.95, 72.84, (3, 5), 5.5)
    s = out["seasons"]["hot_afternoon"]
    assert s["hours"] == 21
    assert abs(s["calm"] - 1 / 21) < 1e-3
    assert abs(s["axis_deg"] - 100) < 0.5 and s["consistency"] > 0.99
    assert out["bearing_deg"] == s["axis_deg"]
    assert 15 < out["grid_point_km"] < 20  # 73.0 E is about 17 km from 72.84 E at 19 N


def test_afternoon_is_local_time_and_seasons_split():
    rows = [("2020-04-01T03:00", 3.0, 0),     # 08:30 IST: hot season, not afternoon
            ("2020-07-01T09:00", 3.0, 225)]   # monsoon afternoon
    out = wind.summarise(hourly(rows), 19.0, 73.0, (3, 5), 5.5)
    assert out["seasons"]["hot"]["hours"] == 1
    assert out["seasons"]["hot_afternoon"] == {"hours": 0, "calm": 1.0}
    assert out["seasons"]["monsoon"]["prevailing_from_deg"] == 225.0
