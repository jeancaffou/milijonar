(async () => {
  let data;
  try {
    const basePath = document.documentElement.dataset.basePath || "";
    const response = await fetch(`${basePath}/assets/data/answer-patterns.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    const main = document.querySelector("main");
    if (main) {
      const message = document.createElement("p");
      message.className = "analysis-load-error";
      message.textContent = document.documentElement.lang === "sl"
        ? "Podatkov analize ni bilo mogoče naložiti. Poskusite znova po osvežitvi strani."
        : "The analysis data could not be loaded. Refresh the page to try again.";
      main.prepend(message);
    }
    return;
  }
  const isSlovenian = document.documentElement.lang === "sl";
  const locale = isSlovenian ? "sl-SI" : "en-US";
  const tr = (english, slovenian) => isSlovenian ? slovenian : english;
  const letters = ["A", "B", "C", "D"];
  const colors = { A: "var(--a)", B: "var(--b)", C: "var(--c)", D: "var(--d)" };
  const tooltip = document.getElementById("tooltip");

  const modelNamesSl = {
    "Train-frequency majority": "Najpogostejša črka v učni množici",
    "Modern-era Q1/rest rule": "Sodobno pravilo za Q1 in druga vprašanja",
    "S08-locked long-sequence hybrid": "Hibrid dolgega zaporedja, nastavljen na S08",
    "Modern rule + repeat memory": "Sodobno pravilo z upoštevanjem ponovitev",
    "Modern rule + tuned near-repeat memory": "Sodobno pravilo in podobna ponovljena vprašanja",
    "Question-position frequency lookup": "Pogostost črk glede na mesto vprašanja",
    "Reviewed-topic hierarchical prior": "Hierarhični model pregledanih tem",
    "Longest option heuristic": "Pravilo najdaljše možnosti",
    "Shortest option heuristic": "Pravilo najkrajše možnosti",
    "Least-used-in-run heuristic": "Najredkeje uporabljena črka v igri",
    "Metadata logistic regression": "Logistična regresija metapodatkov",
    "Board-shape logistic regression": "Logistična regresija oblike vprašalnega zaslona",
    "Sequence-aware logistic regression": "Logistična regresija z zgodovino zaporedja",
    "Lexical + engineered logistic regression": "Besedilna in izpeljana logistična regresija",
    "Multiple-choice candidate ranker": "Razvrščevalnik ponujenih odgovorov",
    "Lexical multiple-choice ranker": "Besedilni razvrščevalnik odgovorov",
    "Modern-era board-shape logistic regression": "Sodobna regresija oblike vprašalnega zaslona",
    "Modern-era sequence-aware logistic regression": "Sodobna regresija z zgodovino zaporedja",
    "Modern-era lexical + engineered regression": "Sodobna besedilna in izpeljana regresija",
    "Modern-era multiple-choice candidate ranker": "Sodobni razvrščevalnik ponujenih odgovorov",
    "Modern-era lexical multiple-choice ranker": "Sodobni besedilni razvrščevalnik odgovorov",
    "Engineered Extra Trees": "Extra Trees z izpeljanimi značilkami",
    "Modern-era engineered Extra Trees": "Sodobni Extra Trees z izpeljanimi značilkami",
  };
  const modelLabel = (name) => isSlovenian ? (modelNamesSl[name] || name) : name;
  const associationLabels = {
    season: tr("Season", "Sezona"),
    question_number: tr("Question number", "Številka vprašanja"),
    difficulty_band: tr("Difficulty band", "Težavnostni razred"),
    host_name: tr("Host", "Voditelj"),
    weekday: tr("Weekday", "Dan v tednu"),
    topic_hint: tr("Reviewed question topic", "Pregledana tema vprašanja"),
  };
  const associationLabel = (field) => associationLabels[field] || field;

  const prospectiveCopySl = {
    "option-verbosity-similarity": {
      title: "Dolžina možnosti in skupno besedišče",
      description: "Daljše možnosti pogosteje uporabljajo iste besede. To lahko pomaga besedilnim modelom, vendar ne razkrije zanesljivega položaja pravilnega odgovora.",
      x_label: "Povprečno besed na možnost",
      y_label: "Povprečna podobnost parov možnosti",
    },
    "prompt-overlap-similarity": {
      title: "Prekrivanje z vprašanjem in podobnost možnosti",
      description: "Kadar možnosti ponavljajo besede iz vprašanja, navadno ponavljajo več besed tudi med seboj. To je možen besedilni signal, ne signal zaporedja črk.",
      x_label: "Največje prekrivanje vprašanja in možnosti",
      y_label: "Povprečna podobnost parov možnosti",
    },
    "numeric-density-length": {
      title: "Število številskih možnosti in njihova dolžina",
      description: "Vprašanja z več številskimi možnostmi imajo krajše besedilo odgovorov. Gre za značilnost oblike vprašanja, ne za prednost določene črke.",
      x_label: "Število številskih možnosti",
      y_label: "Povprečno znakov na možnost",
    },
    "option-scale-spread": {
      title: "Povprečna dolžina in razpon dolžin možnosti",
      description: "Daljši nabori odgovorov imajo naravno večjo razliko med najdaljšo in najkrajšo možnostjo, zato preprosto pravilo najdaljšega odgovora ni dovolj.",
      x_label: "Povprečno znakov na možnost",
      y_label: "Razlika med najdaljšo in najkrajšo možnostjo",
    },
    "verbosity-prompt-overlap": {
      title: "Dolžina možnosti in prekrivanje z vprašanjem",
      description: "Daljše možnosti imajo več priložnosti za ponavljanje besed iz vprašanja. Povezava obstaja, vendar sama ne pove, katera možnost je pravilna.",
      x_label: "Povprečno besed na možnost",
      y_label: "Povprečno prekrivanje vprašanja in možnosti",
    },
    "position-option-verbosity": {
      title: "Mesto vprašanja in dolžina možnosti",
      description: "Poznejša vprašanja imajo nekoliko daljše možnosti. Šibek naklon je uporaben kot opis težavnosti, ne kot samostojno napovedno pravilo.",
      x_label: "Mesto vprašanja",
      y_label: "Povprečno besed na možnost",
    },
  };
  const prospectiveCopy = (chart) => isSlovenian ? { ...chart, ...prospectiveCopySl[chart.id] } : chart;

  const $ = (selector) => document.querySelector(selector);
  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = value;
  };
  const svgNode = (name, attrs = {}) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const add = (parent, name, attrs = {}, text = "") => {
    const node = svgNode(name, attrs);
    if (text !== "") node.textContent = text;
    parent.appendChild(node);
    return node;
  };
  const createSvg = (container, width, height) => {
    container.replaceChildren();
    const label = container.dataset.chartLabel
      || container.getAttribute("aria-label")
      || tr("Statistical chart", "Statistični graf");
    container.dataset.chartLabel = label;
    container.removeAttribute("aria-label");
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "group",
      tabindex: "0",
      "aria-label": `${label}. ${tr(
        "Use the left and right arrow keys to inspect individual data points.",
        "Za pregled posameznih podatkovnih točk uporabite levo in desno puščico.",
      )}`,
    });
    add(svg, "title", {}, label);
    svg.addEventListener("keydown", (event) => {
      const points = [...svg.querySelectorAll(".interactive")];
      if (!points.length) return;
      const current = Math.max(-1, points.indexOf(document.activeElement));
      let next = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % points.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = current < 0 ? points.length - 1 : (current - 1 + points.length) % points.length;
      }
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = points.length - 1;
      else if (event.key === "Escape" && document.activeElement !== svg) {
        event.preventDefault();
        svg.focus();
        return;
      } else return;
      event.preventDefault();
      points[next].focus();
    });
    container.appendChild(svg);
    return svg;
  };
  const pct = (value, digits = 1) => new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  const integer = (value) => new Intl.NumberFormat(locale).format(value);
  const pValue = (value) => value < 0.0001 ? value.toExponential(2) : value.toFixed(4);
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const showTip = (event, html) => {
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    const x = Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 12);
    const y = Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 12);
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  };
  const hideTip = () => tooltip?.classList.remove("visible");
  const accessibleText = (html) => {
    const temporary = document.createElement("span");
    temporary.innerHTML = html.replace(/<br\s*\/?\s*>/gi, ", ");
    return temporary.textContent.replace(/\s+/g, " ").trim();
  };
  const interactive = (node, html) => {
    const label = accessibleText(html);
    node.classList.add("interactive");
    node.setAttribute("tabindex", "-1");
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
    add(node, "title", {}, label);
    node.addEventListener("mousemove", (event) => showTip(event, html));
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("focus", () => {
      const bounds = node.getBoundingClientRect();
      showTip({
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      }, html);
    });
    node.addEventListener("blur", hideTip);
  };

  function segmented(container, options, initial, onChange) {
    if (!container) return;
    let active = initial;
    const render = () => {
      container.replaceChildren();
      options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label;
        button.setAttribute("aria-pressed", String(option.value === active));
        button.addEventListener("click", () => {
          active = option.value;
          render();
          onChange(active);
        });
        container.appendChild(button);
      });
    };
    render();
    onChange(initial);
  }

  function letterBars(container, distribution, options = {}) {
    if (!container) return;
    const width = 780;
    const height = options.height || 320;
    const margin = { top: 24, right: 24, bottom: 42, left: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = letters.map((letter) => distribution[letter].share);
    const maxValue = Math.max(options.max || 0.4, Math.max(...values) * 1.12);
    const svg = createSvg(container, width, height);
    for (let tick = 0; tick <= 4; tick++) {
      const value = maxValue * tick / 4;
      const y = margin.top + plotHeight - plotHeight * value / maxValue;
      add(svg, "line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "grid-line" });
      add(svg, "text", { x: margin.left - 10, y: y + 4, "text-anchor": "end" }, pct(value, 0));
    }
    if (0.25 <= maxValue) {
      const y = margin.top + plotHeight - plotHeight * 0.25 / maxValue;
      add(svg, "line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "reference-line" });
      add(svg, "text", { x: width - margin.right, y: y - 7, "text-anchor": "end" }, tr("uniform 25%", "enakomerno 25 %"));
    }
    const band = plotWidth / 4;
    const barWidth = Math.min(92, band * 0.56);
    letters.forEach((letter, index) => {
      const item = distribution[letter];
      const x = margin.left + band * index + (band - barWidth) / 2;
      const barHeight = plotHeight * item.share / maxValue;
      const y = margin.top + plotHeight - barHeight;
      const rect = add(svg, "rect", { x, y, width: barWidth, height: barHeight, rx: 3, fill: colors[letter] });
      interactive(rect, `<strong>${letter}</strong><br>${integer(item.count)} ${tr("questions", "vprašanj")}<br>${pct(item.share, 2)}`);
      add(svg, "text", { x: x + barWidth / 2, y: y - 9, "text-anchor": "middle", class: "value-label" }, pct(item.share));
      add(svg, "text", { x: x + barWidth / 2, y: height - 14, "text-anchor": "middle", class: "axis-label" }, letter);
    });
  }

  function stackedRows(container, groups, options = {}) {
    if (!container) return;
    const width = options.width || 780;
    const rowHeight = options.rowHeight || 29;
    const height = 42 + groups.length * rowHeight;
    const margin = { top: 18, right: 46, bottom: 24, left: options.left || 60 };
    const plotWidth = width - margin.left - margin.right;
    const svg = createSvg(container, width, height);
    groups.forEach((group, rowIndex) => {
      const y = margin.top + rowIndex * rowHeight;
      add(svg, "text", { x: margin.left - 10, y: y + 15, "text-anchor": "end", class: "axis-label" }, options.prefix ? `${options.prefix}${group.group}` : group.group);
      let cursor = margin.left;
      letters.forEach((letter) => {
        const share = group.letters[letter].share;
        const segmentWidth = plotWidth * share;
        const rect = add(svg, "rect", { x: cursor, y, width: Math.max(0, segmentWidth), height: 20, fill: colors[letter] });
        interactive(rect, `${options.prefix || ""}${group.group}, <strong>${letter}</strong><br>${pct(share, 2)} (${integer(group.letters[letter].count)})`);
        cursor += segmentWidth;
      });
      add(svg, "text", { x: width - margin.right + 8, y: y + 15 }, `n=${integer(group.n)}`);
    });
    const legendY = height - 6;
    letters.forEach((letter, index) => {
      const x = margin.left + index * 64;
      add(svg, "rect", { x, y: legendY - 10, width: 10, height: 10, rx: 2, fill: colors[letter] });
      add(svg, "text", { x: x + 15, y: legendY }, letter);
    });
  }

  function positionHeatmap(container, groups) {
    if (!container) return;
    const width = 112 + groups.length * 54;
    const cellWidth = 52;
    const cellHeight = 48;
    const margin = { top: 48, right: 24, bottom: 42, left: 68 };
    const height = margin.top + letters.length * cellHeight + margin.bottom;
    const svg = createSvg(container, width, height);
    groups.forEach((group, col) => {
      add(svg, "text", { x: margin.left + col * cellWidth + cellWidth / 2, y: 26, "text-anchor": "middle", class: "axis-label" }, `Q${group.group}`);
    });
    letters.forEach((letter, row) => {
      const y = margin.top + row * cellHeight;
      add(svg, "text", { x: margin.left - 16, y: y + 29, "text-anchor": "end", class: "axis-label" }, letter);
      groups.forEach((group, col) => {
        const item = group.letters[letter];
        const opacity = 0.14 + Math.min(0.86, item.share * 1.9);
        const x = margin.left + col * cellWidth;
        const rect = add(svg, "rect", { x, y, width: cellWidth - 3, height: cellHeight - 3, rx: 3, fill: colors[letter], opacity });
        interactive(rect, `Q${group.group}, <strong>${letter}</strong><br>${pct(item.share, 2)} (${integer(item.count)})`);
        add(svg, "text", { x: x + (cellWidth - 3) / 2, y: y + 29, "text-anchor": "middle", class: "value-label" }, pct(item.share, 0));
      });
    });
    groups.forEach((group, col) => add(svg, "text", {
      x: margin.left + col * cellWidth + cellWidth / 2,
      y: height - 12,
      "text-anchor": "middle",
    }, `n=${integer(group.n)}`));
  }

  function transitionHeatmap(container, transition) {
    if (!container) return;
    const width = 560;
    const height = 360;
    const cell = 66;
    const left = 90;
    const top = 58;
    const svg = createSvg(container, width, height);
    add(svg, "text", { x: left + 2 * cell, y: 18, "text-anchor": "middle", class: "axis-label" }, tr("Next answer", "Naslednji odgovor"));
    letters.forEach((letter, index) => {
      add(svg, "text", { x: left + index * cell + cell / 2, y: top - 14, "text-anchor": "middle", class: "axis-label" }, letter);
      add(svg, "text", { x: left - 18, y: top + index * cell + 39, "text-anchor": "end", class: "axis-label" }, letter);
    });
    letters.forEach((from, row) => letters.forEach((to, col) => {
      const share = transition.transition_shares[row][col];
      const count = transition.transition_counts[row][col];
      const rect = add(svg, "rect", {
        x: left + col * cell, y: top + row * cell, width: cell - 4, height: cell - 4,
        rx: 3, fill: colors[to], opacity: 0.16 + share * 2.15,
      });
      interactive(rect, `<strong>${from} ${tr("to", "v")} ${to}</strong><br>${pct(share, 2)} (${integer(count)})`);
      add(svg, "text", { x: left + col * cell + (cell - 4) / 2, y: top + row * cell + 36, "text-anchor": "middle", class: "value-label" }, pct(share, 0));
    }));
    add(svg, "text", { x: 18, y: top + 2 * cell, transform: `rotate(-90 18 ${top + 2 * cell})`, "text-anchor": "middle", class: "axis-label" }, tr("Previous answer", "Prejšnji odgovor"));
  }

  function lineChart(container, points, options = {}) {
    if (!container) return;
    const width = 650;
    const height = 330;
    const margin = { top: 26, right: 30, bottom: 48, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const yMin = options.yMin || 0.2;
    const yMax = options.yMax || 0.3;
    const svg = createSvg(container, width, height);
    for (let tick = 0; tick <= 4; tick++) {
      const value = yMin + (yMax - yMin) * tick / 4;
      const y = margin.top + plotHeight - plotHeight * (value - yMin) / (yMax - yMin);
      add(svg, "line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: value === 0.25 ? "reference-line" : "grid-line" });
      add(svg, "text", { x: margin.left - 9, y: y + 4, "text-anchor": "end" }, pct(value, 1));
    }
    const coords = points.map((point, index) => ({
      x: margin.left + (points.length === 1 ? plotWidth / 2 : plotWidth * index / (points.length - 1)),
      y: margin.top + plotHeight - plotHeight * (point.value - yMin) / (yMax - yMin),
      point,
    }));
    add(svg, "path", { d: coords.map((item, index) => `${index ? "L" : "M"}${item.x},${item.y}`).join(" "), fill: "none", stroke: "var(--b)", "stroke-width": 3 });
    coords.forEach(({ x, y, point }) => {
      const circle = add(svg, "circle", { cx: x, cy: y, r: 5, fill: "var(--b)" });
      interactive(circle, `<strong>${tr("Lag", "Zamik")} ${point.label}</strong><br>${pct(point.value, 2)} ${tr("same letter", "ista črka")}<br>n=${integer(point.n)}`);
      add(svg, "text", { x, y: height - 16, "text-anchor": "middle", class: "axis-label" }, String(point.label));
    });
    add(svg, "text", { x: margin.left + plotWidth / 2, y: height - 1, "text-anchor": "middle" }, tr("Lag within contestant run", "Zamik znotraj tekmovalčeve igre"));
  }

  function horizontalBars(container, items, options = {}) {
    if (!container) return;
    const width = options.width || 920;
    const rowHeight = options.rowHeight || 42;
    const height = 46 + items.length * rowHeight;
    const margin = { top: 16, right: 70, bottom: 24, left: options.left || 310 };
    const plotWidth = width - margin.left - margin.right;
    const max = options.max || Math.max(...items.map((item) => item.value)) * 1.08;
    const svg = createSvg(container, width, height);
    if (options.reference !== undefined) {
      const x = margin.left + plotWidth * options.reference / max;
      add(svg, "line", { x1: x, y1: margin.top - 5, x2: x, y2: height - margin.bottom, class: "reference-line" });
    }
    items.forEach((item, index) => {
      const y = margin.top + index * rowHeight;
      const barWidth = plotWidth * item.value / max;
      add(svg, "text", { x: margin.left - 12, y: y + 22, "text-anchor": "end", class: "axis-label" }, item.label);
      const rect = add(svg, "rect", { x: margin.left, y: y + 5, width: Math.max(1, barWidth), height: 22, rx: 3, fill: item.color || "var(--b)" });
      interactive(rect, `<strong>${item.label}</strong><br>${options.format ? options.format(item.value) : item.value.toFixed(3)}${item.detail ? `<br>${item.detail}` : ""}`);
      add(svg, "text", { x: margin.left + barWidth + 8, y: y + 22, class: "value-label" }, options.format ? options.format(item.value) : item.value.toFixed(3));
    });
  }

  function scatterPlot(container, points, options = {}) {
    if (!container || !points.length) return;
    const width = 650;
    const height = 340;
    const margin = { top: 24, right: 28, bottom: 58, left: 68 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const pad = options.pad ?? 0.025;
    const xMin = options.xMin ?? Math.max(0, Math.min(...xs) - pad);
    const xMax = options.xMax ?? Math.max(...xs) + pad;
    const yMin = options.yMin ?? Math.max(0, Math.min(...ys) - pad);
    const yMax = options.yMax ?? Math.max(...ys) + pad;
    const svg = createSvg(container, width, height);
    for (let tick = 0; tick <= 4; tick++) {
      const xValue = xMin + (xMax - xMin) * tick / 4;
      const yValue = yMin + (yMax - yMin) * tick / 4;
      const x = margin.left + plotWidth * tick / 4;
      const y = margin.top + plotHeight - plotHeight * tick / 4;
      add(svg, "line", { x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight, class: "grid-line" });
      add(svg, "line", { x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y, class: "grid-line" });
      add(svg, "text", { x, y: height - margin.bottom + 20, "text-anchor": "middle" }, options.xFormat ? options.xFormat(xValue) : xValue.toFixed(2));
      add(svg, "text", { x: margin.left - 10, y: y + 4, "text-anchor": "end" }, options.yFormat ? options.yFormat(yValue) : yValue.toFixed(2));
    }
    if (options.xReference !== undefined && options.xReference >= xMin && options.xReference <= xMax) {
      const x = margin.left + plotWidth * (options.xReference - xMin) / Math.max(xMax - xMin, 1e-9);
      add(svg, "line", { x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight, class: "reference-line" });
    }
    if (options.yReference !== undefined && options.yReference >= yMin && options.yReference <= yMax) {
      const y = margin.top + plotHeight - plotHeight * (options.yReference - yMin) / Math.max(yMax - yMin, 1e-9);
      add(svg, "line", { x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y, class: "reference-line" });
    }
    if (options.diagonal) {
      const low = Math.max(xMin, yMin);
      const high = Math.min(xMax, yMax);
      const x1 = margin.left + plotWidth * (low - xMin) / Math.max(xMax - xMin, 1e-9);
      const y1 = margin.top + plotHeight - plotHeight * (low - yMin) / Math.max(yMax - yMin, 1e-9);
      const x2 = margin.left + plotWidth * (high - xMin) / Math.max(xMax - xMin, 1e-9);
      const y2 = margin.top + plotHeight - plotHeight * (high - yMin) / Math.max(yMax - yMin, 1e-9);
      add(svg, "line", { x1, y1, x2, y2, class: "reference-line" });
    }
    if (options.trend) {
      const { slope, intercept } = options.trend;
      const candidates = [
        { x: xMin, y: slope * xMin + intercept },
        { x: xMax, y: slope * xMax + intercept },
      ];
      if (Math.abs(slope) > 1e-12) {
        candidates.push(
          { x: (yMin - intercept) / slope, y: yMin },
          { x: (yMax - intercept) / slope, y: yMax },
        );
      }
      const visible = candidates
        .filter((point) => (
          point.x >= xMin - 1e-9 && point.x <= xMax + 1e-9
          && point.y >= yMin - 1e-9 && point.y <= yMax + 1e-9
        ))
        .sort((left, right) => left.x - right.x);
      if (visible.length >= 2) {
        const first = visible[0];
        const last = visible[visible.length - 1];
        add(svg, "line", {
          x1: margin.left + plotWidth * (first.x - xMin) / Math.max(xMax - xMin, 1e-9),
          y1: margin.top + plotHeight - plotHeight * (first.y - yMin) / Math.max(yMax - yMin, 1e-9),
          x2: margin.left + plotWidth * (last.x - xMin) / Math.max(xMax - xMin, 1e-9),
          y2: margin.top + plotHeight - plotHeight * (last.y - yMin) / Math.max(yMax - yMin, 1e-9),
          class: "trend-line",
        });
      }
    }
    points.forEach((point) => {
      const x = margin.left + plotWidth * (point.x - xMin) / Math.max(xMax - xMin, 1e-9);
      const y = margin.top + plotHeight - plotHeight * (point.y - yMin) / Math.max(yMax - yMin, 1e-9);
      const circle = add(svg, "circle", {
        cx: x, cy: y, r: point.radius || 5, fill: point.color || "var(--b)", opacity: point.opacity || 0.78,
      });
      interactive(circle, point.tooltip || `<strong>${point.label}</strong><br>x ${point.x.toFixed(3)}<br>y ${point.y.toFixed(3)}`);
      if (point.showLabel) add(svg, "text", { x: x + 7, y: y - 7, class: "point-label" }, point.label);
    });
    add(svg, "text", { x: margin.left + plotWidth / 2, y: height - 4, "text-anchor": "middle", class: "axis-label" }, options.xLabel || "x");
    add(svg, "text", {
      x: 16, y: margin.top + plotHeight / 2,
      transform: `rotate(-90 16 ${margin.top + plotHeight / 2})`,
      "text-anchor": "middle", class: "axis-label",
    }, options.yLabel || "y");
  }

  function buildProspectiveScatterSection() {
    const main = $("main");
    if (!main) return;
    const analysis = data.prospective_scatter;
    const section = document.createElement("section");
    section.className = "chart-section prospective-scatter-section";
    const articles = analysis.charts.map((chart) => {
      const copy = prospectiveCopy(chart);
      return `
        <article>
          <h3>${copy.title}</h3>
          <p>${copy.description}</p>
          <div class="correlation-stat">Pearson r=${chart.pearson_r.toFixed(3)} · Spearman ρ=${chart.spearman_rho.toFixed(3)}</div>
          <div id="prospective-${chart.id}" class="chart" aria-label="${escapeHtml(copy.title)}"></div>
        </article>
      `;
    }).join("");
    section.innerHTML = `
      <div class="section-heading compact"><div><p class="section-kicker">${tr("PROSPECTIVE BOARD FEATURES", "ZNAČILNOSTI VPRAŠANJA PRED PRIKAZOM ODGOVORA")}</p><h2>${tr("Relationships visible before the answer reveal", "Povezave, vidne pred prikazom pravilnega odgovora")}</h2></div></div>
      <p class="chart-explanation">${tr(
        `${analysis.prospective_definition} Each plot shows ${integer(analysis.sample_size)} deterministic sample points from ${integer(analysis.row_count)} boards; correlations and trend lines use the full ${analysis.scope} cohort.`,
        `Obe osi sta določeni z besedilom vprašanja in štirimi ponujenimi možnostmi; pravilna črka določa samo barvo točke. Vsak graf prikazuje ${integer(analysis.sample_size)} vedno enako izbranih točk iz ${integer(analysis.row_count)} vprašanj, korelacije in trendne črte pa uporabljajo vsa vprašanja od Q2 naprej v sezonah S03–S10, brez prvotnih zamenjanih vprašanj.`,
      )}</p>
      <div class="point-color-legend" aria-label="${tr("Correct-answer point colors", "Barve točk po pravilnem odgovoru")}">
        ${letters.map((letter) => `<span><i style="--letter-color:${colors[letter]}"></i>${tr("Correct", "Pravilno")} ${letter}</span>`).join("")}
      </div>
      <div class="scatter-grid prospective-grid">${articles}</div>
    `;
    main.appendChild(section);

    const formatForField = (field) => {
      if (field === "question_number") return (value) => `Q${Math.round(value)}`;
      if (field === "numeric_option_count") return (value) => String(Math.round(value));
      if (field.includes("overlap") || field.includes("similarity")) {
        return (value) => value.toFixed(2);
      }
      return (value) => value.toFixed(1);
    };

    analysis.charts.forEach((chart) => {
      const copy = prospectiveCopy(chart);
      const xFormat = formatForField(chart.x_field);
      const yFormat = formatForField(chart.y_field);
      const xRange = Math.max(chart.x_max - chart.x_min, 1);
      const yRange = Math.max(chart.y_max - chart.y_min, 1);
      const points = analysis.points.map((point) => ({
        x: point[chart.x_field],
        y: point[chart.y_field],
        label: `${tr("Row", "Vrstica")} ${point.row_id}`,
        color: colors[point.correct_answer],
        radius: 2.8,
        opacity: 0.34,
        tooltip: `<strong>${escapeHtml(point.question)}</strong><br>Q${point.question_number}, ${tr("correct", "pravilno")} ${point.correct_answer}<br>${escapeHtml(copy.x_label)}: ${xFormat(point[chart.x_field])}<br>${escapeHtml(copy.y_label)}: ${yFormat(point[chart.y_field])}`,
      }));
      scatterPlot($("#prospective-" + chart.id), points, {
        xLabel: copy.x_label,
        yLabel: copy.y_label,
        xFormat,
        yFormat,
        xMin: Math.max(0, chart.x_min - xRange * 0.04),
        xMax: chart.x_max + xRange * 0.04,
        yMin: Math.max(0, chart.y_min - yRange * 0.04),
        yMax: chart.y_max + yRange * 0.04,
        trend: { slope: chart.trend_slope, intercept: chart.trend_intercept },
      });
    });
  }

  function buildScatterSection() {
    const main = $("main");
    if (!main) return;
    const section = document.createElement("section");
    section.className = "chart-section pairwise-section";
    section.innerHTML = `
      <div class="section-heading compact"><div><p class="section-kicker">${tr("PAIRWISE VIEWS", "PARNE PRIMERJAVE")}</p><h2>${tr("Where the variables move together", "Katere spremenljivke se spreminjajo skupaj")}</h2></div></div>
      <p class="chart-explanation">${tr("These scatterplots expose tradeoffs, drift, calibration, and sample-size effects that single bars hide. They are descriptive unless a chronological model score is explicitly shown.", "Ti razsevni diagrami pokažejo medsebojne kompromise, spremembe skozi čas, kalibracijo in vpliv velikosti vzorca, ki jih stolpci skrijejo. So opisni, razen kadar je izrecno prikazan rezultat kronološkega napovednega modela.")}</p>
      <div class="scatter-grid">
        <article><h3>${tr("B share vs D share by season, Q2+", "Delež B proti deležu D po sezonah, Q2+")}</h3><p>${tr("B growth generally accompanies D avoidance; labels identify the drifting seasons.", "Večji delež B navadno spremlja manjši delež D; oznake pokažejo, katere sezone se spreminjajo.")}</p><div id="scatter-season" class="chart"></div></article>
        <article><h3>${tr("A share vs C share by season, Q2+", "Delež A proti deležu C po sezonah, Q2+")}</h3><p>${tr("This checks whether the remaining two letters trade off as the answer mix changes.", "Graf preverja, ali se ob spremembi mešanice odgovorov izmenjujeta tudi preostali črki.")}</p><div id="scatter-season-ac" class="chart"></div></article>
        <article><h3>${tr("Season number vs B share, Q2+", "Številka sezone proti deležu B, Q2+")}</h3><p>${tr("Season is a time axis here, not a model feature; the chart visualizes marginal drift.", "Sezona je tu samo časovna os, ne značilka modela; graf prikazuje postopno spremembo deležev.")}</p><div id="scatter-season-time" class="chart"></div></article>
        <article><h3>${tr("B share vs D share by question position", "Delež B proti deležu D po mestu vprašanja")}</h3><p>${tr("Point size reflects sample size; small high-question positions should not drive a rule.", "Velikost točke kaže velikost vzorca; redka pozna vprašanja ne smejo določati pravila.")}</p><div id="scatter-position" class="chart"></div></article>
        <article><h3>${tr("Question position vs B share", "Mesto vprašanja proti deležu B")}</h3><p>${tr("This tests whether always-B should vary by ladder position after Q1.", "Preverja, ali bi se šibko pravilo vedno B po Q1 moralo spreminjati glede na mesto na lestvici.")}</p><div id="scatter-position-b" class="chart"></div></article>
        <article><h3>${tr("Question position vs D share", "Mesto vprašanja proti deležu D")}</h3><p>${tr("This shows whether D avoidance is localized or broadly present after Q1.", "Pokaže, ali je manj odgovorov D omejenih na določena mesta ali prisotnih po vsej lestvici po Q1.")}</p><div id="scatter-position-d" class="chart"></div></article>
        <article><h3>${tr("B share vs D share in rolling windows", "Delež B proti deležu D v drsečih oknih")}</h3><p>${tr("Two-hundred-question windows reveal gradual drift without using episode identifiers.", "Okna po 200 vprašanj pokažejo postopne spremembe brez uporabe številk epizod.")}</p><div id="scatter-rolling" class="chart"></div></article>
        <article><h3>${tr("Catalogue time vs B share, Q2+", "Čas v katalogu proti deležu B, Q2+")}</h3><p>${tr("The rolling B prior rises toward the newest material but is not a deterministic order.", "Osnovna verjetnost B v novejšem gradivu raste, vendar to ni določljivo zaporedje.")}</p><div id="scatter-time" class="chart"></div></article>
        <article><h3>${tr("Catalogue time vs D share, Q2+", "Čas v katalogu proti deležu D, Q2+")}</h3><p>${tr("This is the complementary rolling view of later-era D avoidance.", "To je dopolnilni pogled na manjši delež D v novejši dobi.")}</p><div id="scatter-time-d" class="chart"></div></article>
        <article><h3>${tr("Overall vs Q2+ model accuracy", "Skupna točnost proti točnosti Q2+")}</h3><p>${tr("Distance between axes shows how much a model benefits from the established Q1 rule.", "Razdalja med osema pokaže, koliko model pridobi zaradi znanega pravila Q1.")}</p><div id="scatter-models" class="chart"></div></article>
        <article><h3>${tr("Novel-question vs Q2+ model accuracy", "Točnost pri novih vprašanjih proti točnosti Q2+")}</h3><p>${tr("Retrieval gains shrink on truly unseen wording, exposing dependence on question reuse.", "Prednost iskanja podobnih vprašanj se pri res novem besedilu zmanjša, kar pokaže odvisnost od ponavljanja vsebine.")}</p><div id="scatter-model-novel" class="chart"></div></article>
        <article><h3>${tr("Top-one vs top-two model accuracy", "Točnost prve izbire proti točnosti prvih dveh")}</h3><p>${tr("This distinguishes exact-letter prediction from merely narrowing the answer set.", "Loči natančno napoved črke od zgolj zožitve izbire na dve možnosti.")}</p><div id="scatter-model-top2" class="chart"></div></article>
        <article><h3>${tr("Brier score vs model accuracy", "Brierjeva mera proti točnosti modela")}</h3><p>${tr("Lower Brier scores indicate better probability calibration, not only more correct guesses.", "Nižja Brierjeva mera pomeni bolje umerjene verjetnosti, ne le več pravilnih ugibanj.")}</p><div id="scatter-model-brier" class="chart"></div></article>
        <article><h3>${tr("Statistical significance vs effect size", "Statistična značilnost in velikost učinka")}</h3><p>${tr("Large samples can make tiny effects significant; useful predictors need both dimensions.", "Pri velikem vzorcu je lahko statistično značilen tudi zelo majhen učinek; uporaben napovedni model potrebuje dovolj velik učinek in statistično podporo.")}</p><div id="scatter-tests" class="chart"></div></article>
        <article><h3>${tr("Association group count vs effect size", "Število skupin proti velikosti povezave")}</h3><p>${tr("Features with many categories can show unstable apparent associations.", "Značilke z veliko kategorijami lahko kažejo navidezne, nestabilne povezave.")}</p><div id="scatter-test-groups" class="chart"></div></article>
      </div>`;
    main.appendChild(section);

    const shareFormat = (value) => pct(value, 0);
    const seasonPoints = data.modern_era.q2_plus_by_season.map((group) => ({
      x: group.letters.D.share, y: group.letters.B.share, label: `S${group.group}`,
      showLabel: true, color: "var(--b)",
      tooltip: `<strong>S${group.group}, Q2+</strong><br>B ${pct(group.letters.B.share, 2)}<br>D ${pct(group.letters.D.share, 2)}<br>n=${integer(group.n)}`,
    }));
    scatterPlot($("#scatter-season"), seasonPoints, { xLabel: tr("D share", "Delež D"), yLabel: tr("B share", "Delež B"), xFormat: shareFormat, yFormat: shareFormat });

    const seasonACPoints = data.modern_era.q2_plus_by_season.map((group) => ({
      x: group.letters.A.share, y: group.letters.C.share, label: `S${group.group}`,
      showLabel: true, color: "var(--c)",
      tooltip: `<strong>S${group.group}, Q2+</strong><br>A ${pct(group.letters.A.share, 2)}<br>C ${pct(group.letters.C.share, 2)}<br>n=${integer(group.n)}`,
    }));
    scatterPlot($("#scatter-season-ac"), seasonACPoints, { xLabel: tr("A share", "Delež A"), yLabel: tr("C share", "Delež C"), xFormat: shareFormat, yFormat: shareFormat });

    const seasonTimePoints = data.modern_era.q2_plus_by_season.map((group) => ({
      x: Number(group.group), y: group.letters.B.share, label: `S${group.group}`,
      showLabel: true, color: "var(--b)",
      tooltip: `<strong>S${group.group}, Q2+</strong><br>B ${pct(group.letters.B.share, 2)}<br>n=${integer(group.n)}`,
    }));
    scatterPlot($("#scatter-season-time"), seasonTimePoints, { xLabel: tr("Season", "Sezona"), yLabel: tr("B share", "Delež B"), xFormat: (value) => `S${Math.round(value)}`, yFormat: shareFormat, xMin: 3, xMax: 10 });

    const positionPoints = data.modern_era.by_question_number
      .filter((group) => Number(group.group) > 1)
      .map((group) => ({
        x: group.letters.D.share, y: group.letters.B.share, label: `Q${group.group}`,
        showLabel: true, color: "var(--c)", radius: 4 + Math.sqrt(group.n) / 10,
        tooltip: `<strong>Q${group.group}</strong><br>B ${pct(group.letters.B.share, 2)}<br>D ${pct(group.letters.D.share, 2)}<br>n=${integer(group.n)}`,
    }));
    scatterPlot($("#scatter-position"), positionPoints, { xLabel: tr("D share", "Delež D"), yLabel: tr("B share", "Delež B"), xFormat: shareFormat, yFormat: shareFormat });

    const positionBPoints = data.modern_era.by_question_number
      .filter((group) => Number(group.group) > 1)
      .map((group) => ({
        x: Number(group.group), y: group.letters.B.share, label: `Q${group.group}`,
        showLabel: true, color: "var(--b)", radius: 4 + Math.sqrt(group.n) / 12,
        tooltip: `<strong>Q${group.group}</strong><br>B ${pct(group.letters.B.share, 2)}<br>n=${integer(group.n)}`,
      }));
    scatterPlot($("#scatter-position-b"), positionBPoints, { xLabel: tr("Question number", "Številka vprašanja"), yLabel: tr("B share", "Delež B"), xFormat: (value) => `Q${Math.round(value)}`, yFormat: shareFormat, xMin: 2 });

    const positionDPoints = data.modern_era.by_question_number
      .filter((group) => Number(group.group) > 1)
      .map((group) => ({
        x: Number(group.group), y: group.letters.D.share, label: `Q${group.group}`,
        showLabel: true, color: "var(--d)", radius: 4 + Math.sqrt(group.n) / 12,
        tooltip: `<strong>Q${group.group}</strong><br>D ${pct(group.letters.D.share, 2)}<br>n=${integer(group.n)}`,
      }));
    scatterPlot($("#scatter-position-d"), positionDPoints, { xLabel: tr("Question number", "Številka vprašanja"), yLabel: tr("D share", "Delež D"), xFormat: (value) => `Q${Math.round(value)}`, yFormat: shareFormat, xMin: 2 });

    const rollingPoints = data.modern_era.q2_plus_rolling.map((window, index) => ({
      x: window.letters.D.share, y: window.letters.B.share, label: `${tr("Window", "Okno")} ${index + 1}`,
      color: `color-mix(in oklch, var(--b) ${35 + 60 * index / Math.max(data.modern_era.q2_plus_rolling.length - 1, 1)}%, var(--c))`,
      tooltip: `<strong>${window.start_date} ${tr("to", "do")} ${window.end_date}</strong><br>B ${pct(window.letters.B.share, 2)}<br>D ${pct(window.letters.D.share, 2)}<br>${tr("rows", "vrstice")} ${integer(window.start_row)}-${integer(window.end_row)}`,
    }));
    scatterPlot($("#scatter-rolling"), rollingPoints, { xLabel: tr("D share", "Delež D"), yLabel: tr("B share", "Delež B"), xFormat: shareFormat, yFormat: shareFormat });

    const timePoints = data.modern_era.q2_plus_rolling.map((window, index) => ({
      x: (window.start_row + window.end_row) / 2,
      y: window.letters.B.share,
      label: `${tr("Window", "Okno")} ${index + 1}`,
      color: "var(--b)",
      tooltip: `<strong>${window.start_date} ${tr("to", "do")} ${window.end_date}</strong><br>B ${pct(window.letters.B.share, 2)}<br>${tr("Q2+ midpoint", "sredina Q2+")} ${integer((window.start_row + window.end_row) / 2)}`,
    }));
    scatterPlot($("#scatter-time"), timePoints, { xLabel: tr("Godler-era Q2+ row index", "Indeks vrstice Q2+ v Godlerjevi dobi"), yLabel: tr("B share", "Delež B"), xFormat: (value) => integer(Math.round(value)), yFormat: shareFormat, pad: 0.01 });

    const timeDPoints = data.modern_era.q2_plus_rolling.map((window, index) => ({
      x: (window.start_row + window.end_row) / 2,
      y: window.letters.D.share,
      label: `${tr("Window", "Okno")} ${index + 1}`,
      color: "var(--d)",
      tooltip: `<strong>${window.start_date} ${tr("to", "do")} ${window.end_date}</strong><br>D ${pct(window.letters.D.share, 2)}<br>${tr("Q2+ midpoint", "sredina Q2+")} ${integer((window.start_row + window.end_row) / 2)}`,
    }));
    scatterPlot($("#scatter-time-d"), timeDPoints, { xLabel: tr("Godler-era Q2+ row index", "Indeks vrstice Q2+ v Godlerjevi dobi"), yLabel: tr("D share", "Delež D"), xFormat: (value) => integer(Math.round(value)), yFormat: shareFormat, pad: 0.01 });

    const modelPoints = data.models.map((model) => ({
      x: model.non_q1_accuracy,
      y: model.accuracy,
      label: modelLabel(model.name),
      color: model.name === data.best_model ? "var(--c)" : "var(--b)",
      radius: model.name === data.best_model ? 7 : 5,
      tooltip: `<strong>${modelLabel(model.name)}</strong><br>Q2+ ${pct(model.non_q1_accuracy, 2)}<br>${tr("all holdout", "celotna testna množica")} ${pct(model.accuracy, 2)}`,
    }));
    scatterPlot($("#scatter-models"), modelPoints, { xLabel: tr("Q2+ accuracy", "Točnost Q2+"), yLabel: tr("All-holdout accuracy", "Točnost celotne testne množice"), xFormat: shareFormat, yFormat: shareFormat, pad: 0.035 });

    const modelNovelPoints = data.models.map((model) => ({
      x: model.non_q1_accuracy,
      y: model.novel_question_accuracy,
      label: modelLabel(model.name),
      color: model.name === data.best_model ? "var(--c)" : "var(--b)",
      radius: model.name === data.best_model ? 7 : 5,
      tooltip: `<strong>${modelLabel(model.name)}</strong><br>Q2+ ${pct(model.non_q1_accuracy, 2)}<br>${tr("novel", "nova vprašanja")} ${pct(model.novel_question_accuracy, 2)}`,
    }));
    scatterPlot($("#scatter-model-novel"), modelNovelPoints, { xLabel: tr("Q2+ accuracy", "Točnost Q2+"), yLabel: tr("Novel-question accuracy", "Točnost pri novih vprašanjih"), xFormat: shareFormat, yFormat: shareFormat, pad: 0.035 });

    const modelTop2Points = data.models.map((model) => ({
      x: model.accuracy,
      y: model.top2_accuracy,
      label: modelLabel(model.name),
      color: model.name === data.best_model ? "var(--c)" : "var(--a)",
      radius: model.name === data.best_model ? 7 : 5,
      tooltip: `<strong>${modelLabel(model.name)}</strong><br>${tr("top-one", "prva izbira")} ${pct(model.accuracy, 2)}<br>${tr("top-two", "prvi dve izbiri")} ${pct(model.top2_accuracy, 2)}`,
    }));
    scatterPlot($("#scatter-model-top2"), modelTop2Points, { xLabel: tr("Top-one accuracy", "Točnost prve izbire"), yLabel: tr("Top-two accuracy", "Točnost prvih dveh izbir"), xFormat: shareFormat, yFormat: shareFormat, pad: 0.035 });

    const modelBrierPoints = data.models.map((model) => ({
      x: model.brier_score,
      y: model.accuracy,
      label: modelLabel(model.name),
      color: model.name === data.best_model ? "var(--c)" : "var(--b)",
      radius: model.name === data.best_model ? 7 : 5,
      tooltip: `<strong>${modelLabel(model.name)}</strong><br>Brier ${model.brier_score.toFixed(3)}<br>${tr("accuracy", "točnost")} ${pct(model.accuracy, 2)}`,
    }));
    scatterPlot($("#scatter-model-brier"), modelBrierPoints, { xLabel: tr("Brier score (lower is better)", "Brierjeva mera (nižje je bolje)"), yLabel: tr("Accuracy", "Točnost"), xFormat: (value) => value.toFixed(2), yFormat: shareFormat, pad: 0.035 });

    const testPoints = data.association_tests.map((test) => ({
      x: test.cramers_v,
      y: Math.min(70, -Math.log10(Math.max(test.p_value, 1e-70))),
      label: associationLabel(test.field),
      showLabel: true,
      color: "var(--a)",
      tooltip: `<strong>${associationLabel(test.field)}</strong><br>V ${test.cramers_v.toFixed(3)}<br>p ${pValue(test.p_value)}`,
    }));
    scatterPlot($("#scatter-tests"), testPoints, { xLabel: "Cramer's V", yLabel: tr("-log10(p), capped at 70", "-log10(p), omejeno na 70"), xFormat: (value) => value.toFixed(2), yFormat: (value) => value.toFixed(0), xMin: 0, yMin: 0 });

    const testGroupPoints = data.association_tests.map((test) => ({
      x: test.groups,
      y: test.cramers_v,
      label: associationLabel(test.field),
      showLabel: true,
      color: "var(--a)",
      tooltip: `<strong>${associationLabel(test.field)}</strong><br>${integer(test.groups)} ${tr("groups", "skupin")}<br>V ${test.cramers_v.toFixed(3)}<br>p ${pValue(test.p_value)}`,
    }));
    scatterPlot($("#scatter-test-groups"), testGroupPoints, { xLabel: tr("Number of groups", "Število skupin"), yLabel: "Cramer's V", xFormat: (value) => integer(Math.round(value)), yFormat: (value) => value.toFixed(2), xMin: 0, yMin: 0 });
  }

  function chronologicalSequenceGrid(container, visualization) {
    if (!container) return;
    const palette = { A: "#cf624f", B: "#4b73c8", C: "#419c76", D: "#d4a93d" };
    const cellSize = 8;
    const gap = 1;
    const shellPadding = 12;

    const toolbar = document.createElement("div");
    toolbar.className = "sequence-grid-toolbar";
    const sliderLabel = document.createElement("label");
    sliderLabel.textContent = tr("Wrap width", "Število stolpcev");
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "4";
    slider.max = "160";
    slider.step = "1";
    slider.value = String(visualization.wrap_columns);
    slider.setAttribute("aria-label", tr("Sequence wrap width in columns", "Število stolpcev v prikazu zaporedja"));
    const metrics = document.createElement("output");
    metrics.className = "sequence-grid-metrics";
    sliderLabel.appendChild(slider);
    toolbar.append(sliderLabel, metrics);

    const shell = document.createElement("div");
    shell.className = "sequence-grid-shell";
    const grid = document.createElement("div");
    grid.className = "sequence-cell-grid";
    grid.setAttribute("role", "img");
    grid.setAttribute(
      "aria-label",
      tr(
        `Chronological stream of ${integer(visualization.letters.length)} correct-answer letters, including Q1`,
        `Kronološki niz ${integer(visualization.letters.length)} pravilnih črk, vključno s Q1`,
      ),
    );

    const fragment = document.createDocumentFragment();
    let boundaryIndex = 0;
    [...visualization.letters].forEach((letter, index) => {
      while (
        boundaryIndex < visualization.season_boundaries.length - 1
        && index + 1 > visualization.season_boundaries[boundaryIndex].end_index
      ) {
        boundaryIndex += 1;
      }
      const boundary = visualization.season_boundaries[boundaryIndex];
      const cell = document.createElement("span");
      cell.className = "sequence-cell";
      cell.style.setProperty("--sequence-color", palette[letter]);
      if (index + 1 === boundary.start_index) cell.classList.add("season-start");
      const questionNumber = visualization.question_numbers?.[index];
      cell.dataset.tip = `<strong>${tr("Chronological position", "Mesto v kronologiji")} ${integer(index + 1)}</strong><br>${tr("Question", "Vprašanje")} ${questionNumber ? `Q${questionNumber}` : "–"}<br>${tr("Answer", "Odgovor")} ${letter}<br>S${String(boundary.season).padStart(2, "0")} (${boundary.start_date} ${tr("to", "do")} ${boundary.end_date})`;
      fragment.appendChild(cell);
    });
    grid.appendChild(fragment);
    shell.appendChild(grid);

    const legend = document.createElement("div");
    legend.className = "sequence-grid-legend";
    letters.forEach((letter) => {
      const item = document.createElement("span");
      item.innerHTML = `<i style="--letter-color:${palette[letter]}"></i>${letter}`;
      legend.appendChild(item);
    });
    const seasonMarker = document.createElement("span");
    seasonMarker.innerHTML = `<i class="season-start-key"></i>${tr("Season start", "Začetek sezone")}`;
    legend.appendChild(seasonMarker);
    container.replaceChildren(toolbar, shell, legend);

    const currentColumns = () => {
      const contentWidth = Math.max(1, shell.clientWidth - shellPadding * 2);
      return Math.max(4, Math.floor((contentWidth + gap) / (cellSize + gap)));
    };
    const updateMetrics = () => {
      const columns = currentColumns();
      slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), columns)));
      metrics.value = `${integer(columns)} ${tr("columns", "stolpcev")} × ${integer(Math.ceil(visualization.letters.length / columns))} ${tr("rows", "vrstic")}`;
    };
    const setColumns = (columns) => {
      const boundedColumns = Math.max(Number(slider.min), Math.min(Number(slider.max), columns));
      const desired = boundedColumns * (cellSize + gap) - gap + shellPadding * 2 + 2;
      shell.style.width = `${Math.min(desired, container.clientWidth)}px`;
      updateMetrics();
    };

    slider.addEventListener("input", () => setColumns(Number(slider.value)));
    grid.addEventListener("mousemove", (event) => {
      const cell = event.target.closest(".sequence-cell");
      if (!cell || !grid.contains(cell)) {
        hideTip();
        return;
      }
      showTip(event, cell.dataset.tip);
    });
    grid.addEventListener("mouseleave", hideTip);
    if ("ResizeObserver" in window) {
      new ResizeObserver(updateMetrics).observe(shell);
    } else {
      window.addEventListener("resize", updateMetrics);
    }
    setColumns(visualization.wrap_columns);
  }

  function initLongSequence() {
    const sequence = data.long_sequence;
    const primary = sequence.streams[sequence.primary_stream];
    const chronologicalSection = sequence.chronological;
    const visualization = chronologicalSection.visualization;
    const chronologyContainer = $("#chronological-sequence-chart");
    if (chronologyContainer) {
      chronologyContainer.classList.remove("sequence-raster");
      chronologyContainer.classList.add("sequence-html-grid");
      chronologyContainer.setAttribute("aria-label", tr("Resizable chronological A B C D answer sequence grid", "Prilagodljiva kronološka mreža odgovorov A B C D"));
      const chronologyExplanation = chronologyContainer.previousElementSibling;
      if (chronologyExplanation?.classList.contains("chart-explanation")) {
        chronologyExplanation.textContent = tr(
          "Read left to right, then continue on the next row. Each cell is one effective-ladder correct answer, including Q1; repeated broadcasts are removed. Changing the number of columns rewraps the same sequence while preserving season-start markers.",
          "Zaporedje se bere od leve proti desni in nadaljuje v naslednji vrstici. Vsaka celica predstavlja en pravilni odgovor iz dejanskega zaporedja igre, vključno s Q1; ponovljena predvajanja so odstranjena. Sprememba števila stolpcev drugače razporedi isto zaporedje, začetki sezon pa ostanejo označeni.",
        );
      }
      chronologicalSequenceGrid(chronologyContainer, visualization);
    }
    $("#sequence-family-scatter")?.classList.add("compact-scatter-text");
    setText("#chronological-sequence-meta", tr(
      `${integer(visualization.letters.length)} answers, including ${integer(visualization.q1_count)} at Q1, across ${visualization.season_boundaries.length} Godler-era seasons. The predictive tests below still use Q2+ so the established Q1 placement rule cannot inflate their results.`,
      `${integer(visualization.letters.length)} odgovorov, od tega ${integer(visualization.q1_count)} na Q1, v ${visualization.season_boundaries.length} sezonah Godlerjeve dobe. Spodnji napovedni preizkusi še vedno uporabljajo Q2+, da znano pravilo za Q1 ne bi umetno izboljšalo rezultatov.`,
    ));
    const streamLabels = {
      contestant_ladder: tr("Contestant / ladder", "Tekmovalec / lestvica"),
      contestant_board: tr("Contestant / all boards", "Tekmovalec / vsa vprašanja"),
      episode_ladder: tr("Episode / ladder", "Epizoda / lestvica"),
      episode_board: tr("Episode / all boards", "Epizoda / vsa vprašanja"),
    };
    const streamColors = {
      contestant_ladder: "var(--b)",
      contestant_board: "var(--c)",
      episode_ladder: "var(--a)",
      episode_board: "var(--d)",
    };
    const familyLabels = {
      ngram: "N-gram",
      initial_prefix: tr("Exact prefix", "Natančna začetna predpona"),
      nearest_prefix: tr("Nearest prefix", "Najbližja začetna predpona"),
      shifted_template: tr("Shifted template", "Zamaknjen vzorec"),
      periodic: tr("Periodic", "Periodično pravilo"),
      block_transform: tr("Block transform", "Pretvorba blokov"),
      latent_template: tr("Latent template", "Skriti vzorec"),
    };
    const familyPoints = Object.entries(sequence.streams).flatMap(([streamName, stream]) =>
      stream.families.map((family) => ({
        x: family.tuning.delta,
        y: family.holdout.delta,
        label: familyLabels[family.family],
        showLabel: streamName === sequence.primary_stream,
        color: streamColors[streamName],
        radius: streamName === sequence.primary_stream ? 6 : 4,
        tooltip: `<strong>${familyLabels[family.family]}</strong><br>${streamLabels[streamName]}<br>${tr("S08 gain", "razlika v točnosti na S08")} ${pct(family.tuning.delta, 2)}<br>${tr("S09-S10 gain", "razlika v točnosti na S09–S10")} ${pct(family.holdout.delta, 2)}<br>${tr("shuffle p", "p po premešanju")} ${pValue(family.null.empirical_p_value)}<br>${Object.entries(family.selected_config).map(([key, value]) => `${key}=${value}`).join(", ")}`,
      }))
    );
    scatterPlot($("#sequence-family-scatter"), familyPoints, {
      xLabel: tr("S08 gain over B fallback", "Razlika v točnosti glede na pravilo B na S08"),
      yLabel: tr("S09-S10 gain over B fallback", "Razlika v točnosti glede na pravilo B na S09–S10"),
      xFormat: (value) => pct(value, 0),
      yFormat: (value) => pct(value, 0),
      xMin: -0.01,
      xMax: 0.05,
      yMin: -0.1,
      yMax: 0.02,
      xReference: 0,
      yReference: 0,
    });

    const advanced = chronologicalSection.advanced;
    const advancedFamilies = [
      [tr("Adaptive backoff", "Prilagodljivi odmik"), advanced.adaptive_backoff],
      [tr("History logistic", "Logistični model zgodovine"), advanced.long_history_models.logistic],
      [tr("History Extra Trees", "Extra Trees zgodovine"), advanced.long_history_models.extra_trees],
      [tr("Balance / quota", "Ravnotežje / kvota"), advanced.balance_and_quota],
      [tr("Two-lag recurrence", "Rekurenca z dvema zamikoma"), advanced.modular_recurrence],
    ];
    const advancedColors = ["var(--a)", "var(--b)", "var(--c)", "var(--d)", "var(--ink)"];
    const advancedPoints = advancedFamilies.map(([label, result], index) => ({
      x: result.tuning.delta,
      y: result.holdout.delta,
      label,
      showLabel: true,
      color: advancedColors[index],
      radius: 6,
      tooltip: `<strong>${label}</strong><br>${tr("S08 gain", "razlika v točnosti na S08")} ${pct(result.tuning.delta, 2)}<br>${tr("S09-S10 gain", "razlika v točnosti na S09–S10")} ${pct(result.holdout.delta, 2)}<br>${tr("future accuracy", "točnost na testni množici")} ${pct(result.holdout.accuracy, 2)}<br>${tr("paired p", "parni p")} ${pValue(result.holdout.paired_p_value)}`,
    }));
    scatterPlot($("#advanced-sequence-scatter"), advancedPoints, {
      xLabel: tr("S08 gain over B fallback", "Razlika v točnosti glede na pravilo B na S08"),
      yLabel: tr("S09-S10 gain over B fallback", "Razlika v točnosti glede na pravilo B na S09–S10"),
      xFormat: (value) => pct(value, 0),
      yFormat: (value) => pct(value, 0),
      xMin: -0.1,
      xMax: 0.06,
      yMin: -0.08,
      yMax: 0.02,
      xReference: 0,
      yReference: 0,
    });
    const compression = chronologicalSection.descriptive.compression;
    const balance = primary.descriptive.within_run_balance;
    setText("#compression-zlib", `${integer(compression.observed_compressed_bytes)} ${tr("observed vs", "opaženo proti")} ${compression.null_compressed_bytes_mean.toFixed(1)} ${tr("shuffled", "premešano")}; p=${pValue(compression.compressed_lower_tail_p_value)}`);
    setText("#compression-lz", `${integer(compression.observed_lz78_phrases)} ${tr("observed vs", "opaženo proti")} ${compression.null_lz78_phrases_mean.toFixed(1)} ${tr("shuffled", "premešano")}; p=${pValue(compression.lz78_lower_tail_p_value)}`);
    setText("#run-balance", `${pct(balance.same_pair_share, 2)} ${tr("observed vs", "opaženo proti")} ${pct(balance.null_mean, 2)} ${tr("shuffled", "premešano")}; p=${pValue(balance.two_sided_p_value)}`);
    setText("#advanced-search-count", `${integer(advanced.total_configurations_tested)} ${tr("added", "dodanih")}; ${integer(sequence.total_tuned_sequence_configurations)} ${tr("total", "skupaj")}`);

    const motifPoints = primary.descriptive.ngram_recurrence.map((item) => ({
      x: item.null_mean,
      y: item.repeated_occurrence_share,
      label: `${item.length}-gram`,
      showLabel: true,
      color: item.fdr_q_value < 0.05 ? "var(--a)" : "var(--b)",
      tooltip: `<strong>${item.length}-${tr("letter motifs", "črkovni motivi")}</strong><br>${tr("observed", "opaženo")} ${pct(item.repeated_occurrence_share, 2)}<br>${tr("shuffle mean", "povprečje premešanj")} ${pct(item.null_mean, 2)}<br>FDR q ${pValue(item.fdr_q_value)}`,
    }));
    scatterPlot($("#motif-scatter"), motifPoints, {
      xLabel: tr("Shuffled repeated-occurrence share", "Delež ponovitev v premešanih podatkih"),
      yLabel: tr("Observed repeated-occurrence share", "Opaženi delež ponovitev"),
      xFormat: (value) => pct(value, 0),
      yFormat: (value) => pct(value, 0),
      xMin: 0,
      xMax: 1.02,
      yMin: 0,
      yMax: 1.02,
      diagonal: true,
    });

    const chronological = chronologicalSection.descriptive;
    const chronologicalPoints = chronological.lag_agreement.map((item) => ({
      x: item.lag,
      y: item.same_share - item.null_mean,
      label: `${tr("Lag", "Zamik")} ${item.lag}`,
      color: item.fdr_q_value < 0.05 ? "var(--a)" : "var(--b)",
      radius: item.fdr_q_value < 0.05 ? 6 : 3.5,
      tooltip: `<strong>${tr("Lag", "Zamik")} ${item.lag}</strong><br>${tr("observed", "opaženo")} ${pct(item.same_share, 2)}<br>${tr("null", "ničelni model")} ${pct(item.null_mean, 2)}<br>${tr("difference", "razlika")} ${pct(item.same_share - item.null_mean, 2)}<br>FDR q ${pValue(item.fdr_q_value)}`,
    }));
    scatterPlot($("#chronological-lag-scatter"), chronologicalPoints, {
      xLabel: tr("Lag in chronological Q2+ questions", "Zamik v kronoloških vprašanjih Q2+"),
      yLabel: tr("Observed minus shuffled same-letter rate", "Razlika med opaženim in pričakovanim deležem iste črke"),
      xFormat: (value) => String(Math.round(value)),
      yFormat: (value) => pct(value, 1),
      xMin: 1,
      xMax: 512,
      yMin: -0.025,
      yMax: 0.025,
      yReference: 0,
    });

    const longLagPoints = primary.descriptive.lag_agreement
      .filter((item) => item.n >= 30)
      .map((item) => ({
        x: item.lag,
        y: item.same_share,
        label: `${tr("Lag", "Zamik")} ${item.lag}`,
        color: item.fdr_q_value < 0.05 ? "var(--a)" : "var(--c)",
        tooltip: `<strong>${tr("Lag", "Zamik")} ${item.lag}</strong><br>${tr("observed", "opaženo")} ${pct(item.same_share, 2)}<br>${tr("null", "ničelni model")} ${pct(item.null_mean, 2)}<br>95 % ${tr("null", "ničelni model")} ${pct(item.null_ci_low, 1)}-${pct(item.null_ci_high, 1)}<br>FDR q ${pValue(item.fdr_q_value)}<br>n=${integer(item.n)}`,
      }));
    scatterPlot($("#long-lag-chart"), longLagPoints, {
      xLabel: tr("Lag within logical contestant run", "Zamik znotraj povezane tekmovalčeve igre"),
      yLabel: tr("Same-letter rate", "Delež iste črke"),
      xFormat: (value) => String(Math.round(value)),
      yFormat: (value) => pct(value, 0),
      xMin: 1,
      xMax: Math.max(...longLagPoints.map((point) => point.x)),
      yMin: 0.18,
      yMax: 0.4,
      yReference: 0.25,
    });

    const spectrum = chronological.periodogram;
    const spectrumPoints = spectrum.top_peaks.map((item) => ({
      x: item.period_questions,
      y: item.power,
      label: `${item.period_questions.toFixed(1)}`,
      showLabel: item === spectrum.top_peaks[0],
      color: item.familywise_p_value < 0.05 ? "var(--a)" : "var(--d)",
      tooltip: `<strong>${tr("Period", "Perioda")} ${item.period_questions.toFixed(2)} ${tr("questions", "vprašanj")}</strong><br>${tr("power", "moč")} ${item.power.toFixed(3)}<br>${tr("pointwise p", "točkovni p")} ${pValue(item.pointwise_p_value)}<br>${tr("family-wise p", "družinski p")} ${pValue(item.familywise_p_value)}`,
    }));
    scatterPlot($("#spectrum-scatter"), spectrumPoints, {
      xLabel: tr("Candidate period in Q2+ questions", "Kandidatna perioda v vprašanjih Q2+"),
      yLabel: tr("Categorical spectral power", "Kategorična spektralna moč"),
      xFormat: (value) => value.toFixed(0),
      yFormat: (value) => value.toFixed(1),
      xMin: 2,
      xMax: Math.max(30, ...spectrumPoints.map((point) => point.x)) * 1.04,
      yMin: 0,
      yMax: Math.max(...spectrumPoints.map((point) => point.y)) * 1.15,
    });
  }

  function initSummary() {
    const bestModel = data.models.find((model) => model.name === data.best_model);
    const bestQ2Model = [...data.models].sort((left, right) => right.non_q1_accuracy - left.non_q1_accuracy)[0];
    const sequence = data.long_sequence;
    const primary = sequence.streams[sequence.primary_stream];
    const prefixFamily = primary.families.find((family) => family.family === "initial_prefix");
    const chronologicalRule = sequence.chronological.predictive.periodic_lag;
    const advanced = sequence.chronological.advanced;
    const recurrence = advanced.modular_recurrence;
    const topicModel = data.topic_forecasting.model;
    const topicDetails = topicModel.details;
    const peak = sequence.chronological.descriptive.periodogram.top_peaks[0];
    const sourceSummary = $("#source-summary");
    const holdoutSummary = document.createElement("span");
    holdoutSummary.className = "holdout-summary";
    holdoutSummary.textContent = tr("| chronological S09-S10 holdout", "| kronološka testna množica S09-S10");
    sourceSummary?.replaceChildren(
      document.createTextNode(`${data.source.date_min} ${tr("to", "do")} ${data.source.date_max} `),
      holdoutSummary,
    );
    setText("#best-rule-score", `${modelLabel(bestQ2Model.name)}: ${pct(bestQ2Model.non_q1_accuracy, 2)} ${tr("on future Q2+", "na testni množici Q2+")}`);
    setText("#summary-questions", integer(data.source.row_count));
    setText("#summary-episodes", integer(data.source.episode_count));
    setText("#summary-holdout", integer(data.holdout.q2_plus_uniformity.n));
    setText("#summary-search", integer(sequence.total_tuned_sequence_configurations));
    setText("#summary-best", pct(bestQ2Model.non_q1_accuracy, 2));
    setText("#top-summary", tr(
      `After removing Q1, joining contestant continuations, deduplicating the repeated broadcast block, and searching ${integer(sequence.total_tuned_sequence_configurations)} sequence configurations plus ${integer(topicDetails.candidate_configuration_count)} reviewed-topic/meta configurations, no metadata-only rule beats the B fallback on S09-S10. The selected topic model reaches ${pct(topicModel.non_q1_accuracy, 2)} on future Q2+, versus ${pct(data.holdout.q2_plus_uniformity.letters.B.share, 2)} for B.`,
      `Po odstranitvi Q1, povezavi nadaljevanj istih tekmovalcev, odstranitvi ponovljenega predvajanja ter pregledu ${integer(sequence.total_tuned_sequence_configurations)} nastavitev zaporedij in ${integer(topicDetails.candidate_configuration_count)} nastavitev pregledanih tem oziroma metapodatkov nobeno pravilo samo iz metapodatkov na S09–S10 ni preseglo osnovnega pravila vedno B. Izbrani tematski model je na prihodnjih vprašanjih Q2+ dosegel ${pct(topicModel.non_q1_accuracy, 2)}, pravilo B pa ${pct(data.holdout.q2_plus_uniformity.letters.B.share, 2)}.`,
    ));
    setText("#finding-prefix", `${pct(prefixFamily.holdout.delta, 2)} ${tr("future gain", "razlike v točnosti na testni množici")}`);
    setText("#finding-prefix-note", tr(
      `The best exact-prefix setting gained ${pct(prefixFamily.tuning.delta, 2)} on S08, then reversed on S09-S10.`,
      `Najboljša nastavitev natančne začetne predpone je bila na S08 za ${pct(prefixFamily.tuning.delta, 2)} točnejša od osnovnega pravila, na S09–S10 pa manj točna.`,
    ));
    setText("#finding-cycle", `${tr("Lag", "Zamik")} ${chronologicalRule.selected_period}: ${pct(chronologicalRule.holdout.delta, 2)}`);
    setText("#finding-cycle-note", tr(
      `The strongest spectrum candidate is ${peak.period_questions.toFixed(2)} questions, but its family-wise p-value is ${pValue(peak.familywise_p_value)}.`,
      `Najmočnejši spektralni kandidat ima periodo ${peak.period_questions.toFixed(2)} vprašanja, vendar je njegov p po popravku za celotno družino testov ${pValue(peak.familywise_p_value)}.`,
    ));
    setText("#finding-content", `${pct(bestQ2Model.non_q1_accuracy, 2)} Q2+`);
    setText("#finding-content-note", tr(
      `Near-repeat question retrieval improves on the ${pct(data.holdout.q2_plus_uniformity.letters.B.share, 2)} always-B result because known answer text reappears in current options.`,
      `Iskanje skoraj ponovljenih vprašanj izboljša rezultat vedno B (${pct(data.holdout.q2_plus_uniformity.letters.B.share, 2)}), ker se besedilo znanega pravilnega odgovora znova pojavi med trenutnimi možnostmi.`,
    ));
    setText("#search-scope", tr(
      `${integer(sequence.total_tuned_sequence_configurations)} sequence configurations and ${integer(topicDetails.candidate_configuration_count)} topic/meta configurations were selected without S09-S10. The latter combine 310 reviewed topics or 15 broad groups with question position, difficulty band, the previous revealed answer, and seven shrinkage strengths. Sequence tests include n-grams through order 32, periods and lags through 512, balanced blocks, 128-lag histories, hidden templates, and two-lag algebraic recurrences. Compression and spectral nulls use position-preserving shuffles.`,
      `Brez vpogleda v S09–S10 je bilo izbranih ${integer(sequence.total_tuned_sequence_configurations)} nastavitev zaporedij in ${integer(topicDetails.candidate_configuration_count)} nastavitev tem oziroma metapodatkov. Slednje združujejo 310 pregledanih tem ali 15 širših skupin z mestom vprašanja, težavnostnim razredom, prejšnjim razkritim odgovorom in sedmimi močmi krčenja. Preizkusi zaporedij vključujejo n-grame do reda 32, periode in zamike do 512, uravnotežene bloke, zgodovine do 128 zamikov, skrite vzorce ter algebraične rekurence z dvema zamikoma. Preizkusa stiskanja in spektra uporabljata premešanja, ki ohranijo mesto vprašanja.`,
    ));
    setText("#html-tested", tr(
      `The search covers displayed-board and effective-ladder streams at logical contestant, episode, and uninterrupted chronological boundaries. Prefix-locked models see only the first few Q2+ answers; adaptive models consume only already revealed answers. The topic pass uses the complete row-by-row semantic review and tests topic, question number, difficulty band, and the previous answer. The deeper sequence pass adds recency gaps, rolling counts, fixed block quotas, online contexts through order 32, nonlinear 128-lag histories, and 221,184 sum/difference/XOR recurrences under all A/B/C/D encodings.`,
      `Analiza zajema zaporedja prikazanih vprašanj in dejansko napredovanje po povezanih igrah tekmovalcev, epizodah ter neprekinjeni kronologiji. Modeli začetne predpone uporabljajo le prvih nekaj odgovorov Q2+, prilagodljivi modeli pa samo že prikazane odgovore. Tematski del uporablja celoten pregled vsake vrstice ter preverja temo, številko vprašanja, težavnostni razred in prejšnji odgovor. Dodatni pregled zaporedij vključuje razmike od zadnje črke, drseča štetja, fiksne kvote blokov, sprotne kontekste do reda 32, nelinearne zgodovine s 128 zamiki in 221.184 rekurenc vsote, razlike ter XOR pri vseh kodiranjih A/B/C/D.`,
    ));
    setText("#html-failed", tr(
      `Every original primary sequence family remains negative on pooled S09-S10. Topic/meta selection chose “${topicDetails.selected_label}” with strong shrinkage (${integer(topicDetails.selected_alpha)}), but it loses ${pct(-topicModel.non_q1_delta_vs_majority, 2)} against B on future Q2+. The selected history tree, history logistic, adaptive backoff, and balance rule also lose. None of 512 corrected lags or periods through 1,000 is significant, and the stream is not unusually compressible.`,
      `Vsaka glavna družina pravil zaporedja je na združenih S09–S10 slabša od osnovnega pravila B. Izbor tem in metapodatkov je izbral širšo temo z močnim krčenjem (${integer(topicDetails.selected_alpha)}), vendar je bil na prihodnjih vprašanjih Q2+ za ${pct(-topicModel.non_q1_delta_vs_majority, 2)} manj točen od pravila B. Manj točni so bili tudi drevesni in logistični model zgodovine, prilagodljivi odmik ter pravilo ravnotežja. Noben od 512 popravljenih zamikov ali period do 1.000 ni statistično značilen, zaporedje pa ni nenavadno dobro stisljivo.`,
    ));
    setText("#html-useful", tr(
      `The durable predictive signal is content reuse: the tuned near-repeat model reaches ${pct(bestQ2Model.non_q1_accuracy, 2)} on future Q2+. Exact and near-matching historical questions can identify a known correct answer when the same answer text appears among current options. Without such a match, topic, position, and prior sequence do not improve on B, which remains a low-confidence Q2+ prior rather than a decoded next step.`,
      `Uporabna napovedna informacija izhaja iz ponavljanja vsebine: prilagojeni model skoraj ponovljenih vprašanj na prihodnjih Q2+ doseže ${pct(bestQ2Model.non_q1_accuracy, 2)}. Enako ali zelo podobno preteklo vprašanje lahko pokaže znani pravilni odgovor, kadar se isto besedilo znova pojavi med možnostmi. Brez takega ujemanja tema, mesto vprašanja in prejšnje zaporedje ne izboljšajo pravila B, ki ostaja le šibka osnovna verjetnost in ne razkrit naslednji odgovor.`,
    ));
    setText("#html-limits", tr(
      `Failure to find a rule does not prove the setters use physical or cryptographic randomness. It does show that the searched topic, question-position, previous-answer, deterministic, shifted, periodic, balanced, algebraic, clustered, long-memory, lexical, and board-shape rules do not generalize at useful accuracy from this catalogue. Recording order may differ from airing order, and 19 known source-gap boards remain unavailable.`,
      `Neuspešno iskanje pravila ne potrjuje fizične ali kriptografske naključnosti. Pokaže pa, da preverjena pravila teme, mesta vprašanja, prejšnjega odgovora, deterministična, zamaknjena, periodična, uravnotežena, algebraična, skupinska, zgodovinska, besedilna pravila in pravila oblike vprašanja na testnih podatkih ne dosegajo uporabne točnosti. Vrstni red snemanja se lahko razlikuje od vrstnega reda predvajanja, podatki za 19 znanih manjkajočih vprašanj pa niso na voljo.`,
    ));
    setText("#verdict-q1", pct(data.modern_era.q1_letters.D.share, 2));
    setText("#verdict-b", pct(data.modern_era.q2_plus_letters.B.share, 2));
    setText("#verdict-d", pct(data.modern_era.q2_plus_letters.D.share, 2));
    setText("#verdict-repeat", pct(data.modern_era.sequence.repeat_share, 2));
    setText("#verdict-best", `${pct(bestModel.accuracy, 2)} ${tr("overall", "skupaj")}; ${pct(bestModel.non_q1_accuracy, 2)} Q2+`);
    setText("#generated-at", `${tr("Generated", "Ustvarjeno")} ${new Date(data.generated_at).toLocaleString(locale)}`);
  }

  function initDistribution() {
    const datasets = {
      all: {
        letters: data.overall.letters,
        p: data.overall.uniform_p_value,
        v: data.overall.uniform_effect_size_v,
        note: tr("Includes the modern Q1-D convention.", "Vključuje sodobno pravilo Q1 = D."),
      },
      q2: {
        letters: data.overall.q2_plus_uniformity.letters,
        p: data.overall.q2_plus_uniformity.p_value,
        v: data.overall.q2_plus_uniformity.effect_size_v,
        note: tr("All seasons with Q1 removed.", "Vse sezone brez prvega vprašanja."),
      },
      modern: {
        letters: data.modern_era.q2_plus_uniformity.letters,
        p: data.modern_era.q2_plus_uniformity.p_value,
        v: data.modern_era.q2_plus_uniformity.effect_size_v,
        note: tr("S03-S10, Q2 and later only.", "S03-S10, samo Q2 in poznejša vprašanja."),
      },
      holdout: {
        letters: data.holdout.q2_plus_uniformity.letters,
        p: data.holdout.q2_plus_uniformity.p_value,
        v: data.holdout.q2_plus_uniformity.effect_size_v,
        note: tr("Untouched S09-S10 holdout, Q2 and later.", "Ločena testna množica S09–S10, Q2 in poznejša vprašanja."),
      },
    };
    segmented($("#distribution-filter"), [
      { value: "all", label: tr("All", "Vse") },
      { value: "q2", label: tr("All Q2+", "Vse Q2+") },
      { value: "modern", label: tr("Godler Q2+", "Godler Q2+") },
      { value: "holdout", label: tr("Holdout Q2+", "Test S09-S10 Q2+") },
    ], "modern", (key) => {
      const item = datasets[key];
      letterBars($("#distribution-chart"), item.letters);
      setText("#uniformity-p", `p = ${pValue(item.p)}`);
      setText("#uniformity-note", `${item.note} ${tr("Effect size", "Velikost učinka")} V = ${item.v.toFixed(3)}.`);
    });
  }

  function initPosition() {
    segmented($("#position-filter"), [
      { value: "all", label: tr("All seasons", "Vse sezone") },
      { value: "modern", label: tr("Godler era", "Godlerjeva doba") },
    ], "modern", (key) => {
      const groups = key === "modern" ? data.modern_era.by_question_number : data.grouped.question_number;
      positionHeatmap($("#position-heatmap"), groups);
    });
  }

  function initModels() {
    const metrics = {
      all: { key: "accuracy", label: tr("All holdout", "Celotna testna množica") },
      q2: { key: "non_q1_accuracy", label: tr("Q2+ only", "Samo Q2+") },
      novel: { key: "novel_question_accuracy", label: tr("Novel questions", "Nova vprašanja") },
    };
    segmented($("#model-filter"), Object.entries(metrics).map(([value, item]) => ({ value, label: item.label })), "all", (metric) => {
      const key = metrics[metric].key;
      const items = data.models.map((model) => ({
        label: modelLabel(model.name),
        value: model[key],
        color: model.name === data.best_model ? "var(--c)" : "var(--b)",
        detail: metric === "q2" ? `${tr("delta vs majority", "razlika proti večinski črki")} ${pct(model.non_q1_delta_vs_majority, 2)}` : `n=${metric === "novel" ? integer(model.novel_question_n) : integer(data.holdout.test_n)}`,
      }));
      horizontalBars($("#model-chart"), items, { max: 0.5, reference: 0.25, format: (value) => pct(value, 1), left: 320 });
    });
  }

  function initAssociations() {
    const items = [...data.association_tests]
      .sort((a, b) => b.cramers_v - a.cramers_v)
      .map((test) => ({ label: associationLabel(test.field), value: test.cramers_v, detail: `p=${pValue(test.p_value)}` }));
    horizontalBars($("#association-chart"), items, { max: 0.32, format: (value) => value.toFixed(3), left: 150, width: 680 });
  }

  initSummary();
  initLongSequence();
  initDistribution();
  stackedRows($("#q1-season-chart"), data.question_position.q1_by_season, { prefix: "S", left: 56, width: 720 });
  letterBars($("#modern-q2-chart"), data.modern_era.q2_plus_letters, { height: 330 });
  initPosition();
  stackedRows($("#season-chart"), data.grouped.season, { prefix: "S", left: 60, width: 1120, rowHeight: 30 });
  transitionHeatmap($("#transition-heatmap"), data.modern_era.sequence);
  lineChart($("#lag-chart"), data.modern_era.sequence.lag_agreement.map((item) => ({ label: item.lag, value: item.same_share, n: item.n })), { yMin: 0.21, yMax: 0.28 });
  initModels();
  initAssociations();
  buildProspectiveScatterSection();
  buildScatterSection();
})();
