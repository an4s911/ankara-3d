# Ankara 3D

An explorable 3D rendering of downtown Ankara at golden hour. It runs entirely in the
browser using Vite and Three.js.

It is built from real map data: terrain from elevation tiles and about 25,000 buildings,
roads, parks and water areas from OpenStreetMap. Six landmarks have hand-built models
placed on their real OSM footprints:

| # | Landmark | Modelled details |
|---|----------|------------------|
| 1 | **Ulus** | Zafer Anıtı equestrian statue, First & Second Grand National Assembly buildings |
| 2 | **Ankara Kalesi** | Inner/outer citadel walls following the real wall lines, pentagonal towers, Akkale with a waving flag, Ottoman houses with tiled roofs |
| 3 | **Gençlik Parkı** | Lake and long pool with fountains, the Ferris wheel, the Opera House |
| 4 | **Anıtkabir** | Hall of Honour on its podium, patterned Ceremonial Plaza, Road of Lions with 24 lions, entrance towers, Peace Park forest |
| 5 | **Kocatepe Camii** | 25.5 m central dome, four semi-domes, four 88 m minarets, domed courtyard arcades |
| 6 | **Atakule** | 125 m tower with glass head and blinking beacon |

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Production build. The output in `dist/` is fully static and makes no runtime network calls:

```bash
npm run build
npm run preview        # http://localhost:4173
```

## Controls

- **Mouse:** left-drag pans, right-drag (or Ctrl+drag) rotates, the scroll wheel zooms toward the cursor.
- **Touch:** one finger pans, two fingers rotate and zoom.
- **Keyboard:**
  - `1`–`6` fly to a landmark and `0` returns to the overview.
  - `T` starts or stops the guided tour.
  - `Esc` closes the info card.
  - `W` `A` `S` `D` pan.
- **Landmarks:** click a landmark, its floating label, or its entry in the side menu to fly there and open its info card.
- **Corner buttons:** the compass resets north, ⌂ returns to the overview and ⛶ toggles fullscreen.

### URL options

- `?view=kocatepe` opens directly at a landmark. Use `overview` or any landmark id: `ulus`, `kale`, `genclik`, `anitkabir`, `kocatepe`, `atakule`.
- `?texsize=4096` lowers the ground-texture resolution for weaker GPUs.

## Data pipeline

The generated data in `public/data/` is committed, so building the app needs no network. To regenerate it:

```bash
npm run data   # fetch-terrain → fetch-osm → process-osm
```

- `scripts/fetch-terrain.mjs` downloads AWS Terrarium elevation tiles. It builds a 10 m grid over downtown and a 150 m grid out to the horizon.
- `scripts/fetch-osm.mjs` downloads OSM data from the OSM API in 0.01° tiles and caches it in `.cache/`.
- `scripts/process-osm.mjs` processes the raw data:
  - infers building heights from tags, falling back to Ankara-typical storey counts
  - assigns materials and roof types
  - drapes footprints onto the terrain
  - generates park and street trees
  - extracts the landmark footprints

Behind an HTTP proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

`npm run screenshots` renders the hero view of every landmark with Playwright. Run it against a running `npm run preview`.

## Project layout

```
src/config.js        projection (lat/lon → metres around Kızılay), bounds
src/scene/           terrain, ground texture, buildings, roads, vegetation, lighting/sky/post-fx
src/landmarks/       one module per landmark, plus shared geometry helpers
src/ui/              camera rig (map controls + fly-to), menu, labels, info cards, tour
src/data/            landmark texts and hero camera angles
```

## Attribution

- Map data © OpenStreetMap contributors (ODbL).
- Elevation: Mapzen Terrain Tiles on AWS.
