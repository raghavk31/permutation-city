# Corpus sources

The original documents behind the corpus. The PDFs are large, so they are not committed:
they live in `corpus/_sources/` (git-ignored). To get them again, run this from the repo root:

```bash
mkdir -p corpus/_sources && cd corpus/_sources
curl -L -o mumbai-dcpr-2034.pdf "https://data.opencity.in/dataset/a87139ae-0604-47fd-9748-aea3e35c9cdb/resource/c16ff00a-40fb-469e-8684-431cd019b5b8/download/3f0f81f7-a89d-4540-a772-10829c562f77.pdf"
curl -L -o gujarat-cgdcr-2017-part2.pdf "https://ahmedabadcity.gov.in/Uploads/FormsFonts/Town%20Development%20Department%20(B.P.S.P.)/Final_Notification_CGDCR_2017_PART_II_PLANNING_REGULATION_min.pdf"
```

Phase 4 turns these into markdown notes in `corpus/`. Each note cites a regulation number
and page, and covers only the rules the engine can use (FSI, ground coverage, margins,
heights, open space, road widths).

| File | Document | Edition | Got it from | Licence |
|---|---|---|---|---|
| `mumbai-dcpr-2034.pdf` | Development Control and Promotion Regulations 2034 for Greater Mumbai (MCGM), 513 pages. It opens with the Marathi notification; the regulations are in English. | As notified in 2018. Later amendments (for example to 33(7), 33(9), 33(24) and 14(A)) are not included. | [OpenCity](https://data.opencity.in/dataset/mumbai-dcpr-development-control-and-promotion-regulation-2034), which cites [portal.mcgm.gov.in](https://portal.mcgm.gov.in) | Public domain, as listed on OpenCity |
| `gujarat-cgdcr-2017-part2.pdf` | Comprehensive General Development Control Regulations 2017, Part II: Planning Regulations (UD and UHD, Government of Gujarat), 76 pages. These apply in AMC and AUDA areas. | As modified up to October 2019. Parts I (administration) and III are not included. | [Ahmedabad Municipal Corporation](https://ahmedabadcity.gov.in) | Government notification |

Both PDFs contain real text, not scans, so `pdftotext` can read them. Before quoting any
figure in the app, check it against the latest amendments.
