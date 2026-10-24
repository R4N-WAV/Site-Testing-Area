// What the passport says about R4N live, and what its cards say when something is clicked.
// Change any of the words here (Norwegian and English); the passport draws them by itself.
//
// The releases (from releases/) appear as postage stamps on the pages that riffle past when it
// opens; the open spread is about playing live.

// the two printed entries on the open spread
export const LIVE_TEXT = {
  // left page, top: like a passport's "observations" entry
  about: {
    head: "ANMERKNINGER / OBSERVATIONS",
    title: "R4N LIVE",
    text: {
      no: "R4N har stått på scenen på en rekke arrangementer: for skoler, for kommunen og på UKM, hele veien til UKM-festivalen i Trondheim i 2025. Hver gang litt bedre enn sist, og alltid med noe publikum husker.",
      en: "R4N has played a long list of events: for schools, for the municipality and at UKM, all the way to the UKM national festival in Trondheim in 2025. A little better every time, and always with something the audience remembers.",
    },
  },
  // right page, lower: what you get when you book
  book: {
    head: "BOOKING",
    title: "BOOK R4N",
    points: {
      no: [
        "Fra rolige kjærlighetssanger og rap med energi til dypere temaer, skreddersydd for akkurat ditt publikum.",
        "Alt er skrevet av R4N, og nesten alt også produsert av R4N.",
        "God kjennskap til lyd og sonisk design: det låter bra, hver gang.",
      ],
      en: [
        "From quiet love songs and high-energy rap to deeper themes, tailored to your audience.",
        "Everything written by R4N, nearly all of it produced by R4N too.",
        "A real ear for sound and sonic design: it sounds right, every time.",
      ],
    },
  },
};

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
  if (id === "about") { const A = LIVE_TEXT.about; return { title: A.title, meta: A.head, text: A.text[lang] || A.text.en, link: "" }; }
  if (id === "book") { const B = LIVE_TEXT.book; return { title: B.title, meta: B.head, text: (B.points[lang] || B.points.en).map((p) => `— ${p}`).join("\n"), link: "" }; }
  const m = LIVE[id];
  if (!m) return null;
  return { title: m.title, meta: m.meta[lang] || m.meta.en, text: m.text[lang] || m.text.en, link: m.link };
}
