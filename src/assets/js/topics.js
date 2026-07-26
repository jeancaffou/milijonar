(() => {
  const search = document.getElementById("topic-search");
  const domain = document.getElementById("topic-domain");
  const ledger = document.getElementById("topic-ledger");
  const empty = document.getElementById("topic-filter-empty");
  if (!search || !domain || !ledger || !empty) return;

  const rows = [...ledger.children];
  const normalize = (value) => String(value || "").toLocaleLowerCase(document.documentElement.lang === "sl" ? "sl" : "en").trim();
  const update = () => {
    const query = normalize(search.value);
    const selected = domain.value;
    let visible = 0;
    for (const row of rows) {
      const show = (!query || row.dataset.topicSearch.includes(query)) && (!selected || row.dataset.topicDomain === selected);
      row.hidden = !show;
      if (show) visible += 1;
    }
    empty.hidden = visible !== 0;
  };
  search.addEventListener("input", update);
  domain.addEventListener("change", update);
})();
