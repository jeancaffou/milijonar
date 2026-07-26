import { copy } from "../lib/i18n.mjs";
import {
  breadcrumbs,
  episodeLabel,
  escapeHtml,
  evidenceGallery,
  formatDate,
  formatMoney,
  layout,
  pathFor,
  questionPath,
  questionOutcomeLabel,
} from "../lib/render.mjs";

function groupQuestions(questions) {
  const groups = new Map();
  for (const question of questions) {
    if (!groups.has(question.runId)) {
      groups.set(question.runId, {
        name: question.contestantName,
        contestantSlug: question.contestantSlug,
        questions: [],
      });
    }
    groups.get(question.runId).questions.push(question);
  }
  return [...groups.entries()];
}

function compactAnswers(question) {
  return ["A", "B", "C", "D"].map((letter) => {
    return `<span><b>${letter}</b> ${escapeHtml(question.answers[letter])}</span>`;
  }).join("");
}

export default class EpisodePage {
  data() {
    return {
      pagination: { data: "catalog.episodePages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/episodes/${data.page.episode.key}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, page }) {
    const { lang, episode } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const runEvidence = [...new Map(episode.contestantRuns.flatMap((run) => run.evidence).map((item) => [item.url, item])).values()];
    const body = `${breadcrumbs(lang, [{ label: c.nav.episodes, href: pathFor(lang, "episodes") }, { label: episodeLabel(episode) }])}
      <header class="page-hero episode-hero">
        <div><p class="eyebrow">${c.labels.episode}</p><h1>${episodeLabel(episode)}</h1><p><time datetime="${episode.airingDate}">${formatDate(episode.airingDate, lang)}</time></p><div class="episode-hero__links"><a href="${pathFor(lang, "season", episode.seasonKey)}">${c.labels.season} ${String(episode.season).padStart(2, "0")}</a><span>${escapeHtml(episode.hosts.join(", "))}</span></div></div>
        ${episode.featuredEvidence ? `<a class="episode-hero__frame" href="${episode.featuredEvidence.url}" target="_blank" rel="noopener"><img src="${episode.featuredEvidence.url}" alt="${sl ? "Arhivski posnetek epizode" : "Archive image from"} ${episodeLabel(episode)}" loading="eager"></a>` : ""}
      </header>
      <section class="episode-summary" aria-label="${sl ? "Povzetek epizode" : "Episode summary"}"><p><strong>${episode.questionCount}</strong><span>${c.labels.questions}</span></p><p><strong>${episode.runCount}</strong><span>${c.labels.hotSeatRuns}</span></p><p><strong>${episode.people.length}</strong><span>${c.labels.people}</span></p><p><strong>${formatMoney(episode.moneyAwarded, lang)}</strong><span>${sl ? "podeljeni dobitki" : "money awarded"}</span></p></section>

      <section class="run-section"><header class="section-heading"><p class="eyebrow">${sl ? "POTEK ODDAJE" : "EPISODE RUNS"}</p><h2>${c.labels.contestants}</h2></header><div class="run-ledger">${episode.contestantRuns
        .map((run, index) => `<article class="run-entry">
          <span class="run-entry__number">${String(index + 1).padStart(2, "0")}</span>
          <div class="run-entry__subject"><p class="overline">${run.fastFingersWinner ? c.labels.fastFingersWinner : c.labels.contestant}</p><h3>${run.millionaireContestant ? `<a href="${run.catalogRunId ? pathFor(lang, "run", run.catalogRunId) : pathFor(lang, "contestant", run.millionaireContestantSlug)}">${escapeHtml(run.millionaireContestant)}</a>` : c.labels.noData}</h3>${run.fastFingersWinner && run.fastFingersWinner !== run.millionaireContestant ? `<p>${c.labels.fastFingersWinner}: <a href="${pathFor(lang, "contestant", run.fastFingersWinnerSlug)}">${escapeHtml(run.fastFingersWinner)}</a></p>` : ""}</div>
          <div class="run-entry__lineup"><span>${c.labels.lineup}</span><p>${run.entrants.length ? run.entrants.map((entrant) => `<a href="${pathFor(lang, "contestant", entrant.slug)}">${escapeHtml(entrant.name)}</a>${entrant.location ? ` <small>${escapeHtml(entrant.location)}</small>` : ""}`).join(" · ") : c.labels.noData}</p></div>
          <div class="run-entry__prize"><span>${c.labels.winnings}</span><strong>${run.prizeStatus === "pending" ? c.labels.pending : run.prizeValue === null ? c.labels.noData : formatMoney(run.prizeValue, lang)}</strong></div>
        </article>`)
        .join("")}</div>
        ${runEvidence.length ? `<details class="evidence-disclosure"><summary>${sl ? "Posnetki tekmovalcev in Hitrih prstov" : "Contestant and Fastest Finger First frames"} (${runEvidence.length})</summary>${evidenceGallery(runEvidence, lang, episodeLabel(episode))}</details>` : ""}
      </section>

      <section class="episode-questions"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "VSA VPRAŠANJA" : "ALL QUESTIONS"}</p><h2>${c.labels.questions}</h2></div><span>${episode.questionCount}</span></header>${groupQuestions(episode.questions)
        .map(([runId, group]) => `<section class="question-run"><header><div><p class="overline">${c.labels.hotSeatRuns}</p><h3><a href="${pathFor(lang, "run", runId)}">${escapeHtml(group.name)}</a></h3></div><span>${c.labels.questions}: ${group.questions.length}</span></header><ol>${group.questions
          .map((question) => {
            const prompt = question.prompt;
            const correctText = question.answers[question.correctAnswer];
            return `<li><a href="${questionPath(question, lang)}"><span class="question-list__number">Q${question.questionNumber}</span><span class="question-list__copy"><strong ${lang === "en" ? 'lang="sl"' : ""}>${escapeHtml(prompt)}</strong><span class="question-list__answers"${lang === "en" ? ' lang="sl"' : ""}>${compactAnswers(question, lang)}</span><small class="question-list__correct">${c.labels.correctAnswer}: ${question.correctAnswer} · <span${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(correctText)}</span></small></span><span class="outcome outcome--${question.outcome}">${escapeHtml(questionOutcomeLabel(question, lang))}</span></a></li>`;
          })
          .join("")}</ol></section>`)
        .join("")}</section>
      <nav class="page-turner" aria-label="${sl ? "Sosednje epizode" : "Adjacent episodes"}">${episode.previousKey ? `<a rel="prev" href="${pathFor(lang, "episode", episode.previousKey)}"><span>${c.labels.previous}</span><strong>${episode.previousKey.toUpperCase()}</strong></a>` : "<span></span>"}${episode.nextKey ? `<a rel="next" href="${pathFor(lang, "episode", episode.nextKey)}"><span>${c.labels.next}</span><strong>${episode.nextKey.toUpperCase()}</strong></a>` : ""}</nav>`;

    return layout({ lang, title: episodeLabel(episode), description: sl ? `${episodeLabel(episode)}: ${formatDate(episode.airingDate, lang)}. Vprašanja, tekmovalci in arhivski posnetki.` : `${episodeLabel(episode)}: ${formatDate(episode.airingDate, lang)}. Questions, contestants and archive images.`, body, active: "episodes", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "episode", episode.key), pageType: "article", image: episode.featuredEvidence?.url || "", bodyClass: "episode-page" });
  }
}
