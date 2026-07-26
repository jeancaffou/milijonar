import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, layout, pathFor } from "../lib/render.mjs";

export default class SearchPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/search/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const body = `${breadcrumbs(lang, [{ label: c.nav.search }])}
      <header class="page-hero page-hero--index"><p class="eyebrow">${sl ? "VPRAŠANJA · ODGOVORI · OSEBE · DATUMI" : "QUESTIONS · ANSWERS · PEOPLE · DATES"}</p><h1>${c.search.title}</h1><p>${c.search.intro}</p></header>
      <section class="catalog-search" data-catalog-search data-lang="${lang}">
        <form class="catalog-search__form" role="search"><label for="catalog-search-query">${c.nav.search}</label><div><input id="catalog-search-query" type="search" name="q" minlength="2" autocomplete="off" placeholder="${c.search.placeholder}" data-search-query><button type="submit">${c.search.button}</button></div></form>
        <div class="catalog-search__filters"><label>${c.search.type}<select data-search-type><option value="">${c.labels.all}</option><option value="question">${c.labels.questions}</option><option value="topic">${c.nav.topics}</option><option value="contestant">${c.labels.contestants}</option><option value="episode">${c.labels.episodes}</option><option value="season">${c.labels.seasons}</option></select></label><label>${c.search.season}<select data-search-season><option value="">${c.labels.all}</option>${catalog.seasons.map((season) => `<option value="${season.season}">${c.labels.season} ${String(season.season).padStart(2, "0")}</option>`).join("")}</select></label></div>
        <div class="catalog-search__status" aria-live="polite" data-search-status>${c.search.empty}</div>
        <ol class="search-results" data-search-results></ol>
        <template data-search-result-template><li><a><span class="search-result__type"></span><strong></strong><small></small></a></li></template>
      </section>`;
    return layout({ lang, title: c.nav.search, description: sl ? "Preiščite vprašanja, odgovore, tekmovalce in epizode Milijonarja." : "Search Milijonar questions, answers, contestants and episodes.", body, active: "search", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "search"), scripts: ["/assets/js/search.js"] });
  }
}
