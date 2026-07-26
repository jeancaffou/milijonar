import { copy } from "../lib/i18n.mjs";
import {
  episodeLabel,
  escapeHtml,
  formatDate,
  formatMoney,
  formatNumber,
  layout,
  pathFor,
  searchForm,
} from "../lib/render.mjs";

export default class HomePage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const latest = [...catalog.episodes].slice(-6).reverse();
    const body = `
      <section class="home-hero">
        <div class="home-hero__copy">
          <p class="eyebrow">${sl ? "KATALOG ODDAJE MILIJONAR" : "MILIJONAR PROGRAMME CATALOGUE"}</p>
          <h1>${sl ? "Pregled oddaje Milijonar" : "The Milijonar catalogue"}</h1>
          <p class="lede">${sl ? "Pregled sezon, epizod, tekmovalcev, vprašanj, odgovorov, datumov predvajanja in dobitkov." : "A record of seasons, episodes, contestants, questions, answers, air dates and winnings."}</p>
          ${searchForm(lang)}
          <div class="hero-links">
            <a href="${pathFor(lang, "seasons")}">${sl ? "Pregled sezon" : "Browse seasons"}</a>
            <a href="${pathFor(lang, "statistics")}">${sl ? "Statistična analiza" : "Statistical analysis"}</a>
          </div>
        </div>
      </section>

      <section class="archive-ribbon" aria-label="${sl ? "Obseg kataloga" : "Catalogue scope"}">
        <p><strong>${formatNumber(catalog.stats.questions, lang)}</strong><span>${c.labels.questions.toLowerCase()}</span></p>
        <p><strong>${formatNumber(catalog.stats.originalEpisodes, lang)}</strong><span>${sl ? "izvirnih epizod" : "original episodes"}</span></p>
        <p><strong>${formatNumber(catalog.stats.people, lang)}</strong><span>${sl ? "tekmovalcev v katalogu" : "contestants in the catalogue"}</span></p>
        <p><strong>${formatNumber(catalog.stats.evidenceImages, lang)}</strong><span>${sl ? "arhivskih posnetkov" : "archive images"}</span></p>
        <p class="archive-ribbon__money"><strong>${formatMoney(catalog.stats.totalMoneyAwarded, lang)}</strong><span>${sl ? "vseh podeljenih dobitkov" : "total money awarded"}</span></p>
        <p class="archive-ribbon__money"><strong>${formatMoney(catalog.stats.contestantMoneyAwarded, lang)}</strong><span>${sl ? "dobitkov tekmovalcem" : "awarded to contestants"}</span></p>
        <p class="archive-ribbon__money"><strong>${formatMoney(catalog.stats.charityMoneyAwarded, lang)}</strong><span>${sl ? "dobrodelnih dobitkov" : "awarded to charity"}</span></p>
      </section>

      <section class="home-section season-orbit-section">
        <header class="section-heading">
          <p class="eyebrow">${sl ? "SEZONE" : "SEASONS"}</p>
          <h2>${sl ? "Pregled po sezonah" : "Browse by season"}</h2>
          <p>${sl ? "Katalog zajema obdobje od marca 2019 do maja 2026." : "The catalogue covers broadcasts from March 2019 to May 2026."}</p>
        </header>
        <ol class="season-orbit-list">${catalog.seasons
          .map((season) => `<li>
            <a href="${pathFor(lang, "season", season.key)}">
              <span class="season-number">${String(season.season).padStart(2, "0")}</span>
              <span class="season-range">${formatDate(season.dateStart, lang)}<br>${formatDate(season.dateEnd, lang)}</span>
              <strong>${c.labels.questions}: ${formatNumber(season.questionCount, lang)}</strong>
              <small>${c.labels.episodes}: ${formatNumber(season.originalEpisodeCount, lang)}</small>
            </a>
          </li>`)
          .join("")}</ol>
      </section>

      <section class="home-section latest-section">
        <header class="section-heading section-heading--inline">
          <div><p class="eyebrow">${sl ? "EPIZODE" : "EPISODES"}</p><h2>${sl ? "Najnovejše epizode" : "Latest episodes"}</h2></div>
          <a class="text-link" href="${pathFor(lang, "episodes")}">${sl ? "Celoten seznam epizod" : "Full episode list"}</a>
        </header>
        <div class="episode-track">${latest
          .map((episode, index) => `<article class="episode-ticket">
            <span class="episode-ticket__index">${String(index + 1).padStart(2, "0")}</span>
            <p class="episode-ticket__code">${episodeLabel(episode)}</p>
            <h3>${formatDate(episode.airingDate, lang)}</h3>
            <p>${escapeHtml(episode.people.slice(0, 4).join(", "))}${episode.people.length > 4 ? ` +${episode.people.length - 4}` : ""}</p>
            <dl><div><dt>${c.labels.questions}</dt><dd>${episode.questionCount}</dd></div><div><dt>${c.labels.host}</dt><dd>${escapeHtml(episode.hosts.join(", "))}</dd></div></dl>
            <a href="${pathFor(lang, "episode", episode.key)}">${c.labels.viewEpisode}<span aria-hidden="true"> →</span></a>
          </article>`)
          .join("")}</div>
      </section>

      <section class="analysis-callout">
        <div class="answer-sequence" aria-hidden="true">${catalog.patternResults.long_sequence.chronological.visualization.letters.slice(0, 120).split("").map((letter) => `<i data-letter="${letter}">${letter}</i>`).join("")}</div>
        <div>
          <p class="eyebrow">${sl ? "STATISTIČNA ANALIZA" : "STATISTICAL ANALYSIS"}</p>
          <h2>${sl ? "Porazdelitev in zaporedja pravilnih odgovorov" : "Correct-answer distribution and sequences"}</h2>
          <p>${sl ? "Analiza preverja porazdelitev črk A–D ter možnost napovedovanja prihodnjih odgovorov na podlagi preteklih zaporedij." : "The analysis examines the distribution of A–D and whether earlier answer sequences can predict later answers."}</p>
          <a class="button-link" href="${pathFor(lang, "patterns")}">${sl ? "Odpri analizo odgovorov" : "Open the answer analysis"}</a>
        </div>
      </section>`;

    return layout({
      lang,
      title: "",
      description: sl
        ? "Dvojezični katalog oddaje Milijonar z vprašanji, odgovori, tekmovalci, datumi predvajanja in dobitki."
        : "A bilingual Milijonar catalogue of questions, answers, contestants, air dates and winnings.",
      body,
      active: "home",
      alternateUrl: pathFor(lang === "sl" ? "en" : "sl"),
      bodyClass: "home-page",
    });
  }
}
