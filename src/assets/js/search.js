(() => {
  "use strict";

  const root = document.querySelector("[data-catalog-search]");
  if (!root) return;

  const language = root.dataset.lang === "en" ? "en" : "sl";
  const basePath = document.documentElement.dataset.basePath || "";
  const form = root.querySelector(".catalog-search__form");
  const queryInput = root.querySelector("[data-search-query]");
  const typeSelect = root.querySelector("[data-search-type]");
  const seasonSelect = root.querySelector("[data-search-season]");
  const status = root.querySelector("[data-search-status]");
  const results = root.querySelector("[data-search-results]");
  const template = root.querySelector("[data-search-result-template]");
  if (!form || !queryInput || !typeSelect || !seasonSelect || !status || !results || !template) return;

  const validTypes = new Set(["question", "topic", "contestant", "episode", "season"]);
  const routes = {
    question: "questions",
    topic: "topics",
    contestant: "contestants",
    episode: "episodes",
    season: "seasons",
  };
  const messages = language === "sl"
    ? {
        empty: "Vpišite vsaj dva znaka.",
        none: "Ni zadetkov. Poskusite z drugim zapisom ali manj besedami.",
        loading: "Iskanje …",
        error: "Iskalnega kazala ni bilo mogoče naložiti. Poskusite znova.",
        results: (count) => `Zadetki: ${formatNumber(count)}`,
        limited: (count, shown) => `Zadetki: ${formatNumber(count)}. Prikazanih je prvih ${formatNumber(shown)}.`,
        types: { question: "Vprašanje", topic: "Tema", contestant: "Tekmovalec", episode: "Epizoda", season: "Sezona" },
      }
    : {
        empty: "Enter at least two characters.",
        none: "No matches. Try a different spelling or fewer words.",
        loading: "Searching…",
        error: "The search index could not be loaded. Please try again.",
        results: (count) => `Results: ${formatNumber(count)}`,
        limited: (count, shown) => `Results: ${formatNumber(count)}. Showing the first ${formatNumber(shown)}.`,
        types: { question: "Question", topic: "Topic", contestant: "Contestant", episode: "Episode", season: "Season" },
      };
  const numberFormatter = new Intl.NumberFormat(language === "sl" ? "sl-SI" : "en-GB");
  const titleCollator = new Intl.Collator(language === "sl" ? "sl-SI" : "en-GB", {
    sensitivity: "base",
    numeric: true,
  });
  const resultLimit = 120;
  let searchIndexPromise;
  let searchSequence = 0;
  let inputTimer = 0;

  function formatNumber(value) {
    return numberFormatter.format(value);
  }

  function normalizeText(value) {
    return String(value || "")
      .toLocaleLowerCase(language)
      .replace(/[đð]/g, "d")
      .replace(/ł/g, "l")
      .replace(/ø/g, "o")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/œ/g, "oe")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function localizedTitle(record) {
    if (record.type === "season") {
      return `${messages.types.season} ${String(record.season).padStart(2, "0")}`;
    }
    if (language === "en" && record.titleEn) return record.titleEn;
    return record.title || record.id;
  }

  function recordUrl(record) {
    if (record.type === "question") {
      if (/^runs\/[a-z0-9-]+\/#q-[a-z0-9-]+$/i.test(record.target || "")) {
        return `${basePath}/${language}/${record.target}`;
      }
      return `${basePath}/${language}/questions/`;
    }
    return `${basePath}/${language}/${routes[record.type]}/${encodeURIComponent(record.id)}/`;
  }

  function summary(record) {
    const value = String(record.meta || record.text || "").replace(/\s+/g, " ").trim();
    if (value.length <= 180) return value;
    return `${value.slice(0, 177).trimEnd()}…`;
  }

  function seasonMatches(record, season) {
    if (!season) return true;
    if (record.type !== "contestant") return String(record.season) === season;
    const episodePrefix = `s${String(season).padStart(2, "0")}e`;
    return normalizeText(record.text).includes(episodePrefix);
  }

  function searchableRecord(record) {
    const title = localizedTitle(record);
    const allTitles = `${record.title || ""} ${record.titleEn || ""}`;
    const body = `${record.text || ""} ${record.meta || ""} ${messages.types[record.type] || ""}`;
    return {
      record,
      title,
      normalizedTitle: normalizeText(title),
      normalizedTitles: normalizeText(allTitles),
      normalizedBody: normalizeText(body),
    };
  }

  function rank(item, normalizedQuery, terms) {
    const haystack = `${item.normalizedTitles} ${item.normalizedBody}`;
    if (!terms.every((term) => haystack.includes(term))) return -1;

    let score = 0;
    if (item.normalizedTitle === normalizedQuery) score += 1_000;
    else if (item.normalizedTitle.startsWith(normalizedQuery)) score += 650;
    else if (item.normalizedTitle.includes(normalizedQuery)) score += 420;
    if (item.normalizedTitles.includes(normalizedQuery)) score += 220;
    if (item.normalizedBody.includes(normalizedQuery)) score += 100;

    const titleWords = new Set(item.normalizedTitle.split(" "));
    for (const term of terms) {
      if (titleWords.has(term)) score += 90;
      else if (item.normalizedTitle.includes(term)) score += 45;
      else score += 8;
    }
    return score;
  }

  async function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(`${basePath}/assets/search-index.json`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          if (!payload || !Array.isArray(payload.records)) throw new Error("Invalid search index");
          return payload.records.filter((record) => validTypes.has(record.type)).map(searchableRecord);
        })
        .catch((error) => {
          searchIndexPromise = undefined;
          throw error;
        });
    }
    return searchIndexPromise;
  }

  function clearResults() {
    results.replaceChildren();
  }

  function renderResults(matches) {
    clearResults();
    const fragment = document.createDocumentFragment();

    for (const item of matches.slice(0, resultLimit)) {
      const clone = template.content.cloneNode(true);
      const link = clone.querySelector("a");
      const type = clone.querySelector(".search-result__type");
      const title = clone.querySelector("strong");
      const meta = clone.querySelector("small");
      link.href = recordUrl(item.record);
      type.textContent = messages.types[item.record.type];
      type.classList.add(`search-result__type--${item.record.type}`);
      title.textContent = item.title;
      if (language === "en" && item.record.type === "question" && !item.record.titleEn) title.lang = "sl";
      meta.textContent = summary(item.record);
      fragment.append(clone);
    }

    results.append(fragment);
  }

  function readControlsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    queryInput.value = params.get("q") || "";
    const type = params.get("type") || "";
    typeSelect.value = validTypes.has(type) ? type : "";
    const season = params.get("season") || "";
    seasonSelect.value = [...seasonSelect.options].some((option) => option.value === season) ? season : "";
  }

  function updateLanguageSwitch() {
    const switchLink = document.querySelector(".language-switch");
    if (!switchLink) return;
    const destination = new URL(switchLink.href, window.location.origin);
    const params = new URLSearchParams();
    if (queryInput.value.trim()) params.set("q", queryInput.value.trim());
    if (typeSelect.value) params.set("type", typeSelect.value);
    if (seasonSelect.value) params.set("season", seasonSelect.value);
    destination.search = params.toString();
    switchLink.href = `${destination.pathname}${destination.search}${destination.hash}`;
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    const query = queryInput.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (typeSelect.value) url.searchParams.set("type", typeSelect.value);
    else url.searchParams.delete("type");
    if (seasonSelect.value) url.searchParams.set("season", seasonSelect.value);
    else url.searchParams.delete("season");
    history.replaceState(history.state, "", url);
    updateLanguageSwitch();
  }

  async function runSearch({ updateUrl = true } = {}) {
    if (updateUrl) syncUrl();
    const sequence = ++searchSequence;
    const normalizedQuery = normalizeText(queryInput.value);
    const terms = normalizedQuery.split(" ").filter(Boolean);
    const type = typeSelect.value;
    const season = seasonSelect.value;

    if (normalizedQuery.length < 2) {
      root.removeAttribute("aria-busy");
      clearResults();
      status.textContent = messages.empty;
      return;
    }

    root.setAttribute("aria-busy", "true");
    status.textContent = messages.loading;

    try {
      const index = await loadSearchIndex();
      if (sequence !== searchSequence) return;
      const matches = index
        .filter((item) => (!type || item.record.type === type) && seasonMatches(item.record, season))
        .map((item) => ({ item, score: rank(item, normalizedQuery, terms) }))
        .filter((match) => match.score >= 0)
        .sort((a, b) => b.score - a.score || titleCollator.compare(a.item.title, b.item.title))
        .map((match) => match.item);

      renderResults(matches);
      status.textContent = matches.length === 0
        ? messages.none
        : matches.length > resultLimit
          ? messages.limited(matches.length, resultLimit)
          : messages.results(matches.length);
    } catch {
      if (sequence !== searchSequence) return;
      clearResults();
      status.textContent = messages.error;
    } finally {
      if (sequence === searchSequence) root.removeAttribute("aria-busy");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(inputTimer);
    runSearch();
  });

  queryInput.addEventListener("input", () => {
    clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => runSearch(), 140);
  });
  typeSelect.addEventListener("change", () => runSearch());
  seasonSelect.addEventListener("change", () => runSearch());
  window.addEventListener("popstate", () => {
    readControlsFromUrl();
    updateLanguageSwitch();
    runSearch({ updateUrl: false });
  });

  readControlsFromUrl();
  updateLanguageSwitch();
  runSearch({ updateUrl: false });
})();
