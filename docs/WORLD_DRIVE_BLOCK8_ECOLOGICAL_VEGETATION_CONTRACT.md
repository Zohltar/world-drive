# World Drive — Block 8 ecological vegetation contract

Status: candidate-only research/authoring contract. This document does **not**
move placement authority away from the accepted R4 forest roots and does not claim
present-day land-cover reconstruction.

## Rule

RESOLVE 2017 supplies biome/ecoregion identity. That identity is the first gate, not
a visual stereotype. A vegetation family may be rendered only when its physiognomy
is compatible with the biome and, for explicit pilots, with reviewed regional/local
ecological evidence.

Permanent authoring rules:

- biome selects broad vegetation structure, never exact local species abundance;
- ecoregion/local evidence narrows allowed tree, shrub and ground-cover families;
- R4 placement/exclusions/density remain authoritative until a separately reviewed
  mapped land-cover source is approved;
- deterministic art weights are labelled visual weights, not measured habitat or
  species percentages;
- dry/Mediterranean/desert classification does **not** imply cactus; succulents need
  regional evidence;
- humid tropical forest needs layered broadleaf structure; palms, bamboo, tree ferns
  and epiphytes are regional features, not universal tropical defaults;
- seasonal foliage/snow is used only when a reviewed seasonal presentation exists;
- when local evidence conflicts with a generic biome stereotype, local evidence wins.

## Conservative biome baseline

| RESOLVE biome | Vegetation families allowed as baseline |
| --- | --- |
| 1 Tropical/subtropical moist broadleaf | evergreen/semievergreen broadleaf canopy and humid understory; regional palms/tree-ferns/bamboo/epiphytes only when supported |
| 2 Tropical/subtropical dry broadleaf | deciduous/semideciduous broadleaf, seasonal scrub and grasses |
| 3 Tropical/subtropical conifer | conifer-dominant with regionally supported broadleaf associates |
| 4 Temperate broadleaf/mixed | broadleaf/deciduous forest, regionally supported conifers, shrubs/ferns/herbs |
| 5 Temperate conifer | conifer-dominant forest with local shrub/herb understory |
| 6 Boreal/taiga | spruce/fir/pine/larch families by ecoregion, deciduous associates, moss/lichen ground layer |
| 7 Tropical/subtropical grassland/savanna | grass-dominant open cover; scattered trees/shrubs only when regionally supported |
| 8 Temperate grassland/savanna | grass/herb dominant; trees need woodland/riparian evidence |
| 9 Flooded grassland/savanna | grasses/sedges/wetland cover; woody cover only where supported |
| 10 Montane grassland/shrubland | grasses, herbs, dwarf shrubs and rock; trees need local/treeline evidence |
| 11 Tundra | mosses, lichens, sedges and dwarf shrubs; no ordinary trees |
| 12 Mediterranean forest/woodland/scrub | evergreen sclerophyll shrubs, open woodland, seasonal dry grasses; no default cactus |
| 13 Desert/xeric scrub | xeric shrubs/grasses/succulents; cactus only in ecoregions where it occurs |
| 14 Mangrove | mangrove tree/shrub forms with coastal/intertidal regional support |
| 98 Rock/ice | rock/ice; no generic vegetation |

The maintained taxonomy is the 14-biome / 846-ecoregion RESOLVE 2017 framework:
https://academic.oup.com/bioscience/article/67/6/534/3102935

## Current pilot calibration

### Nordschleife — ecoregion 686 / biome 4

Eifel National Park describes the natural post-glacial forest as deciduous and
beech-dominated. Spruce expanded mainly through historical reforestation and is
explicitly described as non-native. R18 therefore remains broadleaf-dominant;
conifers are secondary rather than the natural baseline. Shrubs/ferns are compatible
understory forms but must not become a uniform hedge.

Sources:
- https://www.nationalpark-eifel.de/en/nature-landscapes/habitats/forests/
- https://www.nationalpark-eifel.de/en/nature-landscapes/conservation/

### Manic — ecoregion 373 / biome 6

Québec boreal references support conifer dominance with black spruce and balsam fir,
plus white spruce/pine/larch and paper birch/aspen varying with domain, moisture and
disturbance. Moss/lichen ground layers are characteristic in relevant domains.
R13's conifer dominance is compatible at family level. A later diversity pass should
separate spruce/fir silhouettes and occasional deciduous associates rather than claim
that one generic conifer represents the complete local flora.

Sources:
- https://mrnf.gouv.qc.ca/documents/forest/boreal-forest.pdf
- https://mrnf.gouv.qc.ca/documents/forest/understanding/research/RAD_Canadian_Nat_veg_class_201911_ANG.pdf
- https://mrnf.gouv.qc.ca/en/our-publications/competitive-advantage-black-spruce-balsam-fir/

### Laguna Seca / Fort Ord — ecoregion 423 / biome 12

BLM describes Fort Ord as a mosaic of maritime chaparral, oak woodland and grassland
(with localized wet habitats). R19 must therefore use coast-live-oak-like woodland,
maritime chaparral and dry grass cues. No reviewed Fort Ord source used for this pass
supports prickly pear as a normal component, so cactus is removed from the pilot.
Summer grass may be dry while evergreen sclerophyll shrubs/oaks remain green/olive.

Sources:
- https://www.blm.gov/programs/national-conservation-lands/california/fort-ord/wildlife-and-plants
- https://www.blm.gov/programs/national-conservation-lands/california/fort-ord-national-monument

### Chuspipata → Yolosa / Bolivian Yungas — ecoregion 444 / biome 1

Regional sources describe humid montane/cloud evergreen forest with abundant
epiphytic life; bromeliads/orchids, tree ferns and bamboo are characteristic cues.
R15's single broad tropical silhouette is only coarse biome-family compatibility.
Before default activation is called ecologically representative, Yungas requires a
richer humid-montane presentation with layered broadleaf forms and at least
tree-fern/bamboo/epiphyte cues, without inventing new placement authority.

Sources:
- https://www.oneearth.org/ecoregions/bolivian-yungas/
- https://link.springer.com/article/10.1007/s10531-010-9859-0
- https://www.sciencedirect.com/science/article/pii/S1439609204700604

## Activation gate

Default biome autostart remains blocked until the active Nord, Manic, Laguna and
Yungas presentations satisfy this contract on their exact candidate SHA and their
native game captures are inspected. Historical human PASS results do not transfer
to a new ecological-art SHA.
