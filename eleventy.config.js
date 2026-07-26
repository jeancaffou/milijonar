import { prepareBuildOutput } from "./scripts/prepare-build-output.mjs";

// Apply polling to every Chokidar instance Eleventy starts, including the
// separate development-server watcher used by direct `eleventy --serve` calls.
process.env.CHOKIDAR_USEPOLLING ??= "1";
process.env.CHOKIDAR_INTERVAL ??= "750";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("questions.csv");
  eleventyConfig.addWatchTarget("contestants.csv");
  eleventyConfig.addWatchTarget("src/assets/data/answer-patterns.json");

  // This workspace lives on a CIFS/SMB mount, where native fs.watch events are
  // unreliable. Polling keeps the optional editing server stable. The normal
  // `npm run serve` preview does not watch the filesystem at all.
  eleventyConfig.setChokidarConfig({
    usePolling: true,
    interval: 750,
    binaryInterval: 1500,
  });
  eleventyConfig.setWatchThrottleWaitTime(250);

  eleventyConfig.on("eleventy.after", async () => {
    await prepareBuildOutput({
      portableEvidence: process.env.CATALOG_PORTABLE_EVIDENCE === "1",
    });
  });

  eleventyConfig.setServerOptions({
    domDiff: false,
    port: 8080,
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
    templateFormats: ["njk", "11ty.js"],
  };
}
