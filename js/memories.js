// What the passport's cards say when something on the open spread is clicked (Norwegian and
// English). The notes on the spread itself are handwriting nobody can read (js/passport-art.js).
//
// The releases (from releases/) appear as postage stamps on the pages that riffle past when it
// opens; the open spread is about playing live.

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
  const m = LIVE[id];
  if (!m) return null;
  return { title: m.title, meta: m.meta[lang] || m.meta.en, text: m.text[lang] || m.text.en, link: m.link };
}
