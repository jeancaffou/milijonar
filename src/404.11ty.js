import { layout } from "../lib/render.mjs";
import { sitePath } from "../lib/site-path.mjs";

export default class NotFoundPage {
  data() {
    return { permalink: "/404.html", eleventyExcludeFromCollections: true };
  }

  render() {
    const body = `<section class="not-found-panel">
      <p class="eyebrow">404</p>
      <h1>Strani ni mogoče najti.<br><span lang="en">Page not found.</span></h1>
      <p>Stran ne obstaja ali je bila premaknjena.<br><span lang="en">The page does not exist or has moved.</span></p>
      <div class="not-found-actions"><a class="button-link" href="${sitePath("/sl/")}">Slovenščina</a><a class="button-link" href="${sitePath("/en/")}" lang="en">English</a></div>
    </section>`;
    return layout({
      lang: "sl",
      title: "404",
      description: "Strani ni mogoče najti. Page not found.",
      body,
      alternateUrl: sitePath("/en/"),
      bodyClass: "not-found-page",
    });
  }
}
