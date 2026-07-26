import { copy } from "./i18n.mjs";
import { siteBase, sitePath } from "./site-path.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatNumber(value, lang = "sl") {
  return new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB").format(value);
}

export function formatPercent(value, lang = "sl", digits = 1) {
  return new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatDate(value, lang = "sl") {
  if (!value) return copy[lang].labels.noData;
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "sl" ? "sl-SI" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatMoney(value, lang = "sl") {
  if (value === null || value === undefined) return copy[lang].labels.noData;
  return `${formatNumber(value, lang)} EUR`;
}

export function pathFor(lang, type = "home", id = "") {
  const prefix = sitePath(`/${lang}`);
  const routes = {
    home: `${prefix}/`,
    seasons: `${prefix}/seasons/`,
    season: `${prefix}/seasons/${id}/`,
    episodes: `${prefix}/episodes/`,
    episode: `${prefix}/episodes/${id}/`,
    questions: `${prefix}/questions/`,
    topics: `${prefix}/topics/`,
    topic: `${prefix}/topics/${id}/`,
    questionPosition: `${prefix}/questions/positions/${id}/`,
    run: `${prefix}/runs/${id}/`,
    contestants: `${prefix}/contestants/`,
    contestant: `${prefix}/contestants/${id}/`,
    runs: `${prefix}/runs/`,
    statistics: `${prefix}/statistics/`,
    patterns: `${prefix}/statistics/answer-patterns/`,
    search: `${prefix}/search/`,
  };
  return routes[type] || `${prefix}/`;
}

export function questionPath(question, lang) {
  if (!question?.runId || !question?.anchor) return pathFor(lang, "questions");
  return `${pathFor(lang, "run", question.runId)}#${question.anchor}`;
}

export function alternateLanguage(lang) {
  return lang === "sl" ? "en" : "sl";
}

export function personLink(person, lang, className = "") {
  if (!person) return "";
  return `<a class="${escapeHtml(className)}" href="${pathFor(lang, "contestant", person.slug)}">${escapeHtml(person.name)}</a>`;
}

export function episodeLabel(episode) {
  return `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
}

export function episodeLink(episode, lang, className = "") {
  return `<a class="${escapeHtml(className)}" href="${pathFor(lang, "episode", episode.key)}">${episodeLabel(episode)}</a>`;
}

export function breadcrumbs(lang, items) {
  const home = copy[lang].nav.home;
  const allItems = [{ label: home, href: pathFor(lang) }, ...items];
  return `<nav class="breadcrumbs" aria-label="${lang === "sl" ? "Drobtinice" : "Breadcrumbs"}"><ol>${allItems
    .map((item, index) => {
      const current = index === allItems.length - 1;
      return `<li>${current ? `<span aria-current="page">${escapeHtml(item.label)}</span>` : `<a href="${item.href}">${escapeHtml(item.label)}</a>`}</li>`;
    })
    .join("")}</ol></nav>`;
}

function logoMark() {
  return `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 61 32 32 61 3 32 32 3Z"/><path d="m32 13 19 19-19 19-19-19 19-19Z"/><circle cx="32" cy="32" r="7"/></svg>`;
}

export function searchForm(lang, compact = false) {
  const c = copy[lang];
  return `<form class="site-search${compact ? " site-search--compact" : ""}" action="${pathFor(lang, "search")}" role="search">
    <label class="sr-only" for="site-search-${compact ? "nav" : "main"}-${lang}">${c.nav.search}</label>
    <input id="site-search-${compact ? "nav" : "main"}-${lang}" name="q" type="search" minlength="2" autocomplete="off" placeholder="${escapeHtml(c.search.placeholder)}">
    <button type="submit">${escapeHtml(c.search.button)}</button>
  </form>`;
}

export function siteHeader(lang, { active = "", alternateUrl } = {}) {
  const c = copy[lang];
  const other = alternateLanguage(lang);
  const alternate = alternateUrl || pathFor(other);
  const navItems = ["seasons", "episodes", "questions", "topics", "contestants", "statistics"];
  return `<a class="skip-link" href="#main">${escapeHtml(c.skip)}</a>
  <header class="site-header">
    <a class="brand" href="${pathFor(lang)}" aria-label="${escapeHtml(c.siteName)}">
      ${logoMark()}
      <span><strong>${escapeHtml(c.siteName)}</strong><small>${escapeHtml(c.siteTagline)}</small></span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-${lang}">
      <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
      <span class="sr-only">${lang === "sl" ? "Odpri meni" : "Open menu"}</span>
    </button>
    <div class="header-tools" id="site-nav-${lang}">
      <nav class="primary-nav" aria-label="${lang === "sl" ? "Glavna navigacija" : "Primary navigation"}">
        ${navItems.map((item) => `<a${active === item ? ' class="is-active" aria-current="page"' : ""} href="${pathFor(lang, item)}">${escapeHtml(c.nav[item])}</a>`).join("")}
      </nav>
      ${searchForm(lang, true)}
      <a class="language-switch" href="${alternate}" hreflang="${other}" lang="${other}">${escapeHtml(c.alternateLanguage)}</a>
    </div>
  </header>`;
}

export function siteFooter(lang) {
  const c = copy[lang];
  return `<footer class="site-footer">
    <div class="footer-statement">
      <span class="footer-diamond" aria-hidden="true"></span>
      <div class="footer-statement__copy">
        <p>${escapeHtml(c.footer.about)} ${escapeHtml(c.footer.evidence)}</p>
      </div>
    </div>
    <nav aria-label="${lang === "sl" ? "Povezave v nogi" : "Footer links"}">
      <a class="footer-author" href="https://github.com/jeancaffou" target="_blank" rel="noopener noreferrer">@jeancaffou</a>
      <a href="https://github.com/jeancaffou/milijonar" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
  </footer>`;
}

export function layout({
  lang,
  title,
  description,
  body,
  active = "",
  alternateUrl,
  pageType = "website",
  image = "",
  scripts = [],
  styles = [],
  bodyClass = "",
}) {
  const c = copy[lang];
  const other = alternateLanguage(lang);
  const fullTitle = title ? `${title} | ${c.siteName}` : c.siteName;
  const safeDescription = escapeHtml(description || c.footer.about);
  const alternate = alternateUrl || pathFor(other);
  return `<!doctype html>
<html lang="${lang}" data-base-path="${escapeHtml(siteBase)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${safeDescription}">
  <meta name="theme-color" content="#111735">
  <link rel="icon" href="${sitePath("/assets/favicon.svg")}" type="image/svg+xml">
  <meta property="og:type" content="${escapeHtml(pageType)}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${safeDescription}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <link rel="alternate" hreflang="${other}" href="${alternate}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${sitePath("/assets/css/catalog.css")}">
  <link rel="stylesheet" href="${sitePath("/assets/css/site-footer.css")}">
  ${styles.map((href) => `<link rel="stylesheet" href="${sitePath(href)}">`).join("\n  ")}
  <script src="${sitePath("/assets/js/catalog.js")}" defer></script>
  ${scripts.map((src) => `<script src="${sitePath(src)}" defer></script>`).join("\n  ")}
</head>
<body class="${escapeHtml(bodyClass)}">
  ${siteHeader(lang, { active, alternateUrl: alternate })}
  <main id="main">
    ${body}
  </main>
  ${siteFooter(lang)}
</body>
</html>`;
}

export function evidenceGallery(items, lang, context = "") {
  const c = copy[lang];
  const unique = [...new Map(items.map((item) => [item.url, item])).values()];
  if (!unique.length) return "";
  return `<div class="evidence-grid${unique.length === 1 ? " evidence-grid--single" : ""}">${unique
    .map((item, index) => {
      const kind = c.evidenceKinds[item.kind] || c.evidenceKinds.evidence;
      const alt = `${kind}${context ? `, ${context}` : ""}, ${index + 1}/${unique.length}`;
      return `<figure class="evidence-item">
        <a href="${item.url}" target="_blank" rel="noopener" aria-label="${escapeHtml(alt)}">
          <img src="${item.url}" loading="lazy" decoding="async" alt="${escapeHtml(alt)}">
        </a>
        <figcaption><span>${escapeHtml(kind)}</span><span>${index + 1}/${unique.length}</span></figcaption>
      </figure>`;
    })
    .join("")}</div>`;
}

export function questionOutcomeLabel(question, lang) {
  const labels = copy[lang].labels;
  const map = {
    correct: labels.correct,
    wrong: labels.wrong,
    "walk-correct": `${labels.walkAway}: ${labels.correct.toLowerCase()}`,
    "walk-wrong": `${labels.walkAway}: ${labels.wrong.toLowerCase()}`,
    switched: labels.switched,
    unknown: labels.unknown,
  };
  return map[question.outcome] || labels.unknown;
}

export function renderQuestionBoard(question, lang, { compact = false } = {}) {
  const c = copy[lang];
  const options = ["A", "B", "C", "D"];
  return `<article class="question-board${compact ? " question-board--compact" : ""}">
    <div class="question-board__meta">
      <span>Q${question.questionNumber}</span>
      <span>${escapeHtml(question.prize)}</span>
      <span class="outcome outcome--${escapeHtml(question.outcome)}">${escapeHtml(questionOutcomeLabel(question, lang))}</span>
    </div>
    <div class="question-board__prompt" lang="sl">${escapeHtml(question.prompt)}</div>
    ${lang === "en" ? `<p class="language-note">${escapeHtml(c.labels.originalQuestionLanguage)}</p>` : ""}
    <ol class="answer-list" lang="sl">${options
      .map((letter) => {
        const isCorrect = question.correctAnswer === letter;
        const isContestant = question.contestantAnswer === letter;
        const isWrongSelection = isContestant && !isCorrect;
        const state = isCorrect ? " is-correct" : isWrongSelection ? " is-wrong" : isContestant ? " is-selected" : "";
        const marker = isCorrect ? `<span class="answer-state">✓ <span>${escapeHtml(c.labels.correctAnswer)}</span></span>` : isWrongSelection ? `<span class="answer-state">× <span>${escapeHtml(c.labels.contestantAnswer)}</span></span>` : "";
        return `<li class="answer-option${state}"><span class="answer-letter">${letter}</span><span class="answer-text">${escapeHtml(question.answers[letter])}</span>${marker}</li>`;
      })
      .join("")}</ol>
  </article>`;
}

export function statBar({ label, value, max, display, className = "" }) {
  const width = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  return `<div class="stat-bar ${escapeHtml(className)}"><div class="stat-bar__label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display ?? value)}</strong></div><div class="stat-bar__track"><span style="width:${width.toFixed(2)}%"></span></div></div>`;
}
