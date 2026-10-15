# R4N-SITE (testing area)

Personal website for my music career: records floating in space, one per release.

- **Add a song/project:** see [releases/README.md](releases/README.md)
- `index.html`, `css/`, `js/`: the 3D space
- `js/data.js`: finds and reads the release folders
- `js/materials.js`: the realistic record (sleeve, shrink-wrap, vinyl) and studio lighting
- `js/site.js`: the ring, the enlarged view, the index
- `vendor/`: three.js r170 (3D library), kept in the repo so the site doesn't depend on another server
- `scripts/build-releases.mjs` + `.github/workflows/releases.yml`: keep `releases/index.json` up to date automatically
