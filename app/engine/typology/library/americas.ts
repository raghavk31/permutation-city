// The typology library: Americas (docs/typologies.md). Figures carry their source and
// confidence; seed numbers not taken from a figure are placeholders, said so in `seedNote`.
import type { Precedent } from "../types.js";
import { src } from "./src.js";

export const AMERICAS: Precedent[] = [
  {
    id: "quinta-monroy", name: "Quinta Monroy", place: "Iquique, Chile", region: "Americas", at: [-70.14, -20.22],
    era: "2003-04", climate: "hot-arid", programmes: ["housing"], modern: true,
    mechanisms: ["incremental", "shared"],
    materials: ["concrete block", "timber"],
    summary: "ELEMENTAL's 'half of a good house': the hard half built, the other half left for families to finish.",
    how: "The subsidy paid for kitchens, bathrooms, stairs and structure; the frame leaves a gap beside each house for the family to fill. 92 of 93 households did.",
    lesson: "Build the half families can't (structure, kitchen, bathroom) and leave room in the frame for the half they can.",
    figures: [
      { what: "Families", value: "93, on about 5,000 m²", conf: "high", src: 0 },
      { what: "House", value: "36 m² built, 70 m² extended", conf: "high", src: 0 },
      { what: "Duplex", value: "25 m² built, 72 m² extended", conf: "high", src: 0 },
      { what: "Households that extended", value: "92 of 93", conf: "high", src: 1 },
    ],
    seed: { arrangement: "row", width: 6, depth: 6, storeys: 3, count: 8, rows: 2, street: 6, gap: 3, roof: "flat", porosity: 0.2 },
    seedNote: "Built halves 6 × 6 m with gaps of 3 m to fill (approximate).",
    sources: [
      src("Arquitectura Viva, Quinta Monroy housing", "https://arquitecturaviva.com/works/viviendas-quinta-monroy-1"),
      src("Redalyc study of Quinta Monroy's extensions", "https://www.redalyc.org/journal/1931/193165650024/html/"),
    ],
  },
  {
    id: "chinampa", name: "Chinampa", place: "Xochimilco, Mexico City", region: "Americas", at: [-99.1, 19.26],
    era: "Aztec period; still farmed", climate: "temperate", programmes: ["food", "water"],
    mechanisms: ["loop", "flood-room", "raised"],
    materials: ["lake mud", "reed wattle", "willow"],
    summary: "Long narrow fields built up out of a shallow lake, separated by canals and anchored by willows.",
    how: "Each bed is made from lake mud and plants, so it is always moist and fertile. The canals are the roads and carry away floodwater.",
    lesson: "Build fields from the lake's own mud between canals: always moist, fertile, and a flood buffer.",
    figures: [
      { what: "Typical bed", value: "about 30 × 2.5 m", conf: "medium", src: 0 },
      { what: "Tenochtitlan beds", value: "90 × 5 m to 90 × 10 m", conf: "medium", src: 0 },
      { what: "Canals", value: "4-6 m wide", conf: "medium", src: 1 },
      { what: "Harvests", value: "up to seven a year with rotations (modern)", conf: "low", src: 2 },
    ],
    seed: { arrangement: "ponds", width: 8, depth: 90, storeys: 0, count: 6, rows: 1, street: 5, trees: 14 },
    seedNote: "Bed and canal sizes from the figures.",
    sources: [
      src("Chinampa, Wikipedia", "https://en.wikipedia.org/wiki/Chinampa"),
      src("FAO GIAHS, Chinampas agricultural system", "https://sfcs.fao.org/giahs/giahs-around-the-world/mexico-chinampas-agricultural-system/en"),
      src("ScienceBlog, Aztec chinampas", "https://scienceblog.com/t-aztec-chinampa-seven-harvests-floating-lake-gardens/"),
    ],
  },
  {
    id: "hydroponic", name: "Hydroponic greenhouse", place: "anywhere; figures from Arizona and India", region: "Americas", at: [-114.62, 32.69],
    era: "late 20th century onwards", climate: "hot-arid", programmes: ["food"], modern: true,
    mechanisms: ["loop", "storage"],
    materials: ["steel", "polycarbonate or glass"],
    summary: "Food grown in water and nutrients under cover, close to where people live.",
    how: "Up to ten times the yield per m² of a field, for a fraction of the water. In a hot climate the energy to cool it is the cost.",
    lesson: "Food can be grown close to people with a fraction of the water; in the tropics the cooling energy is the cost.",
    figures: [
      { what: "Lettuce yield, modelled (Arizona)", value: "41 ± 6 kg/m²/yr, against 3.9 in a field", conf: "medium", src: 0 },
      { what: "Water, modelled (Arizona)", value: "20 L/kg", conf: "medium", src: 0 },
      { what: "Water, India, closed loop", value: "85 L/kg, against 1,146 L/kg in furrow fields", conf: "medium", src: 1 },
      { what: "Energy, India", value: "66 MJ/kg", conf: "medium", src: 1 },
    ],
    seed: { arrangement: "shed", width: 8, depth: 40, storeys: 1, floorH: 4.5, count: 5, street: 8, roof: "gable", porosity: 0.1 },
    seedNote: "Bay sizes assumed.",
    sources: [
      src("Barbosa et al. (2015). Lettuce grown using hydroponic vs. conventional methods", "https://pmc.ncbi.nlm.nih.gov/articles/PMC4483736/"),
      src("Karimzadeh and Rulli (2025), lettuce water use by system and country", "https://re.public.polimi.it/handle/11311/1313676"),
    ],
  },
  {
    id: "tube-station", name: "Tube station", local: "estação-tubo", place: "Curitiba, Brazil", region: "Americas", at: [-49.27, -25.43],
    era: "1991 onwards", climate: "temperate", programmes: ["mobility"], modern: true,
    mechanisms: ["shared"],
    materials: ["steel", "glass"],
    summary: "A glass tube at platform height where passengers pay before the bus arrives, so boarding takes seconds.",
    how: "Paying before boarding and stepping in level with the bus floor gave Curitiba rail-like speed with buses. Stations sit about every 500 m on the main routes.",
    lesson: "Pay before boarding and step in level with the bus: rail-like speed with buses.",
    figures: [
      { what: "Stations", value: "342; 78 km of BRT corridors (2025)", conf: "high", src: 0 },
      { what: "Spacing", value: "about 500 m", conf: "low", src: 1 },
      { what: "Largest station (2026)", value: "91 m long, about 22,000 passengers a day", conf: "medium", src: 1 },
    ],
    seed: { arrangement: "canopy", width: 30, depth: 3.5, storeys: 1, floorH: 3.5, count: 1, street: 7 },
    seedNote: "Length assumed for a typical station.",
    sources: [
      src("URBS Curitiba, transit concession presentation (2025)", "https://www.urbs.curitiba.pr.gov.br/PORTAL/licitacaoTransporteColetivo/doc/RoadShowPresentationEN.pdf"),
      src("Prefeitura de Curitiba, new tube station at Praça Eufrásio Correia", "https://www.curitiba.pr.gov.br/noticias/nova-estacao-tubo-da-praca-eufrasio-correia-comeca-a-ser-instalada/84249"),
    ],
  },
];
