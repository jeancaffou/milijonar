import { copy } from "../lib/i18n.mjs";
import { questionCountText } from "../lib/question-positions.mjs";
import {
  breadcrumbs,
  escapeHtml,
  formatMoney,
  formatNumber,
  formatPercent,
  layout,
  pathFor,
  statBar,
} from "../lib/render.mjs";

export default class StatisticsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/statistics/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const answerMax = Math.max(...Object.values(catalog.stats.answerDistribution));
    const seasonMax = Math.max(...catalog.seasons.map((season) => season.questionCount));
    const lifelineMax = Math.max(...Object.values(catalog.stats.lifelineDistribution));
    const prizeMax = Math.max(...catalog.stats.prizeDistribution.map((item) => item.count));
    const body = `${breadcrumbs(lang, [{ label: c.nav.statistics }])}
      <header class="page-hero stats-hero"><div><p class="eyebrow">${sl ? "CELOTEN KATALOG" : "FULL CATALOGUE"}</p><h1>${c.nav.statistics}</h1><p>${sl ? "Opisna statistika vprašanj, odgovorov, pomoči, dobitkov in obsega kataloga. Poglobljena analiza zaporedij preverja, ali je mogoče iz preteklih črk napovedati prihodnje odgovore." : "Descriptive statistics for questions, answers, lifelines, winnings and catalogue coverage. The in-depth sequence analysis tests whether past answer letters predict future answers."}</p></div><a class="analysis-medallion" href="${pathFor(lang, "patterns")}"><span>${sl ? "223.677 PREIZKUSOV" : "223,677 TESTS"}</span><strong>${sl ? "Brez potrjenega napovednega pravila" : "No confirmed predictive rule"}</strong><small>${sl ? "Odpri analizo zaporedij" : "Open sequence analysis"}</small></a></header>
      <section class="scope-ledger"><article><span>01</span><strong>${formatNumber(catalog.stats.questions, lang)}</strong><p>${c.labels.questions}</p><small>${formatNumber(catalog.patternResults.filters.played_for_stakes, lang)} ${sl ? "vprašanj za dobitek" : "played for stakes"}</small></article><article><span>02</span><strong>${formatNumber(catalog.stats.availableEpisodes, lang)}</strong><p>${c.labels.episodes}</p><small>${catalog.stats.originalEpisodes} ${sl ? "izvirnih, ena ni na voljo" : "original, one unavailable"}</small></article><article><span>03</span><strong>${formatNumber(catalog.stats.people, lang)}</strong><p>${c.labels.people}</p><small>${formatNumber(catalog.stats.hotSeatRuns, lang)} ${sl ? "enoličnih celotnih iger" : "deduplicated complete runs"}</small></article><article><span>04</span><strong>${formatNumber(catalog.stats.evidenceImages, lang)}</strong><p>${c.labels.evidence}</p><small>${sl ? "enoličnih posnetkov JPG" : "unique JPG frames"}</small></article></section>

      <section class="stats-grid">
        <article class="stats-panel stats-panel--answers"><header><p class="eyebrow">${sl ? "PORAZDELITEV ODGOVOROV" : "ANSWER DISTRIBUTION"}</p><h2>${sl ? "Položaji pravilnih odgovorov" : "Correct-answer positions"}</h2><p>${sl ? "Vseh 9.536 vprašanj, vključno s prvimi vprašanji in prikazanimi vprašanji brez vpliva na dobitek." : "All 9,536 questions, including first questions and displayed no-stakes questions."}</p></header><div>${["A", "B", "C", "D"].map((letter) => statBar({ label: letter, value: catalog.stats.answerDistribution[letter], max: answerMax, display: `${formatNumber(catalog.stats.answerDistribution[letter], lang)} · ${formatPercent(catalog.stats.answerDistribution[letter] / catalog.stats.questions, lang)}`, className: `letter-${letter.toLowerCase()}` })).join("")}</div><p class="panel-note">${sl ? "B in C sta skupaj pogostejša, vendar ta razlika ne napoveduje posameznega naslednjega odgovora." : "B and C are more common overall, but that imbalance does not predict an individual next answer."}</p></article>
        <article class="stats-panel stats-panel--seasons"><header><p class="eyebrow">${sl ? "OBSEG PO SEZONAH" : "SCOPE BY SEASON"}</p><h2>${sl ? "Katalogizirana vprašanja" : "Catalogued questions"}</h2></header><div>${catalog.seasons.map((season) => statBar({ label: `S${String(season.season).padStart(2, "0")}`, value: season.questionCount, max: seasonMax, display: formatNumber(season.questionCount, lang) })).join("")}</div></article>
      </section>

      <section class="position-analysis"><header class="section-heading"><p class="eyebrow">${sl ? "NAPREDOVANJE PO LESTVICI" : "LADDER PROGRESSION"}</p><h2>${sl ? "Število vprašanj po zaporedni številki" : "Question count by position"}</h2><p>${sl ? "Višje zaporedne številke so redkejše, ker se igre končajo z napačnim odgovorom ali odstopom. Pri izračunu uspešnosti niso upoštevana zamenjana vprašanja in ugibanja po odstopu. Izberite stolpec za seznam vseh vprašanj z izbrano zaporedno številko." : "Higher positions are rarer because runs end on an incorrect answer or walk-away. The accuracy calculation excludes switched boards and guesses made after walking away. Select a column to browse every question at that position."}</p></header><div class="position-chart">${catalog.stats.questionPosition.map((position) => {
        const accuracy = position.accuracy === null ? "" : formatPercent(position.accuracy, lang, 0);
        const accessibleLabel = sl
          ? `Q${position.number}: ${questionCountText(position.total, lang)}${accuracy ? `; uspešnost ${accuracy}` : ""}`
          : `Q${position.number}: ${formatNumber(position.total, lang)} questions${accuracy ? `; ${accuracy} accuracy` : ""}`;
        return `<a class="position-chart__column" href="${pathFor(lang, "questionPosition", `q${position.number}`)}" aria-label="${escapeHtml(accessibleLabel)}"><span class="position-chart__bar" style="height:${Math.max(1, (position.total / catalog.stats.questionPosition[0].total) * 100).toFixed(2)}%"><i>${formatNumber(position.total, lang)}</i></span><strong>Q${position.number}</strong><small>${accuracy}</small></a>`;
      }).join("")}</div></section>

      <section class="stats-grid">
        <article class="stats-panel"><header><p class="eyebrow">${sl ? "POMOČI" : "LIFELINES"}</p><h2>${sl ? "Zabeležene uporabe" : "Recorded uses"}</h2><p>${sl ? "Štejejo vrstice vprašanj, na katerih je posamezna pomoč navedena." : "Counts question rows on which each lifeline is recorded."}</p></header><div>${Object.entries(catalog.stats.lifelineDistribution).map(([key, value]) => statBar({ label: c.lifelineNames[key], value, max: lifelineMax, display: formatNumber(value, lang) })).join("")}</div></article>
        <article class="stats-panel stats-panel--prizes"><header><p class="eyebrow">${sl ? "KONČNI REZULTATI" : "FINAL OUTCOMES"}</p><h2>${sl ? "Dobitki celotnih iger" : "Complete-run winnings"}</h2><p>${sl ? "Nadaljevanja čez več epizod so združena, zato je vsaka igra v porazdelitvi prešteta enkrat." : "Continuations across episodes are joined, so each complete run is counted once in this distribution."}</p></header><div class="prize-bars">${catalog.stats.prizeDistribution.map((item) => statBar({ label: formatMoney(item.value, lang), value: item.count, max: prizeMax, display: formatNumber(item.count, lang) })).join("")}</div></article>
      </section>

      <section class="top-winnings"><header class="section-heading"><p class="eyebrow">${sl ? "NAJVIŠJI ZABELEŽENI DOBITKI" : "HIGHEST RECORDED WINNINGS"}</p><h2>${c.labels.contestants}</h2></header><ol>${catalog.stats.topPeople.slice(0, 12).map((person, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><a href="${pathFor(lang, "contestant", person.slug)}">${escapeHtml(person.name)}</a><strong>${formatMoney(person.maxPrize, lang)}</strong><small>${person.episodes.map((episode) => episode.key.toUpperCase()).join(" · ")}</small></li>`).join("")}</ol></section>

      <section class="method-banner"><div><p class="eyebrow">${sl ? "ANALIZA ZAPOREDIJ" : "SEQUENCE ANALYSIS"}</p><h2>${sl ? "Vzorci v zaporedju odgovorov" : "Patterns in answer sequences"}</h2><p>${sl ? "Razširjena analiza preverja kratka in dolga zaporedja, zamike, cikle, stiskanje, modele zgodovine ter več kot 221.000 algebraičnih rekurenc. Rezultati, izbrani na S08, so nato ocenjeni na ločeni testni množici S09–S10." : "The expanded analysis tests short and long sequences, lags, cycles, compression, history models and more than 221,000 algebraic recurrences. Results selected on S08 are then evaluated on a separate S09–S10 test set."}</p></div><a class="button-link" href="${pathFor(lang, "patterns")}">${sl ? "Celotna interaktivna analiza" : "Full interactive analysis"}</a></section>`;
    return layout({ lang, title: c.nav.statistics, description: sl ? "Statistični pregled vprašanj, odgovorov, pomoči, dobitkov in vzorcev Milijonarja." : "Statistical overview of Milijonar questions, answers, lifelines, winnings and patterns.", body, active: "statistics", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "statistics"), bodyClass: "statistics-page" });
  }
}
