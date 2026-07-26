import { escapeHtml } from "../lib/render.mjs";
import { siteBase, sitePath } from "../lib/site-path.mjs";

export default class LanguageLanding {
  data() {
    return {
      permalink: "/index.html",
      eleventyExcludeFromCollections: true,
    };
  }

  render() {
    return `<!doctype html>
<html lang="sl" data-base-path="${escapeHtml(siteBase)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Katalog oddaje Milijonar | Milijonar Catalogue</title>
  <meta name="description" content="Bilingual catalogue of Milijonar questions, answers, contestants, episodes and statistics.">
  <meta name="theme-color" content="#111735">
  <link rel="icon" href="${sitePath("/assets/favicon.svg")}" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${sitePath("/assets/css/catalog.css")}">
</head>
<body class="language-landing">
  <main class="language-gate">
    <svg class="language-gate__mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 96 50 50 96 4 50 50 4Z"/><path d="m50 20 30 30-30 30-30-30 30-30Z"/><circle cx="50" cy="50" r="11"/></svg>
    <p class="eyebrow">MILIJONAR</p>
    <h1>Katalog oddaje Milijonar<br><span lang="en">Milijonar catalogue</span></h1>
    <div class="language-gate__choices">
      <a href="${sitePath("/sl/")}" lang="sl"><strong>Slovenščina</strong><span>Odpri slovenski katalog</span></a>
      <a href="${sitePath("/en/")}" lang="en"><strong>English</strong><span>Open English catalogue</span></a>
    </div>
  </main>
  <script>try{const l=localStorage.getItem("milijonar-language");if(l==="sl"||l==="en")location.replace(${JSON.stringify(siteBase)}+"/"+l+"/")}catch(e){}</script>
</body>
</html>`;
  }
}
