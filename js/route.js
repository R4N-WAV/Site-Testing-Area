// The booking page, at /booking/, is part of the same page as the tunnel, so getting there feels
// like going deeper into the site rather than loading something new.
//
// In: the tunnel rushes forward while the whole page inverts (white to black, the records turn
// to negatives), then the page quietly swaps to its dark theme, which looks the same, and the
// passport comes up out of the dark. Out: the passport sinks back into the dark, the page swaps
// back to the light theme under the same inversion, and the tunnel flies in while it fades.
// Browser back/forward and opening /booking/ directly work too (booking/index.html is this page).

import { play } from "./sound.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const IN_MS = 850, OUT_MS = 900;

export function initBooking({ space, releases = [] }) {
  const html = document.documentElement, body = document.body;
  const layer = document.getElementById("booking");
  const bookBtn = document.getElementById("bookBtn");
  const homeBtn = document.getElementById("homeBtn");
  const logo = document.getElementById("wordmark");
  // the site's root, whichever of the two addresses we were opened at
  const root = location.pathname.replace(/booking\/?$/, "");
  const bookingPath = `${root}booking/`;
  const atBooking = () => /\/booking\/?$/.test(location.pathname);

  let passport = null, making = null, busy = false;
  // the passport's code and textures are only fetched and made when someone heads there
  const getPassport = () => (making ||= import("./booking.js")
    .then(({ createPassport }) => createPassport(layer, { releases }))
    .then((p) => (passport = window.__passport = p)) // (__passport: for automated tests)
    .catch((err) => { making = null; throw err; }));

  async function showPassport() {
    try {
      const p = await getPassport();
      layer.hidden = false;
      p.setPaused(false);
      p.show(true);
    } catch (err) {
      console.error(err); // no passport (no WebGL): the page still works, just empty
    }
  }

  async function enter(animate = true, push = true) {
    if (busy || html.classList.contains("is-booking")) return;
    busy = true;
    if (push) history.pushState({ booking: true }, "", bookingPath);
    getPassport().catch(() => {}); // starts drawing its textures while the dive plays
    if (animate && space && !reducedMotion) {
      body.classList.add("is-diving");
      body.style.transition = `filter ${IN_MS}ms cubic-bezier(.65,0,.35,1)`;
      await nextFrame();
      body.style.filter = "invert(1)";
      play("dive");
      await Promise.all([space.diveOut(IN_MS / 1000), wait(IN_MS + 20)]);
    } else if (space) {
      space.holdOut();
    }
    // the dark theme looks exactly like the inverted page: swap one for the other in one frame
    body.style.transition = "none";
    body.style.filter = "";
    html.classList.add("is-booking");
    body.classList.remove("is-diving");
    space?.setPaused(true);
    document.title = "Booking — R4N";
    await showPassport();
    busy = false;
  }

  async function exit(push = true) {
    if (busy || !html.classList.contains("is-booking")) return;
    busy = true;
    if (push) history.pushState(null, "", root);
    play("rise");
    if (passport) {
      await passport.hide(true);
      passport.setPaused(true);
    }
    layer.hidden = true;
    // back to the light theme, seen through the same inversion, which then fades as the tunnel returns
    body.style.transition = "none";
    body.style.filter = space && !reducedMotion ? "invert(1)" : "";
    html.classList.remove("is-booking");
    document.title = "R4N";
    if (space) {
      space.setPaused(false);
      const back = space.diveIn();
      if (!reducedMotion) {
        await nextFrame();
        body.style.transition = `filter ${OUT_MS}ms cubic-bezier(.22,1,.36,1)`;
        body.style.filter = "";
      }
      await Promise.all([back, wait(OUT_MS)]);
    }
    body.style.transition = "";
    busy = false;
  }

  // plain clicks only: a middle click or Cmd/Ctrl-click still opens the address in a new tab
  const plain = (e) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0);
  bookBtn?.addEventListener("click", (e) => { if (!plain(e)) return; e.preventDefault(); enter(); });
  homeBtn?.addEventListener("click", () => exit());
  logo?.addEventListener("click", (e) => {
    if (!html.classList.contains("is-booking") || !plain(e)) return;
    e.preventDefault();
    exit();
  });
  window.addEventListener("popstate", () => {
    if (atBooking()) enter(true, false);
    else exit(false);
  });

  // Made ahead of time: a little after the site has loaded, while nobody's looking, so heading
  // there never waits for it (its textures are made in small pieces, the tunnel keeps moving)
  if (space && !html.classList.contains("is-booking")) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
    setTimeout(() => idle(() => getPassport().then((p) => { if (!html.classList.contains("is-booking")) p.setPaused(true); }).catch(() => {}), { timeout: 4000 }), 2500);
  }

  // opened at /booking/ (the dark theme was already set before the page drew, in index.html)
  if (html.classList.contains("is-booking")) {
    html.classList.remove("is-booking");
    enter(false, false);
  }
  return { enter, exit };
}
