// What the passport says about R4N live, and what its cards say when something is clicked.
// Change any of the words here (Norwegian and English); the passport sets them by itself, at one
// size for both languages, so switching never makes the type jump.
//
// The releases (from releases/) appear as postage stamps on the pages that riffle past when it
// opens; the open spread is about playing live.

// the two printed entries on the open spread
export const LIVE_TEXT = {
  // left page, top: like a passport's "observations" entry
  about: {
    head: "ANMERKNINGER / OBSERVATIONS",
    title: { no: "PÅ SCENEN", en: "ON STAGE" },
    text: {
      no: "Fra skolescener og kommunale arrangementer til UKM-festivalen i Trondheim i 2025: R4N har stått på mange scener, og tar med seg noe nytt fra hver eneste en. Målet er alltid det samme – en opptreden publikum snakker om etterpå.",
      en: "From school stages and municipal events to the UKM national festival in Trondheim in 2025: R4N has played a lot of stages, and takes something new from every one. The goal never changes: a show the audience talks about afterwards.",
    },
    short: {
      no: "Fra skolescener og kommunale arrangementer til UKM-festivalen i Trondheim i 2025. Målet er alltid en opptreden publikum snakker om etterpå.",
      en: "From school stages and municipal events to the UKM national festival in Trondheim in 2025. The goal: a show the audience talks about afterwards.",
    },
  },
  // right page, lower: what you get when you book
  book: {
    head: "BOOKING",
    title: { no: "BOOK R4N", en: "BOOK R4N" },
    points: {
      no: [
        "Skreddersydd: rolige kjærlighetssanger, rap med full energi eller dypere temaer – satt sammen for ditt publikum og din anledning.",
        "Egen musikk: alt er skrevet av R4N, og nesten alt er også produsert av R4N.",
        "Lydkyndig: god kjennskap til lyd og sonisk design. Med et anlegg som holder mål, låter det som det skal.",
        "For både unge og voksne.",
      ],
      en: [
        "Tailored: quiet love songs, full-energy rap or deeper themes, put together for your audience and your occasion.",
        "Original music: everything written by R4N, nearly all of it produced by R4N too.",
        "Sound-minded: a real ear for sound and sonic design. Give it a decent sound system and it sounds the way it should.",
        "For young and old alike.",
      ],
    },
    // on a phone the page has room for less: the points in short (a tap opens them in full)
    short: {
      no: [
        "Skreddersydd for ditt publikum.",
        "Egen musikk, skrevet og produsert av R4N.",
        "Lydkyndig: med et anlegg som holder mål, låter det som det skal.",
        "For både unge og voksne.",
      ],
      en: [
        "Tailored to your audience.",
        "Original music, written and produced by R4N.",
        "Sound-minded: give it a decent sound system and it sounds the way it should.",
        "For young and old alike.",
      ],
    },
  },
};
// one entry in one language: { head, title, paras, points, cut, more } (points: the paragraphs are
// a list; cut: in short, the rest in its card; more: say so)
export function liveEntry(id, lang, short = false) {
  const e = LIVE_TEXT[id];
  const pick = (o) => o[lang] || o.en;
  const cut = short && !!e.short;
  const paras = e.points ? pick(cut ? e.short : e.points) : [pick(cut ? e.short : e.text)];
  return { head: e.head, title: pick(e.title), paras, points: !!e.points, cut, more: cut };
}

// the cards: what opens when a stamp is clicked
export const LIVE = {
  ukm: {
    title: "UKM-FESTIVALEN",
    meta: { no: "Live · UKM 2025 · Trondheim", en: "Live · UKM 2025 · Trondheim" },
    text: {
      no: "R4N har deltatt på UKM flere ganger, og gikk i 2025 helt videre til UKM-festivalen i Trondheim.",
      en: "R4N has taken part in UKM several times, and in 2025 went all the way to the UKM national festival in Trondheim.",
    },
    link: "",
  },
};

export function liveCard(id, lang) {
  // the printed entries, as cards
  if (LIVE_TEXT[id]) {
    const e = liveEntry(id, lang);
    return { title: e.title, meta: e.head, text: e.points ? e.paras.map((p) => `— ${p}`).join("\n") : e.paras[0], link: "" };
  }
  const m = LIVE[id];
  if (!m) return null;
  return { title: m.title, meta: m.meta[lang] || m.meta.en, text: m.text[lang] || m.text.en, link: m.link };
}
