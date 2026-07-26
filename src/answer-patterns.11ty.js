import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copy } from "../lib/i18n.mjs";
import { breadcrumbs, layout, pathFor } from "../lib/render.mjs";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "_includes/answer-patterns");

export default class AnswerPatternsPage {
  data() {
    return {
      pagination: { data: "catalog.languages", size: 1, alias: "lang" },
      permalink: (data) => `/${data.lang}/statistics/answer-patterns/index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  async render({ lang }) {
    const sl = lang === "sl";
    const title = sl ? "Vzorci pravilnih odgovorov" : "Correct-answer patterns";
    const dashboard = await readFile(path.join(sourceDir, sl ? "sl.html" : "en.html"), "utf8");
    const body = `${breadcrumbs(lang, [
      { label: copy[lang].nav.statistics, href: pathFor(lang, "statistics") },
      { label: title },
    ])}${dashboard}`;
    return layout({
      lang,
      title,
      description: sl
        ? "Poglobljena statistična analiza zaporedij pravilnih odgovorov v katalogu oddaje Milijonar."
        : "In-depth statistical analysis of correct-answer sequences in the Milijonar catalogue.",
      body,
      active: "statistics",
      alternateUrl: pathFor(sl ? "en" : "sl", "patterns"),
      bodyClass: "answer-patterns-page",
      styles: ["/assets/css/answer-patterns.css", "/assets/css/pattern-theme.css"],
      scripts: ["/assets/js/answer-patterns.js"],
    });
  }
}
