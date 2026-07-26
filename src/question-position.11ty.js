import { copy } from "../lib/i18n.mjs";
import { questionCountText, questionPositionMenu } from "../lib/question-positions.mjs";
import {
  breadcrumbs,
  escapeHtml,
  formatDate,
  formatNumber,
  formatPercent,
  layout,
  pathFor,
  questionPath,
} from "../lib/render.mjs";

function questionEntry(question, lang) {
  const c = copy[lang];
  const sl = lang === "sl";
  const prompt = question.prompt;
  const correctLetter = question.correctAnswer;
  const answer = correctLetter
    ? question.answers[correctLetter]
    : c.labels.noData;
  const promptLanguage = lang === "en" ? ' lang="sl"' : "";
  const answerLanguage = lang === "en" ? ' lang="sl"' : "";

  return `<li>
    <a href="${questionPath(question, lang)}">
      <span class="position-question-list__episode"><strong>${question.episodeKey.toUpperCase()}</strong><small>${escapeHtml(formatDate(question.airingDate, lang))}</small></span>
      <span class="position-question-list__copy"><strong${promptLanguage}>${escapeHtml(prompt)}</strong><small>${escapeHtml(question.contestantName)}${question.prize ? ` · ${escapeHtml(question.prize)}` : ""}</small></span>
      <span class="position-question-list__answer"><small>${sl ? "Pravilni odgovor" : "Correct answer"}</small><strong${answerLanguage}>${correctLetter ? `${correctLetter} · ` : ""}${escapeHtml(answer)}</strong></span>
    </a>
  </li>`;
}

export default class QuestionPositionPage {
  data() {
    return {
      pagination: { data: "catalog.questionPositionPages", size: 1, alias: "positionPage" },
      permalink: (data) => `/${data.positionPage.lang}/questions/positions/q${data.positionPage.position.number}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, positionPage }) {
    const { lang, position } = positionPage;
    const c = copy[lang];
    const sl = lang === "sl";
    const questions = catalog.questions.filter((question) => question.questionNumber === position.number);
    const groupedSeasons = catalog.seasons
      .map((season) => ({
        season,
        questions: questions.filter((question) => question.season === season.season),
      }))
      .filter((group) => group.questions.length);
    const correctRate = position.played ? position.correct / position.played : null;
    const positionId = `q${position.number}`;
    const title = sl ? `Vprašanja Q${position.number}` : `Q${position.number} questions`;
    const intro = sl
      ? `Vsa katalogizirana vprašanja z zaporedno številko Q${position.number}, urejena po sezoni in datumu predvajanja. Vsak zapis odpre vprašanje v celotni igri tekmovalca.`
      : `Every catalogued Q${position.number} question, ordered by season and air date. Each entry opens the question within the contestant's complete run.`;

    const body = `${breadcrumbs(lang, [
      { label: c.nav.questions, href: pathFor(lang, "questions") },
      { label: `Q${position.number}` },
    ])}
      <header class="page-hero question-position-hero">
        <div><p class="eyebrow">${sl ? `${position.number}. VPRAŠANJE` : `QUESTION ${position.number}`} · ${questionCountText(position.total, lang).toUpperCase()}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div>
        <dl class="hero-facts">
          <div><dt>${sl ? "Vseh vprašanj" : "Total questions"}</dt><dd>${formatNumber(position.total, lang)}</dd></div>
          <div><dt>${sl ? "Vprašanj za dobitek" : "Played for stakes"}</dt><dd>${formatNumber(position.played, lang)}</dd></div>
          <div><dt>${sl ? "Uspešnost" : "Accuracy"}</dt><dd>${correctRate === null ? c.labels.noData : formatPercent(correctRate, lang)}</dd></div>
        </dl>
      </header>

      <section class="question-position-directory question-position-directory--compact" aria-labelledby="position-navigation-heading">
        <header class="section-heading"><p class="eyebrow">${sl ? "HITRI PREGLED" : "QUICK BROWSE"}</p><h2 id="position-navigation-heading">${sl ? "Druge zaporedne številke" : "Other question positions"}</h2></header>
        ${questionPositionMenu(catalog.stats.questionPosition, lang, position.number)}
      </section>

      <section class="position-results" aria-labelledby="position-results-heading">
        <header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "KRONOLOŠKI SEZNAM" : "CHRONOLOGICAL LIST"}</p><h2 id="position-results-heading">${sl ? `Vsa vprašanja Q${position.number}` : `All Q${position.number} questions`}</h2></div><span>${formatNumber(position.total, lang)}</span></header>
        ${groupedSeasons.map(({ season, questions: seasonQuestions }) => `<section class="position-season" id="${season.key}">
          <header><h3>${c.labels.season} ${String(season.season).padStart(2, "0")}</h3><span>${questionCountText(seasonQuestions.length, lang)}</span></header>
          <ol class="position-question-list">${seasonQuestions.map((question) => questionEntry(question, lang)).join("")}</ol>
        </section>`).join("")}
      </section>`;

    return layout({
      lang,
      title,
      description: sl
        ? `Pregled vseh vprašanj Q${position.number} v katalogu oddaje Milijonar.`
        : `Browse every Q${position.number} question in the Milijonar catalogue.`,
      body,
      active: "questions",
      alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "questionPosition", positionId),
      bodyClass: "question-position-page",
    });
  }
}
