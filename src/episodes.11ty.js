import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, episodeLabel, escapeHtml, formatDate, formatMoney, formatNumber, layout, pathFor } from "../lib/render.mjs";

export default class EpisodesPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/episodes/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const body = `${breadcrumbs(lang, [{ label: c.nav.episodes }])}
      <header class="page-hero page-hero--index"><p class="eyebrow">${formatDate(catalog.stats.dateStart, lang)} · ${formatDate(catalog.stats.dateEnd, lang)}</p><h1>${c.nav.episodes}</h1><p>${sl ? `${formatNumber(catalog.stats.availableEpisodes, lang)} katalogiziranih epizod v izvirnem zaporedju. Filtrirajte po sezoni, datumu, tekmovalcu ali številu vprašanj.` : `${formatNumber(catalog.stats.availableEpisodes, lang)} catalogued episodes in original sequence. Filter by season, date, contestant or question count.`}</p></header>
      <section class="filter-strip" data-table-filter><label>${sl ? "Filtriraj seznam" : "Filter the list"}<input type="search" placeholder="${sl ? "npr. S09E21, Eva Hren, 2026" : "e.g. S09E21, Eva Hren, 2026"}" data-filter-input></label><label>${c.labels.season}<select data-filter-season><option value="">${c.labels.all}</option>${catalog.seasons.map((season) => `<option value="${season.season}">${c.labels.season} ${String(season.season).padStart(2, "0")}</option>`).join("")}</select></label><p aria-live="polite"><span data-filter-count>${catalog.originalEpisodeSlots.length}</span> ${c.labels.episodes.toLowerCase()}</p></section>
      <section class="episode-ledger episode-ledger--all"><div class="table-wrap"><table><thead><tr><th>${c.labels.episode}</th><th>${c.labels.airingDate}</th><th>${c.labels.host}</th><th>${c.labels.contestants}</th><th>${c.labels.questions}</th><th>${sl ? "Podeljeni dobitki" : "Money awarded"}</th></tr></thead><tbody>${catalog.originalEpisodeSlots
        .map((episode) => `<tr${episode.available ? "" : ' class="is-unavailable"'} data-filter-row data-season="${episode.season}" data-search="${escapeHtml(`${episodeLabel(episode)} ${episode.airingDate} ${episode.hosts.join(" ")} ${episode.people.join(" ")} ${episode.questionCount}`.toLowerCase())}"><td><a class="episode-code" href="${pathFor(lang, "episode", episode.key)}">${episodeLabel(episode)}</a></td><td>${episode.airingDate ? `<time datetime="${episode.airingDate}">${formatDate(episode.airingDate, lang)}</time>` : c.labels.noData}</td><td>${episode.hosts.length ? escapeHtml(episode.hosts.join(", ")) : c.labels.noData}</td><td>${episode.available ? `${episode.people.slice(0, 3).map(escapeHtml).join(", ")}${episode.people.length > 3 ? ` <span class="muted">+${episode.people.length - 3}</span>` : ""}` : `<span class="status status--unavailable">${c.labels.unavailable}</span>`}</td><td>${episode.available ? episode.questionCount : "–"}</td><td>${episode.available ? formatMoney(episode.moneyAwarded, lang) : "–"}</td></tr>`)
        .join("")}</tbody></table></div></section>`;
    return layout({ lang, title: c.nav.episodes, description: sl ? "Kazalo vseh katalogiziranih epizod oddaje Milijonar." : "Index of every catalogued Milijonar episode.", body, active: "episodes", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "episodes") });
  }
}
