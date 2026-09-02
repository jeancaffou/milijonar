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
} from "../lib/render.mjs";
import { selectContestantProfileImage } from "../lib/profile-image.mjs";

export default class ContestantPage {
  data() {
    return {
      pagination: { data: "catalog.contestantPages", size: 1, alias: "page" },
      permalink: (data) => `/${data.page.lang}/contestants/${data.page.person.slug}/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog, page }) {
    const { lang, person } = page;
    const c = copy[lang];
    const sl = lang === "sl";
    const logicalRuns = (person.catalogRunIds || [])
      .map((id) => catalog.runById[id])
      .filter(Boolean);
    const lineupEvidence = [...new Map(person.lineupAppearances
      .flatMap((appearance) => appearance.evidence || [])
      .map((item) => [item.url, item])).values()];
    const hotSeatEvidence = [...new Map(logicalRuns
      .flatMap((run) => run.evidence)
      .map((item) => [item.url, item])).values()];
    const selectedProfileImage = selectContestantProfileImage(person, catalog.contestantRuns, logicalRuns, catalog.episodeByKey, catalog.profileAuditByKey);
    const profileImage = selectedProfileImage?.item || null;
    const lineupGallery = lineupEvidence.filter((item) => item.url !== profileImage?.url);
    const hotSeatGallery = hotSeatEvidence.filter((item) => item.url !== profileImage?.url);
    const initials = person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    const profileImageAlt = selectedProfileImage?.source === "contestant-introduction"
      ? (sl ? `${person.name} med predstavitvijo tekmovalcev` : `${person.name} during the contestant introductions`)
      : (sl ? `${person.name} v oddaji Milijonar` : `${person.name} on Milijonar`);
    const body = `${breadcrumbs(lang, [{ label: c.nav.contestants, href: pathFor(lang, "contestants") }, { label: person.name }])}
      <header class="page-hero person-hero${profileImage ? " person-hero--with-image" : ""}">
        <div class="person-hero__intro">
          ${profileImage ? "" : `<div class="person-monogram" aria-hidden="true">${escapeHtml(initials)}</div>`}
          <div class="person-hero__copy"><p class="eyebrow">${c.labels.contestant}</p><h1>${escapeHtml(person.name)}</h1><p>${person.locations.length ? escapeHtml(person.locations.join(" · ")) : c.labels.noData}</p></div>
          <dl class="hero-facts"><div><dt>${c.labels.appearances}</dt><dd>${person.episodes.length}</dd></div><div><dt>${c.labels.questions}</dt><dd>${person.questionCount}</dd></div><div><dt>${sl ? "Zmage v Hitrih prstih" : "Fastest Finger First wins"}</dt><dd>${person.fastFingersWins}</dd></div>${person.maxPrize ? `<div><dt>${sl ? "Najvišji dobitek" : "Highest winnings"}</dt><dd>${formatMoney(person.maxPrize, lang)}</dd></div>` : ""}</dl>
        </div>
        ${profileImage ? `<a class="person-hero__frame" href="${profileImage.url}" target="_blank" rel="noopener" aria-label="${escapeHtml(sl ? `Odpri posnetek: ${person.name}` : `Open image: ${person.name}`)}"><img src="${profileImage.url}" alt="${escapeHtml(profileImageAlt)}" loading="eager"></a>` : ""}
      </header>
      <section class="appearance-timeline"><header class="section-heading"><p class="eyebrow">${sl ? "KRONOLOGIJA" : "TIMELINE"}</p><h2>${c.labels.appearances}</h2></header><ol>${person.episodes.map((episode) => {
        const runs = logicalRuns.filter((run) => run.episodes.includes(episode.key));
        const lineup = person.lineupAppearances.find((item) => item.episodeKey === episode.key);
        const won = person.winnerAppearances.some((run) => run.episodeKey === episode.key);
        return `<li><time datetime="${episode.airingDate}">${formatDate(episode.airingDate, lang)}</time><span class="timeline-node" aria-hidden="true"></span><div><h3><a href="${pathFor(lang, "episode", episode.key)}">${episodeLabel(episode)}</a></h3><p>${[lineup ? c.labels.lineup : "", won ? c.labels.fastFingersWinner : "", runs.length ? c.labels.hotSeatRuns : ""].filter(Boolean).join(" · ")}</p>${runs.map((run) => `<a class="text-link" href="${pathFor(lang, "run", run.id)}">${sl ? "Odpri celotno igro" : "Open complete run"} · ${run.prizeStatus === "pending" ? c.labels.pending : run.prizeValue === null ? c.labels.noData : formatMoney(run.prizeValue, lang)}</a>`).join(" ")}</div></li>`;
      }).join("")}</ol></section>
      ${logicalRuns.length ? `<section class="person-questions"><header class="section-heading section-heading--inline"><div><p class="eyebrow">${sl ? "VROČI STOL" : "HOT SEAT"}</p><h2>${c.labels.hotSeatRuns}</h2></div><span>${logicalRuns.length}</span></header><ol>${logicalRuns.map((run) => {
        const episodeCodes = run.episodes.map((key) => key.toUpperCase()).join(" · ");
        const result = run.prizeStatus === "pending" ? c.labels.pending : run.prizeValue === null ? c.labels.noData : formatMoney(run.prizeValue, lang);
        const firstPrompt = run.questions[0] ? run.questions[0].prompt : c.labels.noData;
        return `<li><a href="${pathFor(lang, "run", run.id)}"><span class="question-list__episode">${escapeHtml(episodeCodes)}<small>${c.labels.questions}: ${run.questionCount}</small></span><span class="question-list__copy"><strong>${sl ? "Celotna igra" : "Complete run"}</strong><small${lang === "en" ? ' lang="sl"' : ""}>${escapeHtml(firstPrompt)}</small></span><span class="outcome">${escapeHtml(result)}</span></a></li>`;
      }).join("")}</ol></section>` : `<section class="empty-record"><h2>${sl ? "Brez igre na vročem stolu" : "No hot-seat run"}</h2><p>${sl ? "Oseba je zabeležena med tekmovalci Hitrih prstov, vendar v razpoložljivih epizodah ni prišla na vroči stol." : "This person is recorded among the Fastest Finger First contestants but did not reach the hot seat in the available episodes."}</p>${!lineupEvidence.length ? `<p><a class="text-link" href="${pathFor(lang, "episode", person.episodes[0].key)}">${sl ? "Posnetki skupnega dela so na strani epizode" : "Frames from the shared segment are on the episode page"}</a></p>` : ""}</section>`}
      ${lineupGallery.length ? `<section class="evidence-section"><header class="section-heading"><p class="eyebrow">${sl ? "SKUPNI DEL HITRIH PRSTOV" : "SHARED FASTEST FINGER FIRST SEGMENT"}</p><h2>${sl ? "Posnetki Hitrih prstov" : "Fastest Finger First frames"}</h2><p>${sl ? "Posnetki prikazujejo skupni del oddaje. Posamezen portret je vključen le, kadar se prikazano ime ujema z osebo na tej strani." : "These frames show the shared episode segment. An individual portrait is included only when the displayed name matches the person on this page."}</p></header>${evidenceGallery(lineupGallery, lang, `${person.episodes.map((episode) => episodeLabel(episode)).join(", ")}; ${c.labels.fastFingers}`)}</section>` : ""}
      ${hotSeatGallery.length ? `<section class="evidence-section"><header class="section-heading"><p class="eyebrow">${sl ? "VROČI STOL" : "HOT SEAT"}</p><h2>${sl ? "Posnetki igre" : "Run images"}</h2></header>${evidenceGallery(hotSeatGallery, lang, person.name)}</section>` : ""}`;
    return layout({ lang, title: person.name, description: sl ? `${person.name}: nastopi, vprašanja, rezultati in arhivski posnetki v katalogu oddaje Milijonar.` : `${person.name}: appearances, questions, results and archive images in the Milijonar catalogue.`, body, active: "contestants", alternateUrl: pathFor(lang === "sl" ? "en" : "sl", "contestant", person.slug), pageType: "profile", image: profileImage?.url || "", bodyClass: "contestant-page" });
  }
}
