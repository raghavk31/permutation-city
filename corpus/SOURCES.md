# Corpus sources

The original documents behind the corpus. The PDFs are large, so they are not committed:
they live in `corpus/_sources/` (git-ignored). To get them again, run this from the repo root:

```bash
mkdir -p corpus/_sources && cd corpus/_sources
curl -L -o mumbai-dcpr-2034.pdf "https://data.opencity.in/dataset/a87139ae-0604-47fd-9748-aea3e35c9cdb/resource/c16ff00a-40fb-469e-8684-431cd019b5b8/download/3f0f81f7-a89d-4540-a772-10829c562f77.pdf"
curl -L -o gujarat-cgdcr-2017-part2.pdf "https://ahmedabadcity.gov.in/Uploads/FormsFonts/Town%20Development%20Department%20(B.P.S.P.)/Final_Notification_CGDCR_2017_PART_II_PLANNING_REGULATION_min.pdf"
curl -L -o guwahati-byelaws-2014.pdf "https://gmda.assam.gov.in/sites/default/files/GUWAHATI-BUILDING-CONSTRUCTION-BYELAWS-2014.pdf"
# Bengaluru: BBMP's and BDA's own sites did not answer on 2026-10-27; these are Internet Archive copies
curl -L -o bengaluru-rmp2015-zoning.pdf "https://web.archive.org/web/20250325225114id_/https://site.bbmp.gov.in/PDF/townplanning/Zoning_Regulations_RMP2015f%20(1).pdf"
curl -L -o bengaluru-bda-zoning-amendments.pdf "https://web.archive.org/web/20220614102228id_/https://bdabangalore.org/uploads/files/TPM_Documents/Amendments_to_Zoning_Regulation_All.pdf"
curl -L -o bengaluru-building-byelaws-2003.pdf "https://web.archive.org/web/20250417153022id_/https://site.bbmp.gov.in/PDF/Bangalore-Building-Byelaws-%202003.pdf"
curl -L -o karnataka-ktcda-amendment-2025.pdf "https://data.opencity.in/dataset/2a2c0701-853e-4db3-b1d4-06ee8674c628/resource/ffff8ed9-228d-42a2-a596-3b4c06a8d726/download/lake-tank-buffer.pdf"
```

Phase 4 turned these into markdown notes in `corpus/regulations/`. Each note cites a
regulation number and page (PDF page and printed page), and covers only the rules the
engine can use (FSI, ground coverage, margins, heights, open space, road widths). Where the
PDF prints an amendment as both the old and new value (for example "two three times"), the
note says so and asks for the notified figure to be checked.

| File | Document | Edition | Got it from | Licence |
|---|---|---|---|---|
| `mumbai-dcpr-2034.pdf` | Development Control and Promotion Regulations 2034 for Greater Mumbai (MCGM), 513 pages. It opens with the Marathi notification; the regulations are in English. | As notified in 2018. Later amendments (for example to 33(7), 33(9), 33(24) and 14(A)) are not included. | [OpenCity](https://data.opencity.in/dataset/mumbai-dcpr-development-control-and-promotion-regulation-2034), which cites [portal.mcgm.gov.in](https://portal.mcgm.gov.in) | Public domain, as listed on OpenCity |
| `gujarat-cgdcr-2017-part2.pdf` | Comprehensive General Development Control Regulations 2017, Part II: Planning Regulations (UD and UHD, Government of Gujarat), 76 pages. These apply in AMC and AUDA areas. | As modified up to October 2019. Parts I (administration) and III are not included. | [Ahmedabad Municipal Corporation](https://ahmedabadcity.gov.in) | Government notification |
| `guwahati-byelaws-2014.pdf` | Guwahati Building Construction (Regulation) Bye-laws 2014 (GMDA), 146 pages. Used for the hill rules: 74 (no building on slopes over 45° unless proved safe), 110 (hilly areas: protection over 10°, cutting up to 6 m, 30% of a plot under vegetation), 117 (no multistoreyed building on hills needing excavation, or on notified forest land). | As published on GMDA's site, read 2026-10-22. | [gmda.assam.gov.in](https://gmda.assam.gov.in/portlets/bye-laws) | Government notification |
| `bengaluru-rmp2015-zoning.pdf` | Revised Master Plan 2015 Bangalore, Volume III: Zoning of Landuse and Regulations (BDA), 60 pages | As approved 22-06-2007 (G.O. UDD 540 BEM AA SE 2004), without later amendments | BBMP town planning page, via the Internet Archive (2025-03-25) | Government notification |
| `bengaluru-bda-zoning-amendments.pdf` | The same regulations with BDA's compiled amendments appended (2018 Impact Zone Premium FAR in English; the rest scanned, mostly Kannada) | As compiled by 2022 | BDA, via the Internet Archive (2022-06-14) | Government notification |
| `bengaluru-building-byelaws-2003.pdf` | Bangalore Mahanagara Palike Building Bye-laws 2003 | As published by BBMP | BBMP, via the Internet Archive (2025-04-17) | Government notification |
| `karnataka-ktcda-amendment-2025.pdf` | Karnataka Tank Conservation and Development Authority (Amendment) Act 2025, Karnataka Act No. 19 of 2026: lake buffers graded by tank area | Gazette Extraordinary No. 160, 18-02-2026 (Kannada and the authorised English translation) | [OpenCity](https://data.opencity.in/dataset/karnataka-tank-conservation-and-development-authority-amendment-bill-2025) | Government notification |

Both PDFs contain real text, not scans, so `pdftotext` can read them. Before quoting any
figure in the app, check it against the latest amendments.

## The rest of the corpus

Every corpus file states its source, reference and licence in its front matter, and says
when and how it was checked. `npm run corpus` (in `app/`) turns the files into
`app/api/_corpus.ts`, the snippets the brief compiler retrieves from.

| Folder | What | Source |
|---|---|---|
| `regulations/` | Mumbai DCPR 2034 (FSI, open space, margins and heights) and Gujarat CGDCR 2017 (FSI, height and margins, common plot, Gandhi Ashram, riverfront and restricted zones) | the two PDFs above |
| `regulations/` (2026-10-27) | IRC:SP:118-2018 street templates (cross-sections); the open space hierarchy (URDPFI 2015 as reproduced by NIUA's child-friendly parks guide; Correa's levels) | `_sources/irc-sp-118-2018.pdf`; the NIUA guide (niua.in, not copied) |
| `cept/` | Sem 06 (densification at Wadaj; the evolutionary workshop and block evolution) and Sem 07 (Eco-machine) | the studio reports and presentations under `D:\Work\Academic-CEPT\` (not copied into the repo), quoted with credit to the studio, semester and tutors |
| `typologies/` | courtyard, L, U, tower, slab, podium and tower | Sem 06 report, CGDCR 6.14.2, DCPR Reg. 27; the slab entry is the author's |
| `patterns/` | six cards from *A Pattern Language* (21, 60, 61, 106, 107, 159) | paraphrased, no quotation; page numbers and dimensions not yet checked against the book (see `docs/alexander.md`) |
| `sites/` | Mumbai tide, surge and sea-level rise | two news reports of official figures (a 2019 Rajya Sabha answer citing INCOIS; the Maharashtra Maritime Board shoreline plan); the primary documents were not found |
