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
  questionOutcomeLabel,
  renderQuestionBoard,
} from "../lib/render.mjs";
import { selectRunProfileImage } from "../lib/profile-image.mjs";

function compactAnswers(question) {
  return ["A", "B", "C", "D"].map((letter) => {
    return `<span><b>${letter}</b> ${escapeHtml(question.answers[letter])}</span>`;
  }).join("");
}

function runPath(lang, runOrId) {
  const id = typeof runOrId === "string" ? runOrId : runOrId?.id;
  return id ? pathFor(lang, "run", id) : "";
}

function anchorFor(question) {
  const raw = question.stableAnchor || question.anchor || `q-${question.id}`;
  return String(raw)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function episodeFromReference(reference, catalog) {
  if (!reference) return null;
  if (typeof reference === "string") return catalog.episodeByKey?.[reference] || { key: reference };
  if (reference.key && catalog.episodeByKey?.[reference.key]) return catalog.episodeByKey[reference.key];
  return reference;
}

function episodeCode(episode) {
  if (!episode) return "";
  if (episode.season !== undefined && episode.episode !== undefined) return episodeLabel(episode);
  return String(episode.key || "").toUpperCase();
}

function episodeHref(lang, episode) {
  return episode?.key ? pathFor(lang, "episode", episode.key) : "";
}

function runResult(run, lang, labels) {
  const status = run.status || run.prizeStatus;
  if (status === "pending") return labels.pending;
  if (run.prizeValue !== null && run.prizeValue !== undefined) return formatMoney(run.prizeValue, lang);
  if (typeof run.winnings === "number") return formatMoney(run.winnings, lang);
  if (run.winnings) return String(run.winnings);
  return labels.noData;
}

function dateRange(start, end, lang, labels) {
  if (!start && !end) return labels.noData;
  if (!end || start === end) {
    const value = start || end;
    return `<time datetime="${escapeHtml(value)}">${formatDate(value, lang)}</time>`;
  }
  return `<time datetime="${escapeHtml(start)}">${formatDate(start, lang)}</time><span aria-hidden="true"> – </span><time datetime="${escapeHtml(end)}">${formatDate(end, lang)}</time>`;
}

function questionCountText(count, lang) {
  if (lang !== "sl") return `${count} ${count === 1 ? "question" : "questions"}`;
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14
    ? "vprašanj"
    : last === 1
      ? "vprašanje"
      : last === 2
        ? "vprašanji"
        : last === 3 || last === 4
          ? "vprašanja"
          : "vprašanj";
  return `${count} ${word}`;
}

function questionEpisode(question, episodes, catalog) {
  if (question.episodeKey && catalog.episodeByKey?.[question.episodeKey]) {
    return catalog.episodeByKey[question.episodeKey];
  }
  return episodes.find((episode) => episode?.key === question.episodeKey) || episodes[0] || null;
}

export default class RunPage {
  data() {
    return {
      pagination: { data: "catalog.runPages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/runs/${data.page.run.id}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, page }) {
    const { lang, run } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const questions = run.questions || [];
    const evidence = run.evidence || [];
    const episodes = (run.episodes || [])
      .map((episode) => episodeFromReference(episode, catalog))
      .filter(Boolean);
    const hosts = Array.isArray(run.hostNames)
      ? run.hostNames
      : run.hostNames
        ? [run.hostNames]
        : [];
    const profileHref = pathFor(lang, "contestant", run.contestantSlug);
    const episodeLinks = episodes.length
      ? episodes
          .map((episode) => {
            const label = episodeCode(episode);
            const href = episodeHref(lang, episode);
            return href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label);
          })
          .join(" · ")
      : c.labels.noData;
    const firstQuestionEvidence = questions
      .map((question) => question.primaryEvidence || question.evidence?.[0])
      .find(Boolean);
    const person = catalog.personBySlug?.[run.contestantSlug];
    const logicalRuns = (person?.catalogRunIds || [])
      .map((id) => catalog.runById?.[id])
      .filter(Boolean);
    const selectedHero = selectRunProfileImage(
      person,
      catalog.contestantRuns,
      run,
      logicalRuns,
      catalog.episodeByKey,
      catalog.profileAuditByKey,
    );
    const heroImage = selectedHero?.item || firstQuestionEvidence || evidence[0] || null;
    const sharedEvidence = evidence.filter((item) => item.url !== heroImage?.url);
    const result = runResult(run, lang, c.labels);
    const previousRun = typeof run.previousRun === "string" ? catalog.runById?.[run.previousRun] : run.previousRun;
    const nextRun = typeof run.nextRun === "string" ? catalog.runById?.[run.nextRun] : run.nextRun;
    const runLabel = sl ? "Igra na vročem stolu" : "Hot-seat run";
    const questionCountLabel = questionCountText(questions.length, lang);
    const initials = run.contestantName
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const heroImageAlt = selectedHero?.source === "contestant-introduction"
      ? (sl ? `${run.contestantName} med predstavitvijo tekmovalcev` : `${run.contestantName} during the contestant introductions`)
      : (sl ? `${run.contestantName} med to igro na vročem stolu` : `${run.contestantName} during this hot-seat run`);

    const body = `${breadcrumbs(lang, [
      { label: c.nav.contestants, href: pathFor(lang, "contestants") },
      { label: run.contestantName, href: profileHref },
      { label: runLabel },
    ])}
      <header class="page-hero person-hero${heroImage ? " person-hero--with-image" : ""}">
        <div class="person-hero__intro">
          ${heroImage ? "" : `<div class="person-monogram" aria-hidden="true">${escapeHtml(initials)}</div>`}
          <div class="person-hero__copy">
            <p class="eyebrow">${runLabel}</p>
            <h1>${escapeHtml(run.contestantName)}</h1>
            <p>${episodeLinks}</p>
            <p><a class="text-link" href="${profileHref}">${c.labels.viewContestant}</a></p>
          </div>
          <dl class="hero-facts">
            <div><dt>${c.labels.airingDate}</dt><dd>${dateRange(run.airingDateStart, run.airingDateEnd, lang, c.labels)}</dd></div>
            <div><dt>${c.labels.questions}</dt><dd>${questions.length}</dd></div>
            <div><dt>${c.labels.host}</dt><dd>${hosts.length ? escapeHtml(hosts.join(", ")) : c.labels.noData}</dd></div>
            <div><dt>${c.labels.winnings}</dt><dd>${escapeHtml(result)}</dd></div>
          </dl>
        </div>
        ${heroImage ? `<a class="person-hero__frame" href="${heroImage.url}" target="_blank" rel="noopener" aria-label="${escapeHtml(sl ? `Odpri posnetek: ${run.contestantName}` : `Open image: ${run.contestantName}`)}"><img src="${heroImage.url}" alt="${escapeHtml(heroImageAlt)}" loading="eager"></a>` : ""}
      </header>

      ${questions.length ? `<nav class="question-run" aria-label="${sl ? "Vprašanja v tej igri" : "Questions in this run"}">
        <header><div><p class="eyebrow">${sl ? "PREGLED IGRE" : "RUN INDEX"}</p><h2>${c.labels.questions}</h2></div><span>${questionCountLabel}</span></header>
        <ol>${questions
          .map((question) => {
            const prompt = question.prompt;
            const questionEpisodeEntry = questionEpisode(question, episodes, catalog);
            const code = episodeCode(questionEpisodeEntry);
            const correctText = question.answers[question.correctAnswer];
            return `<li><a href="#${anchorFor(question)}"><span class="question-list__number">Q${escapeHtml(question.questionNumber)}</span><span class="question-list__copy"><strong${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(prompt)}</strong><small>${code ? `${escapeHtml(code)} · ` : ""}${escapeHtml(question.prize)}</small><span class="question-list__answers"${lang === "en" ? ' lang="sl"' : ""}>${compactAnswers(question, lang)}</span><small class="question-list__correct">${c.labels.correctAnswer}: ${question.correctAnswer} · <span${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(correctText)}</span></small></span><span class="outcome outcome--${escapeHtml(question.outcome)}">${escapeHtml(questionOutcomeLabel(question, lang))}</span></a></li>`;
          })
          .join("")}</ol>
      </nav>` : ""}

      ${sharedEvidence.length ? `<section class="evidence-section"><header class="section-heading"><p class="eyebrow">${sl ? "POSNETKI IGRE" : "RUN IMAGES"}</p><h2>${sl ? "Posnetki skupnega dela" : "Shared-segment images"}</h2><p>${sl ? "Posnetki prikazujejo tekmovalce Hitrih prstov, izid izbora, uporabljene pomoči in končni dobitek, kadar so na voljo." : "The images show the Fastest Finger First contestants, selection result, lifelines and final winnings when available."}</p></header>${evidenceGallery(sharedEvidence, lang, `${run.contestantName}; ${runLabel}`)}</section>` : ""}

      ${questions
        .map((question) => {
          const anchor = anchorFor(question);
          const questionEvidence = question.evidence || [];
          const primaryEvidence = question.displayPrimaryEvidence || question.primaryEvidence;
          const supplementalEvidence = Array.isArray(question.displaySupplementalEvidence)
            ? question.displaySupplementalEvidence
            : [];
          const imageHeading = question.displayEvidenceMode === "before-fifty-fifty"
            ? {
                eyebrow: c.labels.questionBeforeFiftyFifty,
                title: c.labels.allFourOptions,
              }
            : question.displayEvidenceMode === "complete-board"
              ? {
                  eyebrow: c.labels.questionWithAllAnswers,
                  title: c.labels.allFourOptions,
                }
              : question.displayEvidenceMode === "correct-outcome"
                ? {
                    eyebrow: c.labels.correctAnswerImage,
                    title: c.labels.correctAnswer,
                  }
                : {
                    eyebrow: c.labels.questionImage,
                    title: c.labels.questionImage,
                  };
          const lifelineKeys = question.lifelineKeys || [];
          const lifelines = lifelineKeys.map((key) => c.lifelineNames[key] || key).join(", ");
          const episode = questionEpisode(question, episodes, catalog);
          const code = episodeCode(episode);
          const href = episodeHref(lang, episode);
          const date = question.airingDate || episode?.airingDate;
          const contextualNotes = [
            question.isWalkAway
              ? sl
                ? "Odgovor je bil podan po odstopu in ni vplival na dobitek."
                : "The answer was given after walking away and did not affect the winnings."
              : "",
            question.isSwitched
              ? sl
                ? "Vprašanje je bilo zamenjano; odgovor ni vplival na napredovanje po lestvici."
                : "The board was switched; the answer did not affect prize progression."
              : "",
          ].filter(Boolean);
          return `<article class="run-section" id="${anchor}" aria-labelledby="${anchor}-title" tabindex="-1">
            <header class="question-page-header"><div><p class="eyebrow">${code ? `${escapeHtml(code)} · ` : ""}${c.labels.question} ${escapeHtml(question.questionNumber)}</p><h2 id="${anchor}-title">${c.labels.question} ${escapeHtml(question.questionNumber)}</h2></div>${href ? `<a class="episode-chip" href="${href}"><span>${c.labels.episode}</span><strong>${escapeHtml(code)}</strong></a>` : ""}</header>
            ${renderQuestionBoard(question, lang)}
            <section class="question-facts" aria-label="${sl ? "Podatki o vprašanju" : "Question facts"}"><dl>
              <div><dt>${c.labels.airingDate}</dt><dd>${date ? `<time datetime="${escapeHtml(date)}">${formatDate(date, lang)}</time>` : c.labels.noData}</dd></div>
              <div><dt>${c.labels.episode}</dt><dd>${href ? `<a href="${href}">${escapeHtml(code)}</a>` : code ? escapeHtml(code) : c.labels.noData}</dd></div>
              <div><dt>${c.labels.host}</dt><dd>${escapeHtml(question.hostName || hosts.join(", ") || c.labels.noData)}</dd></div>
              <div><dt>${c.labels.prize}</dt><dd>${escapeHtml(question.prize || c.labels.noData)}</dd></div>
              <div><dt>${c.labels.contestantAnswer}</dt><dd>${escapeHtml(question.contestantAnswer || c.labels.noData)}</dd></div>
              <div><dt>${c.labels.lifelines}</dt><dd>${lifelines ? escapeHtml(lifelines) : c.labels.noData}</dd></div>
              <div><dt>${sl ? "Tema" : "Topic"}</dt><dd>${question.topic ? `<a href="${pathFor(lang, "topic", question.topic.id)}">${escapeHtml(sl ? question.topic.label_sl : question.topic.label_en)}</a>` : c.labels.noData}</dd></div>
            </dl></section>
            ${contextualNotes.map((note) => `<p class="context-note">${escapeHtml(note)}</p>`).join("")}
            ${primaryEvidence ? `<section class="evidence-section question-primary-evidence"><header class="section-heading"><p class="eyebrow">${escapeHtml(imageHeading.eyebrow.toUpperCase())}</p><h3>${escapeHtml(imageHeading.title)}</h3></header>${evidenceGallery([primaryEvidence], lang, `${code}${code ? ", " : ""}Q${question.questionNumber}; ${run.contestantName}`)}</section>` : ""}
            ${supplementalEvidence.length ? `<details class="evidence-disclosure"><summary>${sl ? "Dodatni posnetki" : "Additional images"} (${supplementalEvidence.length})</summary>${evidenceGallery(supplementalEvidence, lang, `${code}${code ? ", " : ""}Q${question.questionNumber}; ${run.contestantName}`)}</details>` : ""}
          </article>`;
        })
        .join("")}

      ${!questions.length ? `<section class="empty-record"><h2>${sl ? "Brez katalogiziranih vprašanj" : "No catalogued questions"}</h2><p>${sl ? "Za to igro ni zabeleženih vprašanj na vročem stolu." : "No hot-seat questions are recorded for this run."}</p></section>` : ""}

      <nav class="page-turner" aria-label="${sl ? "Sosednje igre" : "Adjacent runs"}">${previousRun ? `<a rel="prev" href="${runPath(lang, previousRun)}"><span>${c.labels.previous}</span><strong>${escapeHtml(previousRun.contestantName || previousRun.id)}</strong></a>` : "<span></span>"}${nextRun ? `<a rel="next" href="${runPath(lang, nextRun)}"><span>${c.labels.next}</span><strong>${escapeHtml(nextRun.contestantName || nextRun.id)}</strong></a>` : ""}</nav>`;

    return layout({
      lang,
      title: `${run.contestantName} · ${runLabel}`,
      description: sl
        ? `${run.contestantName}: ${questionCountLabel}, rezultat in arhivski posnetki igre na vročem stolu.`
        : `${run.contestantName}: ${questionCountLabel}, result and archive images from this hot-seat run.`,
      body,
      active: "contestants",
      alternateUrl: runPath(lang === "sl" ? "en" : "sl", run.id),
      pageType: "article",
      image: heroImage?.url || "",
      bodyClass: "run-page",
    });
  }
}
