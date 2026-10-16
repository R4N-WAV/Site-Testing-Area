# R4N-SITE (testing area)

Personal website for my music career: sealed records floating in the dark, one per release.

- **Add a song/project:** see [releases/README.md](releases/README.md)
- `index.html`, `css/`, `js/`: the 3D space
- `js/data.js`: finds and reads the release folders
- `js/materials.js`: the realistic record (sleeve and shrink-wrap) and studio lighting
- `js/site.js`: the row of records and its spring motion, the spotlight, the enlarged view, the loader, the index
- `vendor/`: three.js r170 (3D library) and its RoundedBoxGeometry, kept in the repo so the site doesn't depend on another server
- `scripts/build-releases.mjs` + `.github/workflows/releases.yml`: keep `releases/index.json` up to date automatically
