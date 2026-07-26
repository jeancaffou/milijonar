import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, escapeHtml, formatNumber, formatPercent, layout, pathFor, questionPath } from "../lib/render.mjs";

function questionList(questions, lang) {
  return `<ol class="topic-question-list">${questions.map((question) => `<li><a href="${questionPath(question, lang)}"><span><strong>${question.episodeKey.toUpperCase()} · Q${question.questionNumber}</strong><small>${escapeHtml(question.contestantName)}</small></span><p${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(question.prompt)}</p><b${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(question.correctAnswer)} · ${escapeHtml(question.answers[question.correctAnswer])}</b></a></li>`).join("")}</ol>`;
}

export default class TopicPage {
  data() {
    return {
      pagination: { data: "catalog.topicPages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/topics/${data.page.topic.id}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, page }) {
    const { lang, topic } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const label = sl ? topic.label_sl : topic.label_en;
    const domain = sl ? topic.broad_sl : topic.broad_en;
    const description = sl ? topic.description_sl : topic.description_en;
    const studyFocus = sl ? topic.study_focus_sl : topic.study_focus_en;
    const maxBand = Math.max(...Object.values(topic.position_bands), 1);
    const byPosition = new Map();
    for (const question of topic.questions) {
      if (!byPosition.has(question.questionNumber)) byPosition.set(question.questionNumber, []);
      byPosition.get(question.questionNumber).push(question);
    }
    const rankValue = topic.rank ? `#${topic.rank}` : "—";
    const body = `${breadcrumbs(lang, [{ label: c.nav.topics, href: pathFor(lang, "topics") }, { label }])}
      <header class="page-hero topic-detail-hero"><div><p class="eyebrow">${escapeHtml(domain)}</p><h1>${escapeHtml(label)}</h1><p>${escapeHtml(description)}</p></div><dl class="hero-facts"><div><dt>${sl ? "Mesto po pogostosti" : "Frequency rank"}</dt><dd>${rankValue}</dd></div><div><dt>${c.labels.questions}</dt><dd>${formatNumber(topic.count, lang)}</dd></div><div><dt>${sl ? "Delež vseh vprašanj" : "Share of all questions"}</dt><dd>${formatPercent(topic.share, lang)}</dd></div><div><dt>${sl ? "Povprečni položaj vprašanja" : "Average question position"}</dt><dd>Q${topic.average_question_position.toFixed(1)}</dd></div></dl></header>

      <section class="topic-study"><header class="section-heading"><p class="eyebrow">${sl ? "KAJ PONOVITI" : "WHAT TO STUDY"}</p><h2>${escapeHtml(label)}</h2></header><p>${escapeHtml(studyFocus)}</p><div class="topic-examples"><h3>${sl ? "Primeri iz kataloga" : "Examples from the catalogue"}</h3>${questionList(topic.examples, lang)}</div></section>

      <section class="topic-position"><header class="section-heading"><p class="eyebrow">${sl ? "POLOŽAJI VPRAŠANJ" : "QUESTION POSITIONS"}</p><h2>${sl ? "Kje na lestvici se tema pojavlja" : "Where the topic appears on the ladder"}</h2></header><div class="topic-band-bars">${[["q1_q5", "Q1–Q5"], ["q6_q10", "Q6–Q10"], ["q11_plus", "Q11+"]].map(([key, labelText]) => `<div><span><strong>${labelText}</strong><small>${formatNumber(topic.position_bands[key], lang)}</small></span><i><b style="width:${((topic.position_bands[key] / maxBand) * 100).toFixed(2)}%"></b></i></div>`).join("")}</div></section>

      <section class="topic-all-questions"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "CELOTEN SEZNAM" : "COMPLETE LIST"}</p><h2>${sl ? "Vsa vprašanja iz te teme" : "All questions in this topic"}</h2><p>${sl ? "Vprašanja so razdeljena po zaporedni številki. Vsaka povezava odpre vprašanje znotraj celotne igre tekmovalca." : "Questions are grouped by position. Each link opens the question inside the contestant's complete run."}</p></div><span>${formatNumber(topic.count, lang)}</span></header><div class="topic-position-groups">${[...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([position, questions], index) => `<details${index < 3 ? " open" : ""}><summary><strong>Q${position}</strong><span>${formatNumber(questions.length, lang)} ${sl ? "vprašanj" : "questions"}</span></summary>${questionList(questions, lang)}</details>`).join("")}</div></section>`;
    return layout({ lang, title: label, description, body, active: "topics", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "topic", topic.id), bodyClass: "topic-detail-page" });
  }
}
