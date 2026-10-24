// What the passport remembers, and what its little cards say when a stamp is clicked.
//
// Postage stamps are R4N's releases: they come from releases/ by themselves (cover, title, date,
// credits, description, links), so a new release shows up in the passport too.
// Rubber stamps are the live shows, written here. To add or change one, edit LIVE: the `id`s
// match the stamps drawn in js/passport-art.js ("ukm", "band").

export const LIVE = {
  ukm: {
    title: "UKM-FESTIVALEN",
    meta: { no: "Live · UKM", en: "Live · UKM" },
    text: {
      no: "R4N på scenen under UKM-festivalen.",
      en: "R4N on stage at the UKM festival.",
    },
    link: "",
  },
  band: {
    title: "R4N LIVE",
    meta: { no: "Live med band", en: "Live with a band" },
    text: {
      no: "R4N fremfører låtene sine live, med fullt band bak seg.",
      en: "R4N performing the songs live, with a full band.",
    },
    link: "https://www.instagram.com/r4n.wav/",
  },
};

const fmt = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : d || ""; };
// [text](url) and **bold** as plain words
const plain = (s) => String(s || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").trim();

// The card for a release: what it is, when, who; its own description if it has one
export function releaseCard(rel, lang) {
  const no = lang === "no";
  const date = fmt(rel.date);
  const r4nRoles = rel.credits.filter((c) => c.people.some((p) => /^r4n$/i.test(p.name))).map((c) => c.role.toLowerCase());
  let line;
  if (rel.category === "mine") line = no ? `${rel.type || "Singel"} av ${rel.artist}. Ute ${date}.` : `${rel.type || "Single"} by ${rel.artist}. Out ${date}.`;
  else {
    const roles = r4nRoles.join(no ? " og " : " and ") || "prod";
    line = no ? `${rel.artist}, med R4N på ${roles}. Ute ${date}.` : `${rel.artist}, with R4N on ${roles}. Out ${date}.`;
  }
  const desc = plain(rel.description);
  const link = rel.links?.spotify || Object.values(rel.links || {}).find(Boolean) || "";
  return {
    title: rel.title,
    meta: `${rel.category === "mine" ? (no ? "Utgivelse" : "Release") : (no ? "Produsert" : "Produced")} · ${date}`,
    // the descriptions are written in Norwegian: in English, only the facts
    text: no && desc ? `${desc}` : line,
    sub: no && desc ? line : "",
    link,
  };
}

export function liveCard(id, lang) {
  const m = LIVE[id];
  if (!m) return null;
  return { title: m.title, meta: m.meta[lang] || m.meta.en, text: m.text[lang] || m.text.en, link: m.link };
}
