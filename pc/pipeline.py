"""The build steps, shared by the command line and the app."""

import geopandas as gpd

from pc import layers, maps, rules
from pc.site import Site


def apply_rules(site: Site, grid=None, log=print):
    """Rules → suitability.gpkg, and the layer and rule maps."""
    if grid is None:
        grid = gpd.read_file(site.layers / "grid.gpkg", layer="cells")
    r = rules.load_rules(site.rules)
    g, skipped = rules.apply(grid, r)
    g.to_file(site.layers / "suitability.gpkg", layer="cells", driver="GPKG")
    log(rules.summary(g, r, skipped))
    site.maps.mkdir(parents=True, exist_ok=True)
    maps.layers_sheet(site, grid, site.maps / "01-layers.png")
    maps.rules_map(site, g, site.maps / "02-rules.png")
    log(f"  maps in sites/{site.id}/maps/")
    return g, skipped


def build(site: Site, log=print):
    """Layers → grid.gpkg, then rules and maps."""
    grid = layers.build(site)
    site.layers.mkdir(parents=True, exist_ok=True)
    grid.to_file(site.layers / "grid.gpkg", layer="cells", driver="GPKG")
    log(layers.summary(site, grid))
    return apply_rules(site, grid, log)
