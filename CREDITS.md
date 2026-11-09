# Credits — third-party assets

All assets below are free and openly licensed; no purchases were made
(project no-spend rule). Processed derivatives (texture-stripped,
color-baked, decimated, recolored, kitbashed) are covered by the same
CC0 dedications.

## Ship hulls — Innerscene 3D Parts Library (CC0 1.0)

Source: https://www.innerscene.com/tools/library/3d-parts/tag/low-poly
License for every part: **CC0-1.0** ("Innerscene - original model"), as
stated in each part's library record. Files in `public/models/ships/`
were processed for the game: textures removed with each texture's
average color baked into the material color, geometry decimated with
meshoptimizer (gltfpack), materials replaced by flat-shaded equivalents
in the game's Style A, and — for the frigate and carrier, which ship
unarmed — flat-style weapon kitbash added in code (`src/three-map/ships3d.ts`).

| Game file | Innerscene part | Part page |
|---|---|---|
| ships/frigate.glb | Generic unarmed frigate hull | https://www.innerscene.com/v/6Vd4jhRbCrUDxXVEwTlGbj |
| ships/carrier.glb | Generic unarmed aircraft carrier | https://www.innerscene.com/v/54kYRpKn9vdWKzDkKlaGD4 |
| ships/tanker.glb | Oil tanker (Aframax) | https://www.innerscene.com/v/3R6a330tpX8V4oIwl49GcO |
| ships/container.glb | Container ship (loaded) | https://www.innerscene.com/v/1krv92YbyHXLRth4eoRNxB |
| ships/bulk.glb | Bulk carrier | https://www.innerscene.com/v/2sCEjfCzQTjc8BmW7JuZbg |
| ships/submarine.glb | Diesel submarine | https://www.innerscene.com/v/1z5JpBmDTkubvDNtdabkU8 |
| ships/pilot.glb | Pilot boat | https://www.innerscene.com/v/5JTrvAnWiV6aortk8SsxhV |
| ships/research.glb | Research vessel | https://www.innerscene.com/v/20N6yi35eOyf9oaFiY5868 |
| ships/supply.glb | Offshore supply vessel | https://www.innerscene.com/v/2CABG0WkGAN9u15OIREIhb |
| ships/ferry.glb | Ro-ro ferry | https://www.innerscene.com/v/1FWrVwX2kyzuza0vLhnsYK |

## Ship hulls — Kenney Watercraft Kit (CC0 1.0)

Source: Kenney (https://kenney.nl), Watercraft Kit. License: **CC0 1.0**
(public domain dedication, per the kit's license file).
Files in `public/models/kenney/`: `ship-cargo-a.glb` (contraband
smuggler), `boat-tug-a.glb` (barge), `boat-speed-a.glb` (pirates and
enemy speedboats — shipped in the APK unused until fix program 2 /
D-022). In-game these use a single flat hull color per role instead of
the kit's colormap texture, to match the game's flat-vector style.

## Everything else

Towers, buildings and effects are the project team's own procedural
models and code (owner-provided model pack, integrated and animated
in-repo). Map geography is traced from open data (OpenStreetMap /
Natural Earth contributors, ODbL / public domain) as recorded in the
project docs.
