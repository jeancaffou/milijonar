import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, escapeHtml, formatNumber, formatPercent, layout, pathFor } from "../lib/render.mjs";

export default class TopicsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/topics/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, lang }) {
    const c = copy[lang];
    const sl = lang === "sl";
    const topics = catalog.rankedQuestionTopics;
    const maximum = topics[0]?.count || 1;
    const domains = [...new Set(topics.map((topic) => sl ? topic.broad_sl : topic.broad_en))].sort((a, b) => a.localeCompare(b, sl ? "sl" : "en"));
    const topFive = topics.slice(0, 5);
    const body = `${breadcrumbs(lang, [{ label: c.nav.topics }])}
      <header class="page-hero topic-hero"><div><p class="eyebrow">${sl ? "VODNIK ZA PRIPRAVO" : "PREPARATION GUIDE"}</p><h1>${sl ? "Najpogostejše teme vprašanj" : "Most common question topics"}</h1><p>${sl ? "Vsako vprašanje je po vsebini uvrščeno v eno natančno določeno temo. Razvrstitev pokaže, katero znanje se ponavlja najpogosteje, ne le koliko vprašanj sodi v široko področje, kot sta šport ali zgodovina." : "Every question is semantically assigned to one specific study topic. The ranking shows which knowledge recurs most often, rather than merely counting broad fields such as sport or history."}</p></div><dl class="hero-facts"><div><dt>${sl ? "Tem v razvrstitvi" : "Specific topics"}</dt><dd>${formatNumber(topics.length, lang)}</dd></div><div><dt>${sl ? "Razvrščenih vprašanj" : "Classified questions"}</dt><dd>${formatNumber(catalog.stats.topicClassifiedQuestions, lang)}</dd></div><div><dt>${sl ? "Pokritost" : "Coverage"}</dt><dd>${formatPercent(catalog.stats.topicClassifiedQuestions / catalog.stats.questions, lang)}</dd></div></dl></header>

      <section class="topic-priority" aria-labelledby="topic-priority-title"><header class="section-heading"><p class="eyebrow">${sl ? "NAJPREJ PONOVITE" : "REVISE FIRST"}</p><h2 id="topic-priority-title">${sl ? "Pet najpogostejših tem" : "Five most frequent topics"}</h2></header><ol>${topFive.map((topic, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><a href="${pathFor(lang, "topic", topic.id)}"><strong>${escapeHtml(sl ? topic.label_sl : topic.label_en)}</strong><small>${escapeHtml(sl ? topic.description_sl : topic.description_en)}</small></a><b>${formatNumber(topic.count, lang)}</b></li>`).join("")}</ol></section>

      <section class="topic-ranking" aria-labelledby="topic-ranking-title"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "RAZVRSTITEV TEM" : "TOPIC RANKING"}</p><h2 id="topic-ranking-title">${sl ? "Od najpogostejše do najredkejše" : "Most to least frequent"}</h2><p>${sl ? "Število pove, koliko vprašanj je uvrščenih v posamezno temo. Odprite temo za prikaz položajev na lestvici in celotnega seznama vprašanj." : "The count shows how many questions have that topic as their primary focus. Open a topic to see its ladder positions and complete question list."}</p></div></header>
        <div class="topic-filter" aria-label="${sl ? "Filtriranje tem" : "Filter topics"}"><label>${sl ? "Poiščite temo" : "Find a topic"}<input id="topic-search" type="search" placeholder="${sl ? "npr. nogometni trenerji, evropske reke" : "e.g. football coaches, European rivers"}"></label><label>${sl ? "Širše področje" : "Broad field"}<select id="topic-domain"><option value="">${sl ? "Vsa širša področja" : "All broad fields"}</option>${domains.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`).join("")}</select></label></div>
        <ol class="topic-ledger" id="topic-ledger">${topics.map((topic) => {
          const label = sl ? topic.label_sl : topic.label_en;
          const domain = sl ? topic.broad_sl : topic.broad_en;
          return `<li data-topic-search="${escapeHtml(`${label} ${domain}`.toLocaleLowerCase(sl ? "sl" : "en"))}" data-topic-domain="${escapeHtml(domain)}"><a href="${pathFor(lang, "topic", topic.id)}"><span class="topic-ledger__rank">${String(topic.rank).padStart(2, "0")}</span><span class="topic-ledger__name"><small>${escapeHtml(domain)}</small><strong>${escapeHtml(label)}</strong></span><span class="topic-ledger__bar" aria-hidden="true"><i style="width:${((topic.count / maximum) * 100).toFixed(2)}%"></i></span><span class="topic-ledger__value"><strong>${formatNumber(topic.count, lang)}</strong><small>${formatPercent(topic.share, lang)}</small></span></a></li>`;
        }).join("")}</ol><p class="topic-filter-empty" id="topic-filter-empty" hidden>${sl ? "Nobena tema ne ustreza izbranemu filtru." : "No topic matches the selected filter."}</p></section>

      <details class="topic-method"><summary>${sl ? "Kako je razvrstitev pripravljena" : "How the classification was made"}</summary><div><p>${sl ? "GPT je vsebinsko pregledal celotno slovensko besedilo vsakega vprašanja in vse štiri možnosti. Vprašanje je razvrščeno glede na znanje, potrebno za odgovor, ne glede na posamezne ključne besede. Vsako vprašanje ima eno glavno temo, zato se števila ne prekrivajo." : "GPT semantically reviewed the complete Slovenian wording of every question and all four answer options. Each assignment follows the knowledge needed to answer, not isolated keywords. Every question has one primary topic, so counts do not overlap."}</p><p>${sl ? "Širša področja so namenjena le filtriranju. Lestvica primerja konkretne učne teme in ni uradna taksonomija oddaje. Vprašanja in odgovori na angleški strani ostajajo v izvirni slovenščini." : "Broad subjects are used only for filtering. The ranking compares specific study topics and is not an official programme taxonomy. Question and answer wording remains in the original Slovenian on the English pages."}</p></div></details>`;
    return layout({ lang, title: c.nav.topics, description: sl ? "Najpogostejše teme vprašanj v oddaji Milijonar, urejene kot vodnik za pripravo." : "The most frequent Milijonar question topics, ranked as a preparation guide.", body, active: "topics", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "topics"), bodyClass: "topics-page", scripts: ["/assets/js/topics.js"] });
  }
}
