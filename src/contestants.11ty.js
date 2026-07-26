import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, escapeHtml, formatMoney, formatNumber, layout, pathFor } from "../lib/render.mjs";

export default class ContestantsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/contestants/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const moneyLeaders = catalog.people
      .filter((person) => person.totalContestantWinnings > 0)
      .sort((a, b) => b.totalContestantWinnings - a.totalContestantWinnings || b.furthestQuestion - a.furthestQuestion || a.name.localeCompare(b.name, "sl"))
      .slice(0, 12);
    const progressLeaders = catalog.people
      .filter((person) => person.furthestQuestion > 0)
      .sort((a, b) => b.furthestQuestion - a.furthestQuestion || b.totalContestantWinnings - a.totalContestantWinnings || a.name.localeCompare(b.name, "sl"))
      .slice(0, 12);
    const body = `${breadcrumbs(lang, [{ label: c.nav.contestants }])}
      <header class="page-hero page-hero--index"><p class="eyebrow">${formatNumber(catalog.people.length, lang)} ${sl ? "imen" : "names"}</p><h1>${c.nav.contestants}</h1><p>${sl ? "Kazalo vključuje prepoznane tekmovalce Hitrih prstov, njihove zmagovalce in tekmovalce na vročem stolu. Vsaka oseba je povezana z vsemi zabeleženimi nastopi." : "The index includes identified Fastest Finger First contestants, winners and hot-seat contestants. Each person links to every recorded appearance."}</p><a class="text-link" href="${pathFor(lang, "runs")}">${sl ? "Pregled celotnih iger" : "Browse complete runs"}</a></header>
      <section class="hall-of-fame"><header class="section-heading"><p class="eyebrow">${sl ? "REKORDI" : "HALL OF FAME"}</p><h2>${sl ? "Najuspešnejši tekmovalci" : "Leading contestants"}</h2><p>${sl ? "Dobitki se seštevajo po vseh igrah istega tekmovalca. Dobrodelni zneski niso vključeni v osebne dobitke." : "Winnings are accumulated across every run by the same contestant. Charity awards are excluded from personal winnings."}</p></header><div class="leaderboard-grid">
        <article class="leaderboard"><header><h3>${sl ? "Skupni dobitki" : "Total winnings"}</h3><span>${sl ? "vse igre skupaj" : "all runs combined"}</span></header><ol>${moneyLeaders.map((person, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><a href="${pathFor(lang, "contestant", person.slug)}">${escapeHtml(person.name)}</a><small>${person.hotSeatCount} ${sl ? person.hotSeatCount === 1 ? "igra" : "iger" : person.hotSeatCount === 1 ? "run" : "runs"}</small><strong>${formatMoney(person.totalContestantWinnings, lang)}</strong></li>`).join("")}</ol></article>
        <article class="leaderboard"><header><h3>${sl ? "Najvišje doseženo vprašanje" : "Furthest question reached"}</h3><span>${sl ? "najvišji položaj" : "highest position"}</span></header><ol>${progressLeaders.map((person, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><a href="${pathFor(lang, "contestant", person.slug)}">${escapeHtml(person.name)}</a><small>${person.questionCount} ${sl ? "zabeleženih vprašanj" : "recorded questions"}</small><strong>Q${person.furthestQuestion}</strong></li>`).join("")}</ol></article>
      </div></section>
      <section class="directory-tools" data-directory><div class="filter-strip"><label>${sl ? "Poiščite ime ali kraj" : "Find a name or place"}<input type="search" data-directory-input placeholder="${sl ? "npr. Alenka Potokar, Kranj" : "e.g. Alenka Potokar, Kranj"}"></label><label>${sl ? "Vloga" : "Role"}<select data-directory-role><option value="">${c.labels.all}</option><option value="hotseat">${c.labels.hotSeatRuns}</option><option value="winner">${c.labels.fastFingersWinner}</option><option value="lineup">${c.labels.lineup}</option></select></label><p aria-live="polite"><span data-directory-count>${formatNumber(catalog.people.length, lang)}</span> ${sl ? "oseb" : "people"}</p></div>
        <ol class="people-directory">${catalog.people.map((person) => {
          const roles = `${person.hotSeatCount ? "hotseat " : ""}${person.fastFingersWins ? "winner " : ""}${person.lineupAppearances.length ? "lineup" : ""}`;
          return `<li data-directory-entry data-role="${roles}" data-search="${escapeHtml(`${person.name} ${person.locations.join(" ")} ${person.episodes.map((episode) => episode.key).join(" ")}`.toLowerCase())}"><a href="${pathFor(lang, "contestant", person.slug)}"><span class="person-initial">${escapeHtml(person.name.charAt(0).toUpperCase())}</span><span class="person-name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.locations.slice(0, 2).join(" · ") || (sl ? "kraj ni naveden" : "location not recorded"))}</small></span><span class="person-record">${person.hotSeatCount ? `${c.labels.questions}: <b>${person.questionCount}</b>` : person.fastFingersWins ? `${sl ? "Zmage v Hitrih prstih" : "Fastest Finger First wins"}: <b>${person.fastFingersWins}</b>` : `${sl ? "Nastopi v Hitrih prstih" : "Fastest Finger First appearances"}: <b>${person.lineupAppearances.length}</b>`}${person.totalContestantWinnings ? `<small>${formatMoney(person.totalContestantWinnings, lang)}</small>` : ""}</span></a></li>`;
        }).join("")}</ol>
      </section>`;
    return layout({ lang, title: c.nav.contestants, description: sl ? "Abecedno kazalo tekmovalcev oddaje Milijonar in njihovih nastopov." : "Alphabetical index of Milijonar contestants and their appearances.", body, active: "contestants", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "contestants") });
  }
}
