// Nature's rules (docs/typologies.md, "Nature's rules"): what living things and landscapes do
// that a building or a site can borrow, written as genes. A gene is a rule kept as a ratio, an
// angle or a share, never a size, because a termite mound or a leaf does not work at a
// building's size but its proportions can carry across. Each gene has the range found in nature
// and the range carried into the design, and says which setting of the grammar or of the site
// it changes. In the search (part B) genes are modifiers: a range added to any precedent, not
// a precedent of their own.
//
// Two kinds: performance genes (biomimicry: they move a score the engine measures, or could)
// and experience genes (biophilia: what makes people feel well near nature). Two scales:
// building (one plot, one building) and site (the whole design). Confidence as in the
// library (types.ts). Researched 31 October 2026.
import type { Climate, Confidence, Figure, Mechanism, Source } from "./types.js";

/** A range: in words for the page, and as numbers when the search can use it. */
export interface GeneRange { what: string; value: string; lo?: number; hi?: number; unit?: string; conf: Confidence; src?: number }

export const GENE_KINDS = { performance: "Works better", experience: "Feels better" } as const;
export const GENE_SCALES = { building: "One building", site: "Whole site" } as const;
/** How far the engine can check a gene today: a score it already computes, a stand-in it could
 *  compute, or only the argument. */
export const MEASURED = { scored: "Scored now", proxy: "A stand-in can be scored", argued: "Argued, not scored" } as const;

export interface Gene {
  id: string;
  /** The thing in nature: "River networks". */
  element: string;
  /** The gene in plain words: "How often streams branch". */
  name: string;
  kind: keyof typeof GENE_KINDS;
  scale: keyof typeof GENE_SCALES;
  jobs: Mechanism[];
  /** How it works in nature, in two or three plain sentences. */
  nature: string;
  /** The rule, as a ratio, an angle or a share. */
  rule: string;
  natural: GeneRange;
  /** The range carried into the design, and the setting it changes (`drives`). */
  built: GeneRange & { drives: string };
  /** How it shows in a building or a site, in one or two sentences. */
  application: string;
  /** Climates where it helps; absent means anywhere. */
  climates?: Climate[];
  /** What it should change, and the engine's measure for it when there is one. */
  moves: string;
  metric?: string;
  measured: keyof typeof MEASURED;
  /** Where the popular story goes beyond the evidence. */
  myth?: string;
  figures: Figure[];
  sources: Source[];
  gaps?: string;
}

export const GENES: Gene[] = [
  // ——— Site: water ———
  {
    id: "river-branching", element: "River networks", name: "How often streams branch", kind: "performance", scale: "site", jobs: ["flood-room"],
    nature: "In a natural river network each stream of one order is fed by a nearly fixed number of streams of the order below. The ratio holds from a valley to a continent, so water is gathered in even steps.",
    rule: "Streams of one order ÷ streams of the next order up (Horton's bifurcation ratio)",
    natural: { what: "Bifurcation ratio", value: "3 to 5, mean near 3.5", lo: 3, hi: 5, conf: "medium", src: 0 },
    built: { what: "Minor drains or streets per next larger one", value: "3 to 5", lo: 3, hi: 5, conf: "assumed", drives: "street and drain hierarchy: branches per level" },
    application: "Drains and the streets that carry them branch in steps of three to five, so no main drain takes a sudden flood from twenty side drains at once.",
    moves: "Rain reaches open ground sooner and in step", metric: "runoff_path", measured: "proxy",
    myth: "Horton's ratios fit natural catchments well and urban drainage poorly: the rule is a target for design, not a description of today's cities.",
    figures: [
      { what: "Bifurcation ratio in natural networks", value: "about 3 to 5", conf: "medium", src: 0 },
      { what: "Spread in older surveys", value: "about 2 to 5, mean near 3.5", conf: "low", src: 1 },
      { what: "A semi-arid basin (river; reservoirs built on it)", value: "4.1; 5.0", conf: "medium", src: 2 },
    ],
    sources: [
      { title: "Strahler number (Wikipedia), Horton's laws", url: "https://en.wikipedia.org/wiki/Strahler_number" },
      { title: "Random self-similar trees: a mathematical theory of Horton laws (arXiv 1905.02629)", url: "https://arxiv.org/pdf/1905.02629" },
      { title: "Flood avalanches in a semiarid basin with a dense reservoir network (arXiv 1404.4232)", url: "https://arxiv.org/pdf/1404.4232" },
    ],
  },
  {
    id: "murray", element: "Leaf veins and blood vessels", name: "How pipes narrow where they split", kind: "performance", scale: "site", jobs: ["flood-room"],
    nature: "Where a vein splits, the cube of the parent's radius is close to the sum of the cubes of its branches. That is the split that moves the most fluid for the least work and material, and leaf veins and xylem follow it closely.",
    rule: "Parent radius³ = sum of the branches' radius³ (Murray's law)",
    natural: { what: "Exponent", value: "close to 3 in leaf veins; theory gives 2.9 to 3", lo: 2.9, hi: 3, conf: "medium", src: 0 },
    built: { what: "Exponent for drain widths at a join", value: "2.5 to 3", lo: 2.5, hi: 3, conf: "assumed", drives: "drain and swale widths where they join" },
    application: "Swales and drains are sized at each join from the ones that feed them, so the network carries water evenly without oversizing the trunk.",
    moves: "Drain material and land for the same flow", measured: "argued",
    myth: "Murray's law is derived for full pipes with laminar flow. Open channels follow other rules (Manning), so the exponent is a starting point to test, not a law for drains.",
    figures: [
      { what: "Leaf veins: tapering and branch area ratios", value: "in strong agreement with Murray's law", conf: "high", src: 0 },
      { what: "Exponent with vessel-wall cost (theory)", value: "2.90 to 2.94", conf: "low", src: 1 },
    ],
    sources: [
      { title: "Price, Knox and Brodribb 2013, The influence of branch order on optimal leaf vein geometries (PLOS One)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3877374/" },
      { title: "Murray's law (Wikipedia)", url: "https://en.wikipedia.org/wiki/Murray%27s_law" },
    ],
  },
  {
    id: "meander", element: "River meanders", name: "How rivers bend", kind: "performance", scale: "site", jobs: ["flood-room", "habitat"],
    nature: "Rivers of every size bend with nearly the same proportions: a full bend is about eleven channel widths long and its curve has a radius of two to three widths. The bends slow the water and spread it into the floodplain.",
    rule: "Bend length ÷ channel width; bend radius ÷ channel width",
    natural: { what: "Wavelength ÷ width; radius ÷ width", value: "10 to 14 (mean 11); 2 to 3", lo: 10, hi: 14, conf: "high", src: 0 },
    built: { what: "Bend length of a water corridor, in channel widths", value: "10 to 14, radius 2 to 3 widths", lo: 10, hi: 14, conf: "medium", src: 0, drives: "water corridor: bend length and radius" },
    application: "Streams and storm channels on a site are given room to bend at river proportions, with buildings held back from the whole belt the bends sweep, not just from the channel.",
    moves: "Floor kept dry in heavy rain", metric: "rain shock", measured: "proxy",
    figures: [
      { what: "Wavelength", value: "10 to 14 channel widths, mean about 11", conf: "medium", src: 0 },
      { what: "Radius of curvature", value: "2 to 3 channel widths", conf: "high", src: 1 },
      { what: "Later check (Williams 1986)", value: "radius ÷ width modal at 2 to 3", conf: "high", src: 2 },
    ],
    sources: [
      { title: "Leopold and Wolman 1960, River meanders (USGS record)", url: "https://pubs.usgs.gov/publication/70185557" },
      { title: "Leopold 1966, River meanders (Scientific American, pdf)", url: "https://facultyweb.kennesaw.edu/jdirnber/docs/Leopold%20Riv%20Meand%201966.pdf" },
      { title: "Williams 1986, River meanders and channel size (USGS)", url: "https://pubs.usgs.gov/publication/70015687" },
    ],
    gaps: "Meander belt width in channel widths not yet found.",
  },
  {
    id: "wetland-share", element: "Wetlands", name: "How much of a catchment is wetland", kind: "performance", scale: "site", jobs: ["storage", "flood-room", "filter"],
    nature: "Wetlands hold flood water and let it go slowly. Studies find the peak falls noticeably once wetlands cover a few per cent of a catchment, with smaller gains beyond, and more if they sit where most of the run-off passes.",
    rule: "Wetland area ÷ catchment area",
    natural: { what: "Share where peak flows clearly drop", value: "about 5 to 10%; 1.5% can cut peaks 15-20% if it takes run-off from 29% of the land", lo: 0.05, hi: 0.1, conf: "low", src: 0 },
    built: { what: "Share of the site kept as wetland or detention", value: "5 to 10%, placed low", lo: 0.05, hi: 0.1, conf: "low", drives: "ground kept for water (share), placed in valleys" },
    application: "A share of the site in the valleys is kept as wetland and pond, fed by the most land upstream, instead of the same share spread as lawns.",
    moves: "Floor kept dry in heavy rain", metric: "rain shock", measured: "scored",
    figures: [
      { what: "Upper Mississippi (Hey and Philippi 1995)", value: "7% of the watershed as wetland", conf: "low", src: 1 },
      { what: "Upper Timiș, Romania (model)", value: "gains small until wetland nears 5-10%", conf: "low", src: 2 },
      { what: "US Midwest (model)", value: "1.5% wetland fed by 29% of the land cut peaks 15-20%", conf: "medium", src: 3 },
      { what: "Novitzki 1979", value: "40% lakes and wetland: flood flows much lower", conf: "low", src: 4 },
    ],
    sources: [
      { title: "WEF Stormwater, Wetlands reduce flooding", url: "https://stormwater.wef.org/2014/09/wetlands-reduce-flooding/" },
      { title: "Landscape Architect, Flood peak flows (Hey and Philippi)", url: "https://landscapearchitect.com/landscape-articles/9708-flood-peak-flows" },
      { title: "EGU26-20280 (Upper Timiș)", url: "https://meetingorganizer.copernicus.org/EGU26/EGU26-20280.html" },
      { title: "NOAA repository, wetlands and peak flow under climate change", url: "https://repository.library.noaa.gov/view/noaa/49512" },
      { title: "Georgia Tech G-WRAP, Surface water detention", url: "https://geospatial.gatech.edu/Resources/G-WRAP/Help/SurfaceWaterDetention.html" },
    ],
    gaps: "No study in a monsoon city yet; full texts not read.",
  },
  {
    id: "forest-soil", element: "Forest floor", name: "How much rain the ground keeps", kind: "performance", scale: "site", jobs: ["recharge", "storage"],
    nature: "A forest floor of litter, roots and open soil lets most rain soak in; only a small share runs off, even in a heavy storm. Hard city ground reverses the shares.",
    rule: "Share of the year's rain kept on the land",
    natural: { what: "Run-off coefficient of woodland", value: "about 0.05 to 0.25 (5-25% runs off)", lo: 0.05, hi: 0.25, conf: "low" },
    built: { what: "Share of the year's rain held on site", value: "at least 70% (China's sponge-city target)", lo: 0.7, hi: 0.85, conf: "high", src: 0, drives: "ground kept open and planted; rain held on roofs and in courts" },
    application: "Plots and streets hold most of the year's rain in soil, ponds and roofs, as a forest floor does, instead of piping it away.",
    moves: "Floor kept dry in heavy rain; ground water recharged", metric: "rain shock", measured: "proxy",
    figures: [
      { what: "Sponge city target (volume capture ratio of annual rainfall)", value: "70%", conf: "high", src: 0 },
      { what: "Urban areas to meet it", value: "20% by 2020, 80% by 2030", conf: "high", src: 1 },
      { what: "Woodland run-off coefficient", value: "about 0.05 to 0.25", conf: "low" },
    ],
    sources: [
      { title: "Clemson dissertation on China's Sponge City volume capture ratio", url: "https://open.clemson.edu/all_dissertations/3035" },
      { title: "State Council guideline on sponge cities (gov.cn, 2015)", url: "https://english.www.gov.cn/policies/latest_releases/2015/10/16/content_281475212984264.htm" },
    ],
    gaps: "Woodland run-off coefficient is from standard rational-method tables, not yet cited; a measured figure for Deccan scrub or forest is wanted.",
  },
  {
    id: "ponds-in-series", element: "Beaver ponds", name: "Water held in a chain of small ponds", kind: "performance", scale: "site", jobs: ["storage", "flood-room", "recharge"],
    nature: "Beavers build a chain of small dams down a stream. Each pond holds some water and spills to the next, so a storm arrives later and lower downstream.",
    rule: "Ponds per length of stream; share of a storm held",
    natural: { what: "Fall in peak flows below a dam sequence", value: "up to about 60% on average across four sites", lo: 0, hi: 0.6, conf: "medium", src: 0 },
    built: { what: "Ponds in a chain along each drainage line", value: "a pond at each fall in the ground", conf: "assumed", drives: "water: ponds per valley line" },
    application: "The kere cascades of Bengaluru and the ahar-pyne of Bihar already do this: a chain of tanks, each spilling to the next. A site keeps or rebuilds the chain instead of one large pond.",
    climates: ["tropical-dry", "semi-arid", "humid-subtropical", "temperate", "continental"],
    moves: "Floor kept dry in heavy rain", metric: "rain shock", measured: "scored",
    myth: "The effect is clear for ordinary storms; for the very largest (beyond the 97th percentile) it could not be detected.",
    figures: [
      { what: "Storm events studied", value: "more than 1,000 at four sites", conf: "medium", src: 0 },
      { what: "Peak flow attenuation (BACI study)", value: "0.5 to 2.5 m³/s for large events; not detectable beyond the 97th percentile", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Puttock et al. 2021, beaver dams and flood flows (Hydrological Processes)", url: "https://onlinelibrary-wiley-com-443.webvpn.zafu.edu.cn/doi/10.1002/hyp.14017" },
      { title: "Graham et al. 2022, Exploring the dynamics of flow attenuation at a beaver dam sequence", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9828392/" },
    ],
  },
  {
    id: "riparian", element: "Riverside forest", name: "How wide the green band along a stream is", kind: "performance", scale: "site", jobs: ["filter", "flood-room", "habitat"],
    nature: "A band of trees and shrubs along a stream catches silt and nutrients, shades the water and gives wildlife a path. Most of the cleaning happens in the first tens of metres.",
    rule: "Width of the planted band each side of a stream",
    natural: { what: "Width that cleans the water well", value: "15 to 45 m each side; little gain past 70 m", lo: 15, hi: 45, unit: "m", conf: "medium", src: 0 },
    built: { what: "Green band each side of a stream or nala", value: "15 to 45 m", lo: 15, hi: 45, unit: "m", conf: "medium", src: 0, drives: "stream buffer width" },
    application: "Every stream and storm channel keeps a planted band of 15 to 45 m on each side, with paths in it and buildings behind it.",
    moves: "Cleaner water, room for floods, green within reach", metric: "valley_free", measured: "scored",
    figures: [
      { what: "Effective width for water quality", value: "15 to 45 m; gains small past 70 m", conf: "medium", src: 0 },
      { what: "Sediment removed by a 10 m band", value: "under 60%", conf: "medium", src: 0 },
      { what: "Japanese review, minimum for water quality", value: "10 to 20 m", conf: "medium", src: 1 },
      { what: "Baseline for water and basic habitat (Nebraska)", value: "15 m a side", conf: "medium", src: 2 },
    ],
    sources: [
      { title: "Chesapeake Bay riparian BMP expert panel (draft)", url: "https://www.chesapeakebay.net/channel_files/21207/riparian_bmp_panel_report_final_draft_for_awg_march_14_(2).pdf" },
      { title: "Ecology and Civil Engineering 5(2), riparian buffer review", url: "https://www.jstage.jst.go.jp/browse/ece/5/2/_contents/-char/en" },
      { title: "Riparian buffer widths for Stevens Creek (University of Nebraska)", url: "https://digitalcommons.unl.edu/envstudtheses/11" },
      { title: "Hansen et al. 2010, Riparian buffers (Victoria)", url: "https://www.ccmaknowledgebase.vic.gov.au/resources/RiparianBuffers_Report_Hansenetal2010.pdf" },
    ],
  },
  {
    id: "mangrove", element: "Mangrove forests", name: "How deep a coastal forest belt is", kind: "performance", scale: "site", jobs: ["flood-room", "habitat"],
    nature: "Mangrove roots and stems take energy out of waves. Most of the drop happens at the front edge, and wide forests calm waves almost everywhere.",
    rule: "Wave height lost per 100 m of forest",
    natural: { what: "Wave height lost over 100 m", value: "13 to 66%; over 500 m, 70% or more", lo: 0.13, hi: 0.66, conf: "medium", src: 0 },
    built: { what: "Depth of the coastal forest belt", value: "100 to 500 m", lo: 100, hi: 500, unit: "m", conf: "medium", src: 1, drives: "coastal green belt depth" },
    application: "On a sea or creek edge, a belt of mangrove 100 to 500 m deep stands in front of the first buildings, instead of a wall.",
    climates: ["tropical-wet", "tropical-dry"],
    moves: "Floor kept dry when the sea rises", metric: "sea shock", measured: "proxy",
    figures: [
      { what: "Wave height lost over 100 m (review)", value: "13 to 66%", conf: "medium", src: 0 },
      { what: "Forests over 500 m wide", value: "70% or more, anywhere (15,773 locations modelled)", conf: "medium", src: 1 },
      { what: "Storm waves over about 100 m", value: "about halved (model)", conf: "medium", src: 2 },
    ],
    sources: [
      { title: "McIvor et al. 2012, Reduction of wind and swell waves by mangroves", url: "https://library.sprep.org/sites/default/files/reduction-wind-swell-waves-by-mangvoes.pdf" },
      { title: "TU Delft repository, global mangrove wave attenuation", url: "https://repository.tudelft.nl/file/File_5ce81747-16f8-40f1-848a-708544e546f9" },
      { title: "NIOZ, mangroves and storm waves", url: "https://accept.nioz.nl/en/news-and-blogs/news/test-titel" },
    ],
  },
  // ——— Site: heat and green ———
  {
    id: "canopy-cooling", element: "Tree canopy", name: "How much of a block is under trees", kind: "performance", scale: "site", jobs: ["shade", "evaporative"],
    nature: "Leaves shade the ground and give off water by day. In one measured city, cooling grew slowly with tree cover until about 40% of a block was under canopy, then sharply.",
    rule: "Canopy cover ÷ block area",
    natural: { what: "Canopy share where cooling speeds up", value: "about 40% at block scale", lo: 0.4, hi: 0.5, conf: "medium", src: 0 },
    built: { what: "Canopy share per block", value: "30 to 40% or more", lo: 0.3, hi: 0.5, conf: "medium", src: 0, drives: "trees per block (canopy share)" },
    application: "Blocks are planted toward 40% canopy, on streets, in courts and in yards, before smaller shares are spread thinly.",
    moves: "Cooler streets by day", metric: "heat shock", measured: "proxy",
    myth: "Measured in Madison, Wisconsin, by day in summer; the threshold has not been tested in a tropical city, and the cooling is much smaller at night.",
    figures: [
      { what: "Canopy threshold", value: "about 40%, strongest at the scale of a block", conf: "medium", src: 0 },
      { what: "Air temperature difference, treed vs treeless", value: "up to 4-5 °C within a few hundred metres", conf: "medium", src: 0 },
      { what: "Critique", value: "the greatest need is below 40%", conf: "high", src: 1 },
    ],
    sources: [
      { title: "Ziter et al. 2019, PNAS (news release)", url: "https://www.sciencedaily.com/releases/2019/03/190325173305.htm" },
      { title: "Drescher 2019, PNAS commentary", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6936521/" },
    ],
  },
  {
    id: "forest-edge", element: "Forest edges", name: "How far the edge reaches into a wood", kind: "performance", scale: "site", jobs: ["shade", "evaporative", "habitat"],
    nature: "At a forest's edge, sun, wind and dry air reach in. Light falls to forest levels within 30 to 60 m; humidity can be affected more than 200 m in. Only a patch wider than twice the edge has a true cool core.",
    rule: "Patch width ÷ edge depth",
    natural: { what: "Edge depth", value: "light 30-60 m; air temperature and humidity up to 240 m", lo: 30, hi: 240, unit: "m", conf: "medium", src: 0 },
    built: { what: "Smallest width of a park meant to cool", value: "60 to 120 m (twice the light edge)", lo: 60, hi: 120, unit: "m", conf: "low", drives: "park shape: smallest width" },
    application: "Green space meant to cool is gathered into patches at least 60 to 120 m across, rather than strips, so it has an inside that the edge does not reach.",
    moves: "Cooler parks, green within reach", metric: "green_walk", measured: "proxy",
    myth: "Measured in Pacific Northwest old growth; edges in tropical forest reach two to five times further when open.",
    figures: [
      { what: "Edge effects, Douglas-fir (Chen et al. 1995)", value: "30 to more than 240 m", conf: "medium", src: 0 },
      { what: "Short-wave light", value: "interior level by 30-60 m", conf: "medium", src: 0 },
      { what: "Open vs closed edges, Amazonia", value: "2 to 5 times deeper at open edges", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Chen, Franklin and Spies 1995, Growing-season microclimatic gradients from clearcut edges", url: "https://andrewsforest.oregonstate.edu/node/14016" },
      { title: "Didham and Lawton 1999, Edge structure in tropical forest fragments", url: "https://repositorio.inpa.gov.br/handle/1/19258" },
    ],
  },
  {
    id: "forest-layers", element: "Rainforest layers", name: "How many layers a forest has", kind: "performance", scale: "site", jobs: ["shade", "mutual-shade", "habitat"],
    nature: "A tropical forest stands in four or five layers: emergent trees, canopy, understorey, shrubs and floor. Each layer shades the next, so the floor is humid, still and far cooler and darker than the top.",
    rule: "Number of height layers; share of light passed to the floor",
    natural: { what: "Layers", value: "4 to 5", lo: 4, hi: 5, conf: "medium", src: 0 },
    built: { what: "Height bands on a site or in one building", value: "3 to 5 bands", lo: 3, hi: 5, conf: "assumed", drives: "storeys: number of height bands" },
    application: "A few taller buildings stand over a canopy of mid-rise, with low buildings and gardens under it, so roofs and trees shade the ground in layers.",
    moves: "Shade on public ground; a varied skyline", metric: "height_mix", measured: "proxy",
    figures: [
      { what: "Layers", value: "emergent, canopy, understorey, (shrub), floor", conf: "medium", src: 0 },
      { what: "Temperature and humidity", value: "hottest and driest at the canopy; cooler, more humid lower down", conf: "low", src: 1 },
    ],
    sources: [
      { title: "Journal of Tropical Forest Science, vertical microclimate profile in Brunei", url: "https://jtfs.frim.gov.my/jtfs/article/download/1791/1512/1978" },
      { title: "Vernier, Amazon canopy-to-floor measurements (Peru)", url: "https://vernier.com/vernier-ideas/an-amazon-adventure-using-labquest-2" },
    ],
    gaps: "Light reaching the floor (often quoted as under 5%) not yet from a strong source.",
  },
  {
    id: "corridor", element: "Wildlife corridors", name: "How wide a green path for wildlife is", kind: "performance", scale: "site", jobs: ["habitat"],
    nature: "Animals move between patches along strips of cover. The width they need grows with their size: a metre for small rodents, hundreds of metres for large mammals.",
    rule: "Corridor width, by the animals it serves",
    natural: { what: "Width", value: "1 m (small rodents) to 250-500 m (regional fauna)", lo: 1, hi: 500, unit: "m", conf: "low", src: 0 },
    built: { what: "Width of green links between parks and streams", value: "30 to 100 m in a city (birds, small animals)", lo: 30, hi: 100, unit: "m", conf: "assumed", drives: "green link width" },
    application: "Parks, stream bands and tree-lined streets join into continuous green paths; the stream bands do double duty.",
    moves: "Wildlife moves; green within reach", metric: "green_walk", measured: "proxy",
    myth: "There are no firm rules: experts say corridor widths are educated, subjective choices.",
    figures: [
      { what: "Regional minimum (Australia)", value: "300 to 500 m; Recher 1987: 250 m", conf: "low", src: 0 },
      { what: "Beier 2019 rule of thumb (as cited)", value: "2 km for most large mammals", conf: "low", src: 1 },
      { what: "Grassland rodents", value: "1 m threshold", conf: "low", src: 2 },
    ],
    sources: [
      { title: "USDA National Agroforestry Center, corridor width", url: "https://fs.usda.gov/nac/buffers/docs/2/2.9ref.pdf" },
      { title: "Beier 2019, A rule of thumb for widths of conservation corridors", url: "https://experts.nau.edu/en/publications/a-rule-of-thumb-for-widths-of-conservation-corridors/" },
      { title: "PeerJ 14371, grassland corridor width", url: "https://peerj.com/articles/14371/graphical-abstract.pdf" },
    ],
    gaps: "An urban figure for birds and small animals in Indian cities is wanted.",
  },
  // ——— Building: air and heat ———
  {
    id: "termite-breathing", element: "Termite mounds", name: "Breathing with the day's heat swing", kind: "performance", scale: "building", jobs: ["stack", "thermal-mass"],
    nature: "A termite mound has no fan. By day the sun warms its thin outer channels and air rises in them; at night they cool and the flow turns round. The daily swing of temperature, not the insects' heat, drives the air.",
    rule: "Daily range of air temperature that drives the flow",
    natural: { what: "Flow reverses", value: "twice a day, with the sun", conf: "high", src: 0 },
    built: { what: "Daily temperature range worth using", value: "about 8 K or more", lo: 8, hi: 20, unit: "K", conf: "assumed", drives: "features: stack; thin warm outer channels; heavy inner mass" },
    application: "Thin, sunlit outer shafts pull air up by day and a heavy inner mass is flushed by cool air at night, where days and nights differ enough. Bengaluru's do.",
    climates: ["tropical-dry", "semi-arid", "hot-arid", "mediterranean"],
    moves: "Cooler rooms without fans", measured: "argued",
    myth: "The Eastgate Centre's 'termite' story told of a steady chimney driven by the colony's heat. Later work (King, Ocko and Mahadevan 2015) found living and abandoned mounds breathe alike, driven by the day-night swing.",
    figures: [
      { what: "Driver", value: "daily temperature swing; metabolic heat ruled out", conf: "high", src: 0 },
      { what: "CO₂ in the centre by day", value: "up to 4-5%", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Harvard SEAS, How termites ventilate (King, Ocko and Mahadevan 2015, PNAS)", url: "https://seas.harvard.edu/index%2Ephp/news/how-termites-ventilate" },
      { title: "Wyss Institute, termite mounds and building ventilation", url: "https://wyss.harvard.edu/news/termite-mounds-could-inspire-new-ideas-for-sustainable-building-ventilation" },
    ],
    gaps: "The smallest daily range at which this works in a building is not known; 8 K is a placeholder.",
  },
  {
    id: "burrow-wind", element: "Prairie dog burrows", name: "Openings at two heights", kind: "performance", scale: "building", jobs: ["cross-vent", "wind-catch"],
    nature: "A prairie dog burrow has two entrances, one on a higher, sharper mound. Wind speeds up over the higher one, lowering the pressure there, so air is drawn through the tunnel even in a light breeze.",
    rule: "Height and shape difference between inlet and outlet",
    natural: { what: "Flow", value: "one way through the burrow, even in light wind", conf: "medium", src: 0 },
    built: { what: "Outlet raised above inlet", value: "one storey or more", lo: 3, hi: 10, unit: "m", conf: "assumed", drives: "features: raised outlet or roof vent; low inlets" },
    application: "Rooms take air in low on one side and let it out high on the other, at a raised roof, monitor or vent that the wind passes over.",
    moves: "Air moves through rooms on still days", measured: "argued",
    figures: [
      { what: "Mechanism", value: "pressure difference from wind over unequal openings", conf: "medium", src: 0 },
      { what: "Field evidence", value: "light winds drive flow through the burrow (tracer gas)", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "AskNature, asymmetric burrow openings create passive ventilation", url: "https://asknature.org/strategy/asymmetric-burrow-openings-create-passive-ventilation/" },
      { title: "Hill, Wyse and Anderson, Animal Physiology, Box 22.2", url: "https://learninglink.oup.com/access/content/hill-4e-student-resources/hill-4e-box-extension-22-2" },
    ],
    gaps: "Measured mound height differences not found.",
  },
  {
    id: "cactus-ribs", element: "Cactus ribs", name: "A pleated skin", kind: "performance", scale: "building", jobs: ["shade", "mutual-shade"],
    nature: "A barrel cactus's ribs shade part of its own skin all day and give 54% more surface to lose heat to the air than a smooth stem. Without ribs and spines, a model put its daytime surface 5 °C hotter.",
    rule: "Extra skin area from pleating; share of skin in its own shade",
    natural: { what: "Extra area for losing heat", value: "54% over a smooth stem", lo: 0.54, hi: 0.54, conf: "medium", src: 0 },
    built: { what: "Fin or pleat depth ÷ spacing on sunny walls", value: "0.5 to 1", lo: 0.5, hi: 1, conf: "assumed", drives: "façade fins: depth and spacing" },
    application: "East and west walls are folded or finned so part of them is always in their own shade, and the folds lose heat to moving air.",
    climates: ["hot-arid", "semi-arid", "tropical-dry"],
    moves: "Less heat through the walls", measured: "argued",
    figures: [
      { what: "Ribs: area for convective heat loss", value: "+54% (Ferocactus acanthodes model)", conf: "medium", src: 0 },
      { what: "No ribs or spines (model)", value: "daytime surface about 5 °C hotter", conf: "medium", src: 0 },
      { what: "Saguaro reflectance", value: "peak surface 3.2-3.3 °C lower", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Lewis and Nobel 1977, Thermal energy exchange model of a barrel cactus (Plant Physiology)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC542674" },
      { title: "University of Arizona thesis 1989, saguaro surface temperature", url: "https://repository.arizona.edu/handle/10150/277222" },
    ],
    gaps: "No study of saguaro pleat shading by itself; the pleat proportions for walls are placeholders.",
  },
  {
    id: "elephant-skin", element: "Elephant skin", name: "A rough skin that holds water", kind: "performance", scale: "building", jobs: ["evaporative"],
    nature: "An elephant's skin is cracked into a fine net of channels. Water and mud held in them evaporate slowly, cooling the animal long after a bath.",
    rule: "Water held by a cracked surface ÷ a flat one",
    natural: { what: "Water held", value: "5 to 10 times a flat surface", lo: 5, hi: 10, conf: "low", src: 0 },
    built: { what: "Wall and paving texture that holds water", value: "grooved or porous; wetted in the hot season", conf: "assumed", drives: "surface: porous, textured, wetted" },
    application: "Porous brick, terracotta or grooved lime walls and paving hold water from rain or a light wetting and cool by evaporation, as the jaali and khus screens of North India do.",
    climates: ["hot-arid", "semi-arid", "tropical-dry"],
    moves: "Cooler walls and air near them", measured: "argued",
    figures: [
      { what: "Water held vs flat skin", value: "5 to 10 times (press reports of the study)", conf: "low", src: 1 },
      { what: "Channels are", value: "fractures of the brittle outer skin over mm-scale bumps", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Martins et al. 2018, Locally-curved geometry generates bending cracks in the African elephant skin (Nature Communications)", url: "https://doaj.org/article/358451733a03440482d52fb7a10fc152" },
      { title: "Université de Genève, how the elephant cracks its skin to keep cool", url: "https://unige.ch/medias/en/2018/comment-lelephant-craque-sa-peau-pour-se-refroidir" },
    ],
    gaps: "The 5-10 times figure is in press coverage, not the abstract: check the paper.",
  },
  {
    id: "silver-ant", element: "Saharan silver ant", name: "A skin that reflects the sun and sheds heat to the sky", kind: "performance", scale: "building", jobs: ["reflect"],
    nature: "The ant's triangular hairs reflect visible and near-infrared sunlight and radiate the body's heat to the cold sky in the mid-infrared. Together they keep it 5 to 10 °C cooler.",
    rule: "Sunlight reflected; heat radiated (emittance)",
    natural: { what: "Body temperature lowered", value: "5 to 10 °C", lo: 5, hi: 10, unit: "°C", conf: "high", src: 0 },
    built: { what: "Roof solar reflectance", value: "0.65 or more, with high emittance", lo: 0.65, hi: 0.9, conf: "low", drives: "roof surface: reflectance" },
    application: "Roofs and the upper walls that face the sky are white or reflective and radiate heat at night; dark roofs are kept for where heat is wanted.",
    climates: ["hot-arid", "semi-arid", "tropical-dry", "tropical-wet", "mediterranean"],
    moves: "Cooler roofs and top floors", metric: "heat shock", measured: "proxy",
    figures: [
      { what: "Lower body temperature", value: "5 to 10 °C, reflection and radiation about equal", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Shi et al. 2015, Keeping cool: enhanced optical reflection and radiative heat dissipation in Saharan silver ants (Science; UW news)", url: "https://www.washington.edu/news/2015/06/18/saharan-silver-ants-use-hair-to-survive-earths-hottest-temperatures/" },
    ],
    gaps: "The 0.65 roof reflectance is the usual cool-roof rating threshold, not yet cited.",
  },
  {
    id: "leaf-size", element: "Leaf size", name: "How big the shading pieces are, by climate", kind: "performance", scale: "building", jobs: ["shade", "porous"],
    nature: "Across 7,600 species, large leaves are found where it is hot, wet and sunny; small leaves where it is hot and dry, and where it is cold. Small leaves stay close to air temperature by day and night.",
    rule: "Size of each shading element, by climate",
    natural: { what: "Leaf size", value: "large in hot-wet; small in hot-dry and cold", conf: "high", src: 0 },
    built: { what: "Shading element", value: "broad eaves and big leaves of roof in hot-wet; fine screens (jaali) in hot-dry", conf: "assumed", drives: "eave depth; façade open share and grain" },
    application: "In hot, wet places a building shades with deep eaves and big, open roofs that let air pass; in hot, dry places with fine screens and small openings.",
    moves: "The right shade for the climate", measured: "argued",
    myth: "Textbooks said small leaves avoid overheating; the study found night-time cooling and frost set the limit in much of the world.",
    figures: [
      { what: "Species studied", value: "more than 7,600", conf: "high", src: 0 },
      { what: "Driver", value: "day and night leaf-to-air temperature differences", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Wright et al. 2017, Global climatic drivers of leaf size (Science)", url: "https://spiral.imperial.ac.uk/entities/publication/eb9bfa77-c3c3-4628-bb4d-d93ad080b77d" },
      { title: "Macquarie University, The mystery of leaf size solved", url: "https://lighthouse.mq.edu.au/media-releases/migrated/2017/the-mystery-of-leaf-size-solved" },
    ],
  },
  {
    id: "stomata", element: "Leaf pores (stomata)", name: "Openings that open and close", kind: "performance", scale: "building", jobs: ["cross-vent", "porous"],
    nature: "A leaf breathes through tiny pores that cover about 1% of its surface when open. They open and close through the day with light, heat and drought.",
    rule: "Open share, changed through the day",
    natural: { what: "Open pores", value: "about 1% of the leaf when open", lo: 0.01, hi: 0.01, conf: "medium", src: 0 },
    built: { what: "Façade open share, adjustable", value: "10 to 40%, closed at midday and open at night", lo: 0.1, hi: 0.4, conf: "assumed", drives: "porosity (with shutters)" },
    application: "Walls have shutters, louvres or jaali that close against the midday sun and open to the evening breeze.",
    moves: "Air at night, shade by day", measured: "argued",
    myth: "The 1% does not carry: pores work by diffusion at a scale where air behaves differently. What carries is the opening and closing.",
    figures: [
      { what: "Open pore share", value: "about 1% (pore width 6 µm)", conf: "medium", src: 0 },
      { what: "Pores per mm²", value: "100 to 200 in many species", conf: "medium", src: 0 },
    ],
    sources: [
      { title: "Delta-T AP4 Porometer technical manual", url: "https://delta-t.co.uk/wp-content/uploads/2020/03/AP4-Porometer-Technical-Manual-v4.0.pdf" },
    ],
  },
  {
    id: "weaver-nest", element: "Sociable weaver nests", name: "Rooms buried deep in a shared mass", kind: "performance", scale: "building", jobs: ["thermal-mass", "compact", "shared"],
    nature: "Hundreds of weavers share one great thatch nest. Chambers near the centre, and those with long entrance tunnels, stay coolest by day and warmest by night, all year.",
    rule: "How deep a room sits in the mass; length of its entrance",
    natural: { what: "Buffering", value: "best at the centre and with long entrance tunnels", conf: "high", src: 0 },
    built: { what: "Rooms behind a buffer of other rooms or thick walls", value: "1 to 2 rooms deep from the outside", lo: 1, hi: 2, conf: "assumed", drives: "depth of plan; buffer rooms; deep entrances" },
    application: "Living rooms sit inside, behind stores, stairs and verandahs that take the heat; entrances are deep porches, as in a pol house or a tulou.",
    climates: ["hot-arid", "semi-arid", "continental", "cold"],
    moves: "Steadier room temperature", measured: "argued",
    figures: [
      { what: "Effect of chamber position", value: "centre and deep chambers buffer most", conf: "high", src: 0 },
      { what: "Nest volume", value: "no detectable effect", conf: "high", src: 1 },
    ],
    sources: [
      { title: "Van Dijk et al. 2020, The large communal nests of sociable weavers provide year-round insulated refuge (Frontiers)", url: "https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2020.570006/pdf" },
      { title: "Weaver news, 2012 study of nest chamber temperatures", url: "https://weavers.adu.org.za/newstable.php?id=325" },
    ],
  },
  {
    id: "huddle", element: "Penguin huddles", name: "Shared walls against the cold", kind: "performance", scale: "building", jobs: ["compact", "insulation"],
    nature: "Emperor penguins pack together in winter storms. A huddled bird has most of its surface shielded, and spends a fraction of the energy of one standing alone.",
    rule: "Share of surface shared with neighbours",
    natural: { what: "Surface shielded in a huddle", value: "about 74%", lo: 0.74, hi: 0.74, conf: "low", src: 0 },
    built: { what: "Share of walls shared with neighbours", value: "50 to 75% in cold places; lower where it is humid", lo: 0.5, hi: 0.75, conf: "assumed", drives: "gap between units (0 = shared walls); compactness" },
    application: "In cold climates units share walls in tight rows and clusters; in warm, humid ones the same gene is turned down and units stand apart to let air through.",
    climates: ["cold", "continental", "temperate"],
    moves: "Less heat lost in winter", measured: "proxy",
    figures: [
      { what: "Surface shielded", value: "about 74%", conf: "low", src: 0 },
      { what: "Cost of the cold, huddled", value: "about a quarter of a lone bird's (reported)", conf: "low", src: 0 },
    ],
    sources: [
      { title: "Journal of Experimental Biology, How huddles help penguins weather winter (Gilbert et al. 2008)", url: "https://cob.silverchair.com/jeb/article/211/1/i/17425/HOW-HUDDLES-HELP-PENGUINS-WEATHER-WINTER" },
    ],
    gaps: "Figures from a summary; the paper itself not read.",
  },
  {
    id: "tree-shade", element: "A single tree", name: "Shade with air under it", kind: "performance", scale: "building", jobs: ["shade", "evaporative"],
    nature: "A tree's crown stops 60 to 90% of the sun and lets air pass beneath. Paving in its shade can be 13 to 23 °C cooler than in the sun.",
    rule: "Share of sunlight stopped by a porous canopy",
    natural: { what: "Sunlight stopped", value: "60 to 90%", lo: 0.6, hi: 0.9, conf: "medium", src: 0 },
    built: { what: "Canopy over courts and streets", value: "60 to 90% shade, open at the sides", lo: 0.6, hi: 0.9, conf: "medium", src: 0, drives: "trees; canopy (porous roof on posts)" },
    application: "Courts, streets and roofs are shaded by trees or by porous canopies on posts that stop most of the sun and leave the sides open to the wind.",
    moves: "Shade on public ground", metric: "hot-season shade on public ground", measured: "scored",
    figures: [
      { what: "Short-wave radiation cut in tree shade", value: "60 to 90%", conf: "medium", src: 0 },
      { what: "Asphalt cooled under trees (Florence)", value: "13.8 to 22.8 °C", conf: "medium", src: 1 },
      { what: "Surface under the canopy (Sydney, 471 trees)", value: "the surface matters more than the species", conf: "high", src: 2 },
    ],
    sources: [
      { title: "Arboriculture and Urban Forestry 39(4), street tree cooling", url: "https://auf.isa-arbor.com/content/39/4/157" },
      { title: "Forests 16, 1408 (2025), tree shade and surface temperature", url: "https://mdpi-res.com/d_attachment/forests/forests-16-01408/article_deploy/forests-16-01408.pdf" },
      { title: "Western Sydney University, Temperature reduction in urban surface materials through tree shade", url: "https://researchers.westernsydney.edu.au/en/publications/temperature-reduction-in-urban-surface-materials-through-tree-sha/" },
    ],
  },
  {
    id: "phyllotaxis", element: "Leaf arrangement", name: "Each floor turned from the last", kind: "performance", scale: "building", jobs: ["mutual-shade", "solar"],
    nature: "Many plants place each leaf about 137.5° round from the one below, the golden angle, so that no leaf sits directly over another for many turns.",
    rule: "Turn between one leaf (or floor) and the next",
    natural: { what: "Divergence angle", value: "137.5° in many plants", lo: 137.5, hi: 137.5, unit: "°", conf: "high", src: 0 },
    built: { what: "Turn between floors or units", value: "any of several angles; 137.5° one of them", lo: 0, hi: 180, unit: "°", conf: "low", src: 0, drives: "turn between floors or units" },
    application: "Floors, balconies or units are turned from the ones below so each gets sky and the one below gets light.",
    moves: "Daylight and sky for each floor", metric: "sky view from the street", measured: "proxy",
    myth: "The golden angle is widely called optimal for light. Strauss et al. (2020) found several angles do as well as leaves increase; leaf shape matters more.",
    figures: [
      { what: "Golden angle", value: "137.5°", conf: "high", src: 0 },
      { what: "Is it optimal for light?", value: "contested: several angles near-optimal", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Strauss et al. 2020, Phyllotaxis: is the golden angle optimal for light capture? (New Phytologist)", url: "https://algorithmicbotany.org/papers/Strauss2019pit.html" },
    ],
  },
  {
    id: "fog-catch", element: "Namib desert beetle", name: "Combing water from fog", kind: "performance", scale: "building", jobs: ["rain-harvest"],
    nature: "In the Namib, beetles and plants catch water from fog blowing in from the sea. People do the same with fine nets set across the wind.",
    rule: "Water caught per square metre of net per day",
    natural: { what: "Fog net yield", value: "2 to 5 L/m² a day on average; up to 10", lo: 2, hi: 5, unit: "L/m²/day", conf: "medium", src: 0 },
    built: { what: "Mesh on high edges facing the fog", value: "where fog is frequent", conf: "assumed", drives: "features: fog mesh" },
    application: "On foggy coasts and hills, nets on roofs and high edges catch water for gardens. Not useful in Bengaluru.",
    climates: ["hot-arid", "cold", "mediterranean"],
    moves: "Water gathered without rain", measured: "argued",
    figures: [
      { what: "Average yield", value: "2 to 5 L/m² a day, peaks to 10", conf: "medium", src: 0 },
      { what: "Atacama, year-long study", value: "up to 10 L/m² a day; 2.5 planned", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Fog collection (Wikipedia)", url: "https://en.wikipedia.org/wiki/Fog_collection" },
      { title: "Scientific American, Fog for a thirsty planet", url: "https://www.scientificamerican.com/article/fog-for-a-thirsty-planet" },
    ],
  },
  // ——— Building: structure ———
  {
    id: "tree-branching", element: "Tree branches", name: "Columns that branch like trees", kind: "performance", scale: "building", jobs: ["structure"],
    nature: "Leonardo noticed that where a branch splits, the branches' cross-sections add up to the trunk's. Trees seem to follow it to resist wind with the least wood.",
    rule: "Sum of the branches' area ÷ the trunk's area (exponent 2)",
    natural: { what: "Exponent", value: "about 2, varies by species", lo: 2, hi: 2, conf: "medium", src: 0 },
    built: { what: "Branching columns under a roof", value: "area kept at each split", lo: 1.8, hi: 2.5, conf: "assumed", drives: "canopy on posts: branching supports" },
    application: "Wide roofs and canopies stand on columns that branch, so fewer posts stand on the ground and the roof is held at many points.",
    moves: "Material for the same span; open ground below", measured: "argued",
    myth: "Reviews find the rule does not hold in general; it depends on species and branch length.",
    figures: [
      { what: "Leonardo's rule", value: "exponent 2 (Murray's law for flow: 3)", conf: "medium", src: 0 },
      { what: "Why", value: "wind loads on a self-similar tree (Eloy)", conf: "medium", src: 1 },
    ],
    sources: [
      { title: "Leonardo vindicated: Pythagorean trees for natural branching (arXiv 2411.08024)", url: "https://arxiv.org/pdf/2411.08024" },
      { title: "Eloy 2011, Leonardo's branching rule in trees: how self-similar structures resist wind (APS)", url: "https://meetings-archive.aps.org/dfd/2011/l24/6" },
    ],
  },
  {
    id: "lily-ribs", element: "Giant water lily", name: "A thin roof held by deep ribs", kind: "performance", scale: "building", jobs: ["structure"],
    nature: "The Amazon water lily's leaf is thin but wide enough to carry a child, held flat by deep girder-like veins that radiate from the stem and are tied by smaller cross ribs.",
    rule: "Deep radial ribs tied by cross ribs under a thin skin",
    natural: { what: "Load a leaf carries", value: "reports vary, about 35 to 45 kg", conf: "low", src: 0 },
    built: { what: "Ribbed roof or canopy", value: "radial ribs with cross ties", conf: "assumed", drives: "roof: ribbed shell or canopy" },
    application: "Light roofs over markets and public halls are ribbed like the leaf. Paxton's Crystal Palace came from it.",
    moves: "Wide spans with little material", measured: "argued",
    figures: [
      { what: "Vein pattern", value: "girder-like radial veins crossed at right angles", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Box et al. 2022, The giant water lily: its leaf structure and mechanics (PMC)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8827653" },
      { title: "The Garden History, Joseph, Victoria and the amazing leaf", url: "https://thegardenhistory.blog/2018/07/14/joseph-victoria-and-the-amazing-leaf" },
    ],
    gaps: "Rib depth ÷ span not yet found.",
  },
  // ——— Experience ———
  {
    id: "three-thirty-three-hundred", element: "Trees around a home", name: "3 trees in view, 30% canopy, a park in 300 m", kind: "experience", scale: "site", jobs: ["restore", "shade"],
    nature: "People are healthier where they see trees from home, live under a fair canopy and can walk to a park. The 3-30-300 rule puts the three findings into one target.",
    rule: "Trees seen from each home; canopy share; distance to a public green",
    natural: { what: "Targets", value: "3 trees; 30% canopy; 300 m", conf: "high", src: 0 },
    built: { what: "Distance from each home to a public green", value: "300 m or less", lo: 0, hi: 300, unit: "m", conf: "high", src: 0, drives: "park placement; trees per street" },
    application: "Every home sees at least three trees, every neighbourhood has 30% canopy, and every door is within 300 m of a park.",
    moves: "Green within reach and in view", metric: "green_walk", measured: "scored",
    myth: "The evidence for 30 and 300 is called strong; the 3 trees in view less so. Only 1.7% of people in 894 European cities meet all three.",
    figures: [
      { what: "Rule", value: "3 trees in view, 30% canopy, 300 m to a green", conf: "high", src: 0 },
      { what: "Europe, people meeting all three", value: "1.7% (conference abstract)", conf: "low", src: 1 },
    ],
    sources: [
      { title: "Konijnendijk 2022, Evidence-based guidelines for greener, healthier, more resilient neighbourhoods: the 3-30-300 rule", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9415244/" },
      { title: "EGU25-19320, 3-30-300 across 894 European cities", url: "https://meetingorganizer.copernicus.org/EGU25/EGU25-19320.html" },
    ],
  },
  {
    id: "fractal", element: "Fractal patterns", name: "How rough a skyline or edge is", kind: "experience", scale: "site", jobs: ["restore"],
    nature: "Coastlines, clouds, trees and savannah repeat their shape at many scales. Patterns of a middling roughness, fractal dimension 1.3 to 1.5, are the ones people prefer and find calming.",
    rule: "Fractal dimension D of a skyline, a roofline or a planted edge",
    natural: { what: "Preferred and calming range", value: "D 1.3 to 1.5", lo: 1.3, hi: 1.5, conf: "medium", src: 0 },
    built: { what: "Skyline and edge roughness", value: "D 1.3 to 1.5", lo: 1.3, hi: 1.5, conf: "medium", src: 0, drives: "height and roof variety; edge setbacks" },
    application: "Skylines, rooflines and the edges of streets step and vary at several scales, neither flat nor chaotic, like a tree line.",
    moves: "Calmer, more liked places", metric: "levels of scale", measured: "proxy",
    myth: "The stress figure (recovery up to 60% better) comes from small studies (24 people in one); the preference for 1.3-1.5 is more robust.",
    figures: [
      { what: "Range", value: "D 1.3 to 1.5 (Wise and Taylor 2002; Taylor 2005)", conf: "medium", src: 0 },
      { what: "Stress recovery", value: "up to 60% better (small samples)", conf: "low", src: 1 },
    ],
    sources: [
      { title: "Taylor, feel-good fractals (summary)", url: "https://brewminate.com/feel-good-fractals-from-ocean-waves-to-jackson-pollocks-art/" },
      { title: "Taylor, US patent 8939885, eliciting a relaxation response", url: "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8939885" },
    ],
    gaps: "Primary papers (Taylor 2005, Nonlinear Dynamics, Psychology and Life Sciences) to read.",
  },
  {
    id: "prospect-refuge", element: "The forest's edge", name: "A sheltered place with a view", kind: "experience", scale: "building", jobs: ["restore"],
    nature: "People, like many animals, feel safest at an edge: back covered and something overhead, looking out over open ground. Appleton called it prospect and refuge.",
    rule: "Share of a public space that is sheltered edge facing an open view",
    natural: { what: "Pattern", value: "a protected back and canopy, an open view", conf: "medium", src: 0 },
    built: { what: "Edges of courts and parks", value: "arcades, verandahs and alcoves facing open ground", conf: "assumed", drives: "features: arcade; eave; court size" },
    application: "Courts and parks are edged with verandahs, arcades and window seats that look out over the open middle.",
    moves: "Public space people stay in", measured: "argued",
    figures: [
      { what: "Terrapin's 14 patterns", value: "Prospect (11) and Refuge (12) under 'Nature of the space'", conf: "high", src: 0 },
    ],
    sources: [
      { title: "Terrapin Bright Green 2014, 14 patterns of biophilic design", url: "https://www.terrapinbrightgreen.com/blog/2014/09/release-of-14-patterns/" },
    ],
    gaps: "No quantitative target found.",
  },
  {
    id: "water-in-view", element: "Water", name: "Water seen and heard", kind: "experience", scale: "site", jobs: ["restore", "evaporative"],
    nature: "Scenes with water, natural or built, are preferred and rated more restorative than those without, in studies across many countries.",
    rule: "Share of homes and public spaces with water in view",
    natural: { what: "Effect", value: "more preferred and restorative with water", conf: "medium", src: 0 },
    built: { what: "Walk to water from each home", value: "300 m or less", lo: 0, hi: 300, unit: "m", conf: "assumed", drives: "where water is kept and opened up" },
    application: "Tanks, streams and ponds that hold the rain are opened to view and to paths, not fenced and hidden.",
    moves: "Water within reach and in view", metric: "water_walk", measured: "scored",
    myth: "A 2012 UK review found the health evidence for blue space weak; newer surveys are stronger but still mostly self-reported.",
    figures: [
      { what: "Built scenes with water", value: "rated as restorative as green space", conf: "medium", src: 1 },
      { what: "19-country survey (17,131 people)", value: "all water settings recalled as restorative", conf: "medium", src: 0 },
    ],
    sources: [
      { title: "UW Nature and Health, the restorative power of blue spaces: a 19-country study", url: "https://natureandhealth.uw.edu/news/the-restorative-power-of-blue-spaces-a-19-country-study/" },
      { title: "Biophilic Cities, research on the restorative power of the urban blue", url: "https://biophiliccities.org/research-on-the-restorative-power-of-the-urban-blue" },
    ],
  },
];
