# GLYPHROPOLIS

**An infinite, first-person ASCII city.** Boot, bloom, walk.

A seeded procedural metropolis rendered entirely as text glyphs: true 3D geometry converted to characters in a single GLSL fullscreen pass. Rainy neon nights, day/night cycles, endless streamed streets - a pure static site.

▶ **Play**: https://adnermo-002.github.io/glyphropolis/

![night](docs/screenshots/night.png)

## Run locally

```bash
npm install
npm run dev        # dev server
npm run build      # typecheck + production build -> dist/
npm run preview    # serve the production build
```

**Controls**: click to lock pointer · WASD move · Shift run · Space charge eject / thrust · mouse look · C = CRT mode · R = new city · H = help · Esc = release.

**Useful params**: `?seed=NEON-2049` (same seed, same city) · `?hour=12` (time of day) · `?crt=1` (monochrome CRT).

---

Built after studying four open-source ASCII-city predecessors (asciicker, asciicity, ascii-city-walkable, ascii-city-osm). All code original; MIT. Design notes in `docs/adr/`, glossary in `CONTEXT.md`.
