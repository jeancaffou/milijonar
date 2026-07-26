import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, episodeLabel, escapeHtml, formatDate, formatNumber, layout, pathFor, statBar } from "../lib/render.mjs";

export default class SeasonPage {
  data() {
    return {
      pagination: { data: "catalog.seasonPages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/seasons/${data.page.season.key}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ page }) {
    const { lang, season } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const maxLetter = Math.max(...Object.values(season.answerDistribution));
    const body = `${breadcrumbs(lang, [{ label: c.nav.seasons, href: pathFor(lang, "seasons") }, { label: `${c.labels.season} ${String(season.season).padStart(2, "0")}` }])}
      <header class="page-hero season-hero"><div><p class="eyebrow">${formatDate(season.dateStart, lang)} · ${formatDate(season.dateEnd, lang)}</p><h1>${c.labels.season} <span>${String(season.season).padStart(2, "0")}</span></h1><p>${sl ? `${season.originalEpisodeCount} izvirnih epizod, ${formatNumber(season.questionCount, lang)} katalogiziranih vprašanj in ${formatNumber(season.peopleCount, lang)} imen.` : `${season.originalEpisodeCount} original episodes, ${formatNumber(season.questionCount, lang)} catalogued questions and ${formatNumber(season.peopleCount, lang)} names.`}</p></div><dl class="hero-facts"><div><dt>${c.labels.host}</dt><dd>${escapeHtml(season.hosts.join(", "))}</dd></div><div><dt>${c.labels.episodes}</dt><dd>${season.episodeCount}/${season.originalEpisodeCount}</dd></div><div><dt>${c.labels.hotSeatRuns}</dt><dd>${formatNumber(season.runCount, lang)}</dd></div></dl></header>
      <section class="season-answer-profile"><header><p class="eyebrow">${sl ? "PROFIL ODGOVOROV" : "ANSWER PROFILE"}</p><h2>${sl ? "Položaj pravilnih odgovorov" : "Correct-answer positions"}</h2></header><div>${["A", "B", "C", "D"].map((letter) => statBar({ label: letter, value: season.answerDistribution[letter], max: maxLetter, display: formatNumber(season.answerDistribution[letter], lang), className: `letter-${letter.toLowerCase()}` })).join("")}</div></section>
      <section class="episode-ledger"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "KAZALO SEZONE" : "SEASON INDEX"}</p><h2>${c.labels.episodes}</h2></div><span>${season.episodeSlots.length} ${sl ? "mest v zaporedju" : "positions in sequence"}</span></header>
        <div class="table-wrap"><table><thead><tr><th>${c.labels.episode}</th><th>${c.labels.airingDate}</th><th>${c.labels.contestants}</th><th>${c.labels.questions}</th><th>${sl ? "Stanje" : "Status"}</th></tr></thead><tbody>${season.episodeSlots
          .map((episode) => episode.available ? `<tr><td><a class="episode-code" href="${pathFor(lang, "episode", episode.key)}">${episodeLabel(episode)}</a></td><td><time datetime="${episode.airingDate}">${formatDate(episode.airingDate, lang)}</time></td><td>${episode.people.slice(0, 4).map((name) => escapeHtml(name)).join(", ")}${episode.people.length > 4 ? ` <span class="muted">+${episode.people.length - 4}</span>` : ""}</td><td>${episode.questionCount}</td><td><span class="status status--available">${c.labels.available}</span></td></tr>` : `<tr class="is-unavailable"><td><a class="episode-code" href="${pathFor(lang, "episode", episode.key)}">${episodeLabel(episode)}</a></td><td>${c.labels.noData}</td><td colspan="2">${sl ? "Epizoda ni vključena v razpoložljivo gradivo kataloga." : "This episode is not included in the available catalogue material."}</td><td><span class="status status--unavailable">${c.labels.unavailable}</span></td></tr>`)
          .join("")}</tbody></table></div>
      </section>`;
    return layout({ lang, title: `${c.labels.season} ${String(season.season).padStart(2, "0")}`, description: sl ? `Epizode in vprašanja ${season.season}. sezone.` : `Episodes and questions from Season ${season.season}.`, body, active: "seasons", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "season", season.key) });
  }
}
