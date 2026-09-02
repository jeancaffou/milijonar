(() => {
  "use strict";

  document.documentElement.classList.add("has-js");

  const LANGUAGE_STORAGE_KEY = "milijonar-language";
  const supportedLanguages = new Set(["sl", "en"]);
  const documentLanguage = supportedLanguages.has(document.documentElement.lang)
    ? document.documentElement.lang
    : "sl";

  function normalizeText(value) {
    return String(value || "")
      .toLocaleLowerCase(documentLanguage)
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

  function formatCount(value) {
    return new Intl.NumberFormat(documentLanguage === "sl" ? "sl-SI" : "en-GB").format(value);
  }

  function rememberLanguage(language) {
    if (!supportedLanguages.has(language)) return;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Storage can be disabled without affecting navigation.
    }
  }

  function initLanguagePreference() {
    rememberLanguage(documentLanguage);
    const links = [...document.querySelectorAll(".language-switch")];
    const preserveRunAnchor = (link) => {
      if (!window.location.hash || !/\/runs\/[^/]+\/$/.test(window.location.pathname)) return;
      const destination = new URL(link.href, window.location.origin);
      destination.hash = window.location.hash;
      link.href = `${destination.pathname}${destination.search}${destination.hash}`;
    };
    links.forEach((link) => {
      preserveRunAnchor(link);
      link.addEventListener("click", () => {
        preserveRunAnchor(link);
        rememberLanguage(link.getAttribute("hreflang") || link.getAttribute("lang"));
      });
    });
    window.addEventListener("hashchange", () => links.forEach(preserveRunAnchor));
  }

  function initMobileNavigation() {
    const toggle = document.querySelector(".nav-toggle");
    if (!toggle) return;

    const panelId = toggle.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;

    const label = toggle.querySelector(".sr-only");
    const labels = documentLanguage === "sl"
      ? { open: "Odpri meni", close: "Zapri meni" }
      : { open: "Open menu", close: "Close menu" };
    let isOpen = false;
    let resizeFrame = 0;

    const isCompact = () => getComputedStyle(toggle).display !== "none";

    function renderNavigationState() {
      const compact = isCompact();
      if (!compact) isOpen = false;
      const expanded = compact && isOpen;

      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.classList.toggle("is-open", expanded);
      panel.classList.toggle("is-open", expanded);
      panel.hidden = compact && !expanded;
      document.body.classList.toggle("nav-is-open", expanded);
      if (label) label.textContent = expanded ? labels.close : labels.open;
    }

    function closeNavigation({ restoreFocus = false } = {}) {
      if (!isOpen) return;
      isOpen = false;
      renderNavigationState();
      if (restoreFocus) toggle.focus();
    }

    toggle.addEventListener("click", () => {
      if (!isCompact()) return;
      isOpen = !isOpen;
      renderNavigationState();
    });

    panel.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNavigation();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        closeNavigation({ restoreFocus: true });
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (isOpen && !event.target.closest(".site-header")) closeNavigation();
    });

    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(renderNavigationState);
    });

    renderNavigationState();
  }

  function setQueryParameter(name, value) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    history.replaceState(history.state, "", url);
  }

  function scheduleFilter(callback) {
    let frame = 0;
    return () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(callback);
    };
  }

  function initEpisodeTableFilter() {
    const controls = document.querySelector("[data-table-filter]");
    if (!controls) return;

    const input = controls.querySelector("[data-filter-input]");
    const seasonSelect = controls.querySelector("[data-filter-season]");
    const count = controls.querySelector("[data-filter-count]");
    const rows = [...document.querySelectorAll("[data-filter-row]")];
    const results = document.querySelector(".episode-ledger--all");
    if (!input || !seasonSelect || !count || !rows.length) return;

    if (results) {
      results.id ||= "episode-filter-results";
      input.setAttribute("aria-controls", results.id);
      seasonSelect.setAttribute("aria-controls", results.id);
    }

    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") || "";
    if ([...seasonSelect.options].some((option) => option.value === params.get("season"))) {
      seasonSelect.value = params.get("season") || "";
    }

    const searchableRows = rows.map((row) => ({
      element: row,
      season: row.dataset.season || "",
      text: normalizeText(row.dataset.search),
    }));

    function applyFilter() {
      const rawQuery = input.value.trim();
      const query = normalizeText(rawQuery);
      const terms = query.split(" ").filter(Boolean);
      const season = seasonSelect.value;
      let visible = 0;

      searchableRows.forEach((row) => {
        const matches = terms.every((term) => row.text.includes(term)) && (!season || row.season === season);
        row.element.hidden = !matches;
        if (matches) visible += 1;
      });

      count.textContent = formatCount(visible);
      controls.dataset.hasResults = String(visible > 0);
      setQueryParameter("q", rawQuery);
      setQueryParameter("season", season);
    }

    const schedule = scheduleFilter(applyFilter);
    input.addEventListener("input", schedule);
    seasonSelect.addEventListener("change", applyFilter);
    applyFilter();
  }

  function initContestantDirectoryFilter() {
    const directory = document.querySelector("[data-directory]");
    if (!directory) return;

    const input = directory.querySelector("[data-directory-input]");
    const roleSelect = directory.querySelector("[data-directory-role]");
    const sortSelect = directory.querySelector("[data-directory-sort]");
    const count = directory.querySelector("[data-directory-count]");
    const entries = [...directory.querySelectorAll("[data-directory-entry]")];
    const results = directory.querySelector(".people-directory");
    if (!input || !roleSelect || !sortSelect || !count || !entries.length) return;

    if (results) {
      results.id ||= "contestant-filter-results";
      input.setAttribute("aria-controls", results.id);
      roleSelect.setAttribute("aria-controls", results.id);
      sortSelect.setAttribute("aria-controls", results.id);
    }

    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") || "";
    if ([...roleSelect.options].some((option) => option.value === params.get("role"))) {
      roleSelect.value = params.get("role") || "";
    }
    if ([...sortSelect.options].some((option) => option.value === params.get("sort"))) {
      sortSelect.value = params.get("sort") || "name";
    }

    const sortConfig = {
      name: { datasetKey: "name", numeric: false, recordKey: "appearances" },
      appearances: { datasetKey: "appearances", numeric: true, recordKey: "appearances" },
      hotseat: { datasetKey: "hotseat", numeric: true, recordKey: "hotseat" },
      winnings: { datasetKey: "winnings", numeric: true, recordKey: "winnings" },
      questions: { datasetKey: "questions", numeric: true, recordKey: "questions" },
      furthest: { datasetKey: "furthest", numeric: true, recordKey: "furthest" },
      fastWins: { datasetKey: "fastWins", numeric: true, recordKey: "fastWins" },
      fastAppearances: { datasetKey: "fastAppearances", numeric: true, recordKey: "fastAppearances" },
    };

    const searchableEntries = entries.map((entry) => ({
      element: entry,
      roles: new Set((entry.dataset.role || "").trim().split(/\s+/).filter(Boolean)),
      text: normalizeText(entry.dataset.search),
      name: normalizeText(entry.dataset.name),
      recordLabel: entry.querySelector("[data-directory-record-label]"),
      recordValue: entry.querySelector("[data-directory-record-value]"),
      record: entry.querySelector(".person-record"),
    }));

    function updateRecordDisplay() {
      const config = sortConfig[sortSelect.value] || sortConfig.name;
      const recordKey = config.recordKey || "appearances";
      const labelKey = `record${recordKey.charAt(0).toUpperCase()}${recordKey.slice(1)}Label`;
      const valueKey = `record${recordKey.charAt(0).toUpperCase()}${recordKey.slice(1)}Value`;
      searchableEntries.forEach((entry) => {
        // Keep the selected sort metric as two clean lines. Older generated
        // markup included a punctuation node after the label; strip it here
        // as well so a cached page can never render a lone colon between the
        // label and its value.
        const label = String(entry.element.dataset[labelKey] || "").replace(/\s*:\s*$/, "");
        const value = String(entry.element.dataset[valueKey] || "—").replace(/^\s*:\s*/, "");
        if (entry.recordLabel) entry.recordLabel.textContent = label;
        if (entry.recordValue) entry.recordValue.textContent = value;
        const record = entry.record || entry.recordLabel?.closest(".person-record");
        if (record) {
          // Older generated pages rendered the label as a text node such as
          // "Nastopi v Hitrih prstih: ". Remove that punctuation anywhere
          // inside the record, while leaving the label/value on their two
          // intended lines.
          const walker = document.createTreeWalker(record, NodeFilter.SHOW_TEXT);
          const textNodes = [];
          while (walker.nextNode()) textNodes.push(walker.currentNode);
          textNodes.forEach((node) => {
            node.textContent = node.textContent.replace(/\s*:\s*/g, " ").trim();
          });
        }
      });
    }

    function sortEntries() {
      const config = sortConfig[sortSelect.value] || sortConfig.name;
      const ordered = [...searchableEntries].sort((a, b) => {
        if (!config.numeric) return a.name.localeCompare(b.name, documentLanguage === "sl" ? "sl" : "en");
        const difference = Number(b.element.dataset[config.datasetKey] || 0) - Number(a.element.dataset[config.datasetKey] || 0);
        return difference || a.name.localeCompare(b.name, documentLanguage === "sl" ? "sl" : "en");
      });
      if (results) results.append(...ordered.map((entry) => entry.element));
    }

    function applyFilter() {
      const rawQuery = input.value.trim();
      const query = normalizeText(rawQuery);
      const terms = query.split(" ").filter(Boolean);
      const role = roleSelect.value;
      let visible = 0;

      searchableEntries.forEach((entry) => {
        const matches = terms.every((term) => entry.text.includes(term)) && (!role || entry.roles.has(role));
        entry.element.hidden = !matches;
        if (matches) visible += 1;
      });

      count.textContent = formatCount(visible);
      directory.dataset.hasResults = String(visible > 0);
      updateRecordDisplay();
      sortEntries();
      setQueryParameter("q", rawQuery);
      setQueryParameter("role", role);
      setQueryParameter("sort", sortSelect.value === "name" ? "" : sortSelect.value);
    }

    const schedule = scheduleFilter(applyFilter);
    input.addEventListener("input", schedule);
    roleSelect.addEventListener("change", applyFilter);
    sortSelect.addEventListener("change", applyFilter);
    applyFilter();
  }

  initLanguagePreference();
  initMobileNavigation();
  initEpisodeTableFilter();
  initContestantDirectoryFilter();
})();
