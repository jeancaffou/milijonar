import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, escapeHtml, formatDate, formatMoney, formatNumber, layout, pathFor, statBar } from "../lib/render.mjs";

export default class SeasonsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/seasons/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const maxQuestions = Math.max(...catalog.seasons.map((season) => season.questionCount));
    const body = `${breadcrumbs(lang, [{ label: c.nav.seasons }])}
      <header class="page-hero page-hero--index"><p class="eyebrow">${sl ? "2019–2026" : "2019–2026"}</p><h1>${c.nav.seasons}</h1><p>${sl ? "Kronološki pregled vseh desetih sezon. Vsaka sezona povezuje epizode, vprašanja, tekmovalce, voditelje in statistiko." : "A chronological view of all ten seasons. Every season connects its episodes, questions, contestants, hosts and statistics."}</p></header>
      <section class="season-ledger" aria-label="${c.nav.seasons}">${catalog.seasons
        .map((season) => `<article>
          <a class="season-ledger__number" href="${pathFor(lang, "season", season.key)}"><span>${c.labels.season}</span>${String(season.season).padStart(2, "0")}</a>
          <div class="season-ledger__body">
            <div><h2><a href="${pathFor(lang, "season", season.key)}">${c.labels.season} ${String(season.season).padStart(2, "0")}</a></h2><p>${formatDate(season.dateStart, lang)} · ${formatDate(season.dateEnd, lang)}</p><p>${escapeHtml(season.hosts.join(", "))}</p></div>
            <dl><div><dt>${c.labels.episodes}</dt><dd>${season.originalEpisodeCount}</dd></div><div><dt>${c.labels.questions}</dt><dd>${formatNumber(season.questionCount, lang)}</dd></div><div><dt>${sl ? "Podeljeni dobitki" : "Money awarded"}</dt><dd>${formatMoney(season.moneyAwarded, lang)}</dd></div></dl>
            ${statBar({ label: c.labels.questions, value: season.questionCount, max: maxQuestions, display: formatNumber(season.questionCount, lang) })}
          </div>
        </article>`)
        .join("")}</section>`;
    return layout({ lang, title: c.nav.seasons, description: sl ? "Pregled vseh sezon oddaje Milijonar." : "Browse every season of Milijonar.", body, active: "seasons", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "seasons") });
  }
}
