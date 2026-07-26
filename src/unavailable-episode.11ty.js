import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, episodeLabel, layout, pathFor } from "../lib/render.mjs";

export default class UnavailableEpisodePage {
  data() {
    return {
      pagination: { data: "catalog.unavailableEpisodePages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/episodes/${data.page.episode.key}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ page }) {
    const { lang, episode } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const label = episodeLabel(episode);
    const body = `${breadcrumbs(lang, [
      { label: c.nav.episodes, href: pathFor(lang, "episodes") },
      { label },
    ])}
      <header class="page-hero unavailable-hero">
        <div>
          <p class="eyebrow">${c.labels.unavailable}</p>
          <h1>${label}</h1>
          <p>${sl
            ? "Za to mesto v izvirnem zaporedju katalog ne vsebuje podatkov o datumu predvajanja, tekmovalcih, vprašanjih ali posnetkih."
            : "The catalogue has no air date, contestant, question or programme-image records for this position in the original sequence."}</p>
          <div class="episode-hero__links"><a href="${pathFor(lang, "season", episode.seasonKey)}">${c.labels.season} 06</a></div>
        </div>
        <div class="unavailable-seal" aria-hidden="true"><span>06</span><strong>40</strong></div>
      </header>
      <section class="empty-state empty-state--editorial">
        <p class="eyebrow">${sl ? "MANJKAJOČA EPIZODA" : "MISSING EPISODE"}</p>
        <h2>${sl ? "Podatki niso na voljo" : "Data unavailable"}</h2>
        <p>${sl
          ? "Mesto ostaja v zaporedju sezone, vendar podatki o epizodi niso na voljo. Spodaj sta povezavi do sosednjih epizod."
          : "The position remains in the season sequence, but episode data is unavailable. Links to the neighbouring episodes are provided below."}</p>
      </section>
      <nav class="page-turner" aria-label="${sl ? "Sosednje epizode" : "Adjacent episodes"}">
        <a rel="prev" href="${pathFor(lang, "episode", episode.previousKey)}"><span>${c.labels.previous}</span><strong>${episode.previousKey.toUpperCase()}</strong></a>
        <a rel="next" href="${pathFor(lang, "episode", episode.nextKey)}"><span>${c.labels.next}</span><strong>${episode.nextKey.toUpperCase()}</strong></a>
      </nav>`;

    return layout({
      lang,
      title: label,
      description: sl
        ? `${label} je mesto v izvirnem zaporedju, za katero kataloški podatki niso na voljo.`
        : `${label} is a position in the original sequence for which catalogue data is unavailable.`,
      body,
      active: "episodes",
      alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "episode", episode.key),
      bodyClass: "unavailable-episode-page",
    });
  }
}
