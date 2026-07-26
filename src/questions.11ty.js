import { copy } from "../lib/i18n.mjs";
import { questionPositionMenu } from "../lib/question-positions.mjs";
import { breadcrumbs, escapeHtml, formatNumber, layout, pathFor, questionPath, searchForm, statBar } from "../lib/render.mjs";

export default class QuestionsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/questions/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const distribution = catalog.stats.answerDistribution;
    const maximum = Math.max(...Object.values(distribution));
    const sample = [...catalog.questions].slice(-16).reverse();
    const body = `${breadcrumbs(lang, [{ label: c.nav.questions }])}
      <header class="page-hero page-hero--search"><p class="eyebrow">${c.labels.questions.toUpperCase()} · ${formatNumber(catalog.stats.questions, lang)}</p><h1>${c.nav.questions}</h1><p>${sl ? "Iščite po besedilu vprašanja, vseh štirih možnostih, tekmovalcu ali epizodi. Rezultat odpre vprašanje znotraj celotne igre tekmovalca ter prikaže pravilni odgovor in povezane posnetke." : "Search by the original Slovenian question wording, all four options, contestant or episode. Questions and answers remain in Slovenian to preserve wordplay and meaning. Each result opens the question within the contestant's complete run."}</p>${searchForm(lang)}<a class="text-link" href="${pathFor(lang, "runs")}">${sl ? `Pregled ${formatNumber(catalog.runs.length, lang)} celotnih iger` : `Browse ${formatNumber(catalog.runs.length, lang)} complete runs`}</a></header>
      <section class="question-position-directory" aria-labelledby="position-directory-heading">
        <header class="section-heading"><p class="eyebrow">${sl ? "ZAPOREDNA ŠTEVILKA" : "QUESTION POSITION"}</p><h2 id="position-directory-heading">${sl ? "Vprašanja po zaporedni številki" : "Questions by position"}</h2><p>${sl ? "Izberite Q1–Q14 za pregled vseh vprašanj z izbrano zaporedno številko." : "Choose Q1–Q14 to browse every question at that position in the game."}</p></header>
        ${questionPositionMenu(catalog.stats.questionPosition, lang)}
      </section>
      <section class="topic-guide-callout"><div><p class="eyebrow">${sl ? "VODNIK ZA PRIPRAVO" : "PREPARATION GUIDE"}</p><h2>${sl ? "Katere teme se pojavljajo najpogosteje?" : "Which topics appear most often?"}</h2><p>${sl ? "Preglejte vsa vprašanja po učnih področjih, razvrščenih od najpogostejših do najredkejših." : "Browse every question by study subject, ranked from most to least frequent."}</p></div><a class="button-link" href="${pathFor(lang, "topics")}">${sl ? "Odpri teme vprašanj" : "Open question topics"}</a></section>
      <section class="question-index-grid">
        <div class="question-index-seasons"><header><p class="eyebrow">${sl ? "BRSKANJE" : "BROWSE"}</p><h2>${sl ? "Vprašanja po sezonah" : "Questions by season"}</h2></header><ol>${catalog.seasons.map((season) => `<li><a href="${pathFor(lang, "season", season.key)}"><span>${c.labels.season} ${String(season.season).padStart(2, "0")}</span><strong>${formatNumber(season.questionCount, lang)}</strong><small>${season.dateStart.slice(0, 4)}–${season.dateEnd.slice(0, 4)}</small></a></li>`).join("")}</ol></div>
        <div class="question-index-letters"><header><p class="eyebrow">${sl ? "VSE SEZONE" : "ALL SEASONS"}</p><h2>${sl ? "Pravilni odgovori" : "Correct answers"}</h2></header>${["A", "B", "C", "D"].map((letter) => statBar({ label: letter, value: distribution[letter], max: maximum, display: `${formatNumber(distribution[letter], lang)} · ${formatNumber((distribution[letter] / catalog.stats.questions) * 100, lang)}%`, className: `letter-${letter.toLowerCase()}` })).join("")}<a class="text-link" href="${pathFor(lang, "statistics")}">${sl ? "Celotna statistika" : "Full statistics"}</a></div>
      </section>
      <section class="repeated-questions" aria-labelledby="repeated-questions-heading"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "PONOVITVE" : "REPEATED QUESTIONS"}</p><h2 id="repeated-questions-heading">${sl ? "Ponovljena in podobno zastavljena vprašanja" : "Repeated and closely reworded questions"}</h2><p>${sl ? "Skupine povezujejo povsem enaka vprašanja ter zelo podobne različice z istim pravilnim odgovorom in primerljivimi možnostmi." : "Groups connect exact repeats and conservative near matches with the same correct answer and comparable answer options."}</p></div><span>${formatNumber(catalog.repeatedQuestionGroups.length, lang)} ${sl ? "skupin" : "groups"}</span></header><div class="repeat-group-grid">${catalog.repeatedQuestionGroups.map((group) => {
        const representative = group.questions[0];
        const representativePrompt = representative.prompt;
        const kind = group.kind === "exact" ? (sl ? "Enako besedilo" : "Exact wording") : (sl ? "Podobno besedilo" : "Close wording");
        const occurrenceLabel = sl ? `${group.occurrences} pojavitev` : `${group.occurrences} occurrences`;
        return `<details class="repeat-group repeat-group--${group.kind}"><summary><span>${kind}</span><strong${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(representativePrompt)}</strong><small>${occurrenceLabel}</small></summary><ol>${group.questions.map((question) => {
          const prompt = question.prompt;
          return `<li><a href="${questionPath(question, lang)}"><span>${question.episodeKey.toUpperCase()} · Q${question.questionNumber}</span><strong${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(prompt)}</strong><small>${escapeHtml(question.contestantName)}</small></a></li>`;
        }).join("")}</ol></details>`;
      }).join("")}</div></section>
      <section class="recent-questions"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "ZADNJE EPIZODE" : "LATEST EPISODES"}</p><h2>${sl ? "Nedavno predvajana vprašanja" : "Recently aired questions"}</h2></div><a class="text-link" href="${pathFor(lang, "search")}">${sl ? "Napredno iskanje" : "Advanced search"}</a></header><ol>${sample.map((question) => {
        const prompt = question.prompt;
        return `<li><a href="${questionPath(question, lang)}"><span>Q${question.questionNumber}</span><strong ${lang === "en" ? 'lang="sl"' : ""}>${escapeHtml(prompt)}</strong><small>${question.episodeKey.toUpperCase()} · ${escapeHtml(question.contestantName)}</small></a></li>`;
      }).join("")}</ol></section>`;
    return layout({ lang, title: c.nav.questions, description: sl ? "Preiščite vsa katalogizirana vprašanja Milijonarja." : "Search every catalogued Milijonar question.", body, active: "questions", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "questions") });
  }
}
