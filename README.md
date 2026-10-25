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

## BOOKING

BOOKING in the top bar dives down the tunnel into an inverted, dark page at `/booking/`, with a
3D passport (red leather, gold foil, light leaking out between its pages). It's the same page as
the tunnel (`js/route.js` switches between them, `js/booking.js` draws the passport), so
`booking/index.html` is a copy of `index.html`: after editing `index.html`, run
`node scripts/sync-pages.mjs` to regenerate it.

Opened, the passport is about R4N live: notes scribbled in an unreadable hand (drawn in
`js/passport-art.js`), the UKM stamp (click it for its story; its words are in `js/memories.js`) and
a film. The releases are postage stamps on the pages that riffle
past as it opens (they come from `releases/` by themselves). The ticket, BOOK NOW, turns the page to
a booking form; the red tab hanging under the passport closes it.

The form sends straight to r4nmusic@outlook.com through [FormSubmit](https://formsubmit.co) (no
account, nothing opens on the visitor's side). **The first time, FormSubmit sends r4nmusic@outlook.com
an e-mail with an "Activate Form" button, which must be clicked once** (look in spam as well);
until then requests can't arrive.

The film is `assets/film/r4n-live.mp4`, made from R4N's footage with `scripts/make-film.sh`
(stop-motion, black and white, paper-cut look; see the top of that file). The cover's textures are
images in `assets/passport/`, made by `scripts/bake-passport.mjs`. R4N's signature on a stamped
request is `js/signature.js`, made by `scripts/make-signature.py` (change its strokes there).

## Sound

Everything you touch makes a small sound (`js/sound.js`). The small ones are made in code; the
bigger ones (into the tunnel and back, records opening and closing, switching, the language, the
thank-you, the passport's rattle) are short recordings of R4N's synth Isai in `assets/sound/`,
rendered with `scripts/isai-sounds.cpp` (how, at its top). The speaker button beside the language
picker turns it off (remembered). On iPhones, sound plays even with the ringer switch on silent
from iOS 17.

## Language

English and Norwegian (`js/i18n.js`). The picker sits next to BOOKING; the choice is remembered,
and on the first visit it follows the browser. Text that should change with it is marked
`data-i18n="key"` in `index.html`, with the words in `js/i18n.js`.

## How it's built

Plain HTML, CSS and JavaScript, no build step. Served by GitHub Pages from the `main` branch.

- `index.html`, `css/site.css`: the page
- `js/site.js`: the tunnel, the opened record, the index, the toggle
- `js/materials.js`: the records (sleeve, shrink-wrap, reflections), all generated in code
- `js/data.js`: reads the release folders
- `js/access.js`: the ACCESS screen
- `js/route.js`, `js/booking.js`, `js/passport-art.js`: the booking page, its passport, the passport's artwork
- `js/i18n.js`: English / Norwegian; `js/sound.js`: the sounds; `js/memories.js`: the live shows in the passport
- `vendor/addons`: three.js bloom and studio-light helpers (MIT); `assets/fonts`: Cinzel (OFL)
- `vendor/three.module.min.js`: [three.js](https://threejs.org) r170 (MIT, see `vendor/THREE-LICENSE`)
- `scripts/build-releases.mjs` + `.github/workflows/releases.yml`: keep `releases/index.json` up to date

After changing CSS or JavaScript, bump the `?v=` numbers in `index.html` so browsers fetch the new files.

The tunnel adjusts itself to the device: if frames come too slowly it draws at a lower resolution
and, if needed, without the soft shadows (`js/site.js`, "keeping it smooth"). To see how it's running
in a browser, add `?perf` to the address (for example `https://www.r4n.no/?perf`): a small readout
shows the frame rate, the resolution, whether shadows are on, and which graphics chip the browser uses.
