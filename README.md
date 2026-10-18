# R4N

The website for R4N's music: every release is a record in a 3D tunnel. Scroll or swipe to move
through it, click a record to open it.

## Adding a song

Add a folder to `releases/` with an `info.json` and a cover image. The site picks it up by itself.
Step-by-step guide (works from the GitHub website on a phone): [releases/README.md](releases/README.md).

## ACCESS

The faint ACCESS text in the bottom-right corner (on phones: in the top bar, next to INDEX) opens a
password-protected page.
Its contents only ever exist in this repository encrypted (`vault/`); without the password there
is nothing readable to find, in the files or in the code. To change what's inside or the password,
use `scripts/vault.mjs` (instructions at the top of that file; needs Node 18+ and the password).

## How it's built

Plain HTML, CSS and JavaScript, no build step. Served by GitHub Pages from the `main` branch.

- `index.html`, `css/site.css`: the page
- `js/site.js`: the tunnel, the opened record, the index, the toggle
- `js/materials.js`: the records (sleeve, shrink-wrap, reflections), all generated in code
- `js/data.js`: reads the release folders
- `js/access.js`: the ACCESS screen
- `vendor/three.module.min.js`: [three.js](https://threejs.org) r170 (MIT, see `vendor/THREE-LICENSE`)
- `scripts/build-releases.mjs` + `.github/workflows/releases.yml`: keep `releases/index.json` up to date

After changing CSS or JavaScript, bump the `?v=` numbers in `index.html` so browsers fetch the new files.
