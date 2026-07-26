import { copy } from "../lib/i18n.mjs";
import {
  breadcrumbs,
  escapeHtml,
  formatDate,
  formatMoney,
  formatNumber,
  layout,
  pathFor,
} from "../lib/render.mjs";

export default class RunsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/runs/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const body = `${breadcrumbs(lang, [{ label: c.labels.hotSeatRuns }])}
      <header class="page-hero page-hero--index"><p class="eyebrow">${formatNumber(catalog.runs.length, lang)} ${sl ? "celotnih iger" : "complete runs"}</p><h1>${c.labels.hotSeatRuns}</h1><p>${sl ? "Vsaka stran združi celotno zaporedje tekmovalčevih vprašanj. Nadaljevanja čez več epizod ostanejo v eni igri." : "Each page joins a contestant's complete question sequence. Continuations across episodes remain in one run."}</p></header>
      <section class="filter-strip" data-table-filter>
        <label>${sl ? "Poiščite tekmovalca, epizodo ali leto" : "Find a contestant, episode or year"}<input type="search" data-filter-input placeholder="${sl ? "npr. Alenka Potokar, S06E55" : "e.g. Alenka Potokar, S06E55"}"></label>
        <label>${c.labels.season}<select data-filter-season><option value="">${c.labels.all}</option>${catalog.seasons.map((season) => `<option value="${season.season}">${c.labels.season} ${String(season.season).padStart(2, "0")}</option>`).join("")}</select></label>
        <p><span data-filter-count>${formatNumber(catalog.runs.length, lang)}</span> ${sl ? "iger" : "runs"}</p>
      </section>
      <div class="table-shell"><table class="episode-ledger episode-ledger--all"><thead><tr><th>${c.labels.contestant}</th><th>${c.labels.episodes}</th><th>${c.labels.airingDate}</th><th>${c.labels.questions}</th><th>${c.labels.winnings}</th></tr></thead><tbody>${catalog.runs.map((run) => {
        const firstEpisode = catalog.episodeByKey[run.episodes[0]];
        const season = firstEpisode?.season || Number.parseInt(run.episodes[0]?.slice(1, 3), 10) || 0;
        const episodes = run.episodes.map((key) => key.toUpperCase()).join(" · ");
        const result = run.prizeStatus === "pending" ? c.labels.pending : run.prizeValue === null ? c.labels.noData : formatMoney(run.prizeValue, lang);
        const search = `${run.contestantName} ${episodes} ${run.airingDateStart} ${run.airingDateEnd} ${result}`.toLowerCase();
        return `<tr data-filter-row data-season="${season}" data-search="${escapeHtml(search)}"><td><a href="${pathFor(lang, "run", run.id)}"><strong>${escapeHtml(run.contestantName)}</strong></a></td><td>${escapeHtml(episodes)}</td><td><time datetime="${run.airingDateStart}">${formatDate(run.airingDateStart, lang)}</time>${run.airingDateEnd && run.airingDateEnd !== run.airingDateStart ? `<br><small>${formatDate(run.airingDateEnd, lang)}</small>` : ""}</td><td>${formatNumber(run.questionCount, lang)}</td><td><strong>${escapeHtml(result)}</strong></td></tr>`;
      }).join("")}</tbody></table></div>`;
    return layout({
      lang,
      title: c.labels.hotSeatRuns,
      description: sl
        ? "Imenik celotnih iger na vročem stolu z vprašanji, odgovori, rezultati in arhivskimi posnetki."
        : "Directory of complete hot-seat runs with questions, answers, results and archive images.",
      body,
      active: "contestants",
      alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "runs"),
      bodyClass: "runs-index-page",
    });
  }
}
