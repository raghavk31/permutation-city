"""Form metrics: readouts on any design (app/engine/metrics; definitions in docs/metrics.md).

Each is a pure function of a design's network (pc.metrics.network), built once per design
and only when asked for. Wholeness is the list, never one number.
"""

from pc.metrics import harmony, nature, order, scale
from pc.metrics.network import network

# key: (property in the brief's vocabulary, higher is better (None: neither), function)
METRICS = {
    "dh_enclosure": ("human_scale", True, scale.dh_enclosure),
    "block_size": ("human_scale", True, scale.block_size),
    "low_frontage": ("human_scale", True, scale.low_frontage),
    "junctions": ("permeability", True, scale.junction_density),
    "connections": ("permeability", True, scale.connections),
    "active_frontage": ("permeability", True, scale.active_frontage),
    "green_walk": ("connection_to_nature", True, nature.green_walk),
    "water_walk": ("connection_to_nature", True, nature.water_walk),
    "green_cover": ("connection_to_nature", True, nature.green_cover),
    "green_view": ("connection_to_nature", True, nature.green_view),
    "height_mix": ("harmony_variety", None, harmony.height_entropy),
    "use_mix": ("harmony_variety", None, harmony.use_entropy),
    "type_mix": ("harmony_variety", None, harmony.type_entropy),
    "coherence": ("harmony_variety", True, harmony.coherence),
    "levels_of_scale": ("levels_of_scale", True, order.levels_of_scale),
    "strong_centres": ("strong_centres", True, order.strong_centres),
    "boundaries": ("boundaries", True, order.boundaries),
    "rhythm_built": ("alternating_repetition", True, order.rhythm_built),
    "rhythm_skyline": ("alternating_repetition", True, order.rhythm_skyline),
    "positive_space": ("positive_space", True, order.positive_space),
    "local_symmetry": ("local_symmetries", True, order.local_symmetry),
    "symmetry": ("local_symmetries", None, order.symmetry),
    "balance": ("local_symmetries", True, order.balance),
    "contrast": ("contrast", True, order.contrast),
    "landmarks": ("contrast", True, order.landmark_placement),
    "gradients": ("gradients", True, order.gradients),
    "roughness": ("roughness", None, order.roughness),
    "the_void": ("the_void", True, order.the_void),
    "semilattice": ("semilattice_richness", True, nature.semilattice),
    "legibility": ("legibility", True, nature.legibility),
}
OBJECTIVE_KEYS = [k for k, (_, up, _) in METRICS.items() if up is not None]
# where most designs fall, for MAP-Elites bins (0 to 1 when not listed)
RANGES = {"junctions": (0.0, 4.0), "connections": (2.0, 10.0)}


def measure(design, ground, keys=None) -> dict:
    """Some or all metrics of a design (as plain floats)."""
    net = network(design, ground)
    return {k: float(METRICS[k][2](net)) for k in (keys or METRICS)}
