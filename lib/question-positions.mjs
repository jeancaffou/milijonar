import { escapeHtml, formatNumber, pathFor } from "./render.mjs";

export function questionCountText(count, lang) {
  const formatted = formatNumber(count, lang);
  if (lang !== "sl") return `${formatted} ${count === 1 ? "question" : "questions"}`;

  const lastTwo = Math.abs(count) % 100;
  const noun = lastTwo === 1
    ? "vprašanje"
    : lastTwo === 2
      ? "vprašanji"
      : lastTwo === 3 || lastTwo === 4
        ? "vprašanja"
        : "vprašanj";
  return `${formatted} ${noun}`;
}

export function questionPositionMenu(positions, lang, current = 0) {
  const sl = lang === "sl";
  const navigationLabel = sl
    ? "Vprašanja po zaporedni številki"
    : "Questions by position";

  return `<nav class="question-position-nav" aria-label="${escapeHtml(navigationLabel)}">
    <ol>${positions.map((position) => {
      const label = `Q${position.number}: ${questionCountText(position.total, lang)}`;
      return `<li><a href="${pathFor(lang, "questionPosition", `q${position.number}`)}"${position.number === current ? ' aria-current="page"' : ""} aria-label="${escapeHtml(label)}"><strong>Q${position.number}</strong><small>${formatNumber(position.total, lang)}</small></a></li>`;
    }).join("")}</ol>
  </nav>`;
}
