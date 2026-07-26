import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "./taxonomy.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(toolDir, "../..");
const inputPath = process.argv[2]
  ? path.resolve(catalogDir, process.argv[2])
  : path.join(catalogDir, "src/_data/curated/question-topic-taxonomy.json");
const outputPath = path.join(catalogDir, "work/analysis-output/question-topics/classifier-taxonomy.json");
const taxonomy = await loadReviewedTaxonomy(catalogDir, inputPath);

const seenIds = new Set();
const compactTopics = taxonomy.topics.map((topic) => {
  if (seenIds.has(topic.id)) throw new Error(`Duplicate topic id: ${topic.id}`);
  seenIds.add(topic.id);
  return {
    id: topic.id,
    label_sl: topic.label_sl,
    label_en: topic.label_en,
    broad_sl: topic.broad_sl,
    inclusion: topic.inclusion,
    exclusion: topic.exclusion,
  };
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  version: taxonomy.version,
  taxonomy_sha256: reviewedTaxonomySha256(taxonomy),
  topic_count: compactTopics.length,
  topics: compactTopics,
}, null, 2)}\n`, "utf8");
console.log(path.relative(catalogDir, outputPath));
console.log(`${compactTopics.length} specific topics`);
