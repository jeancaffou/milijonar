import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_TEXT_FIELDS = [
  "broad_sl",
  "broad_en",
  "label_sl",
  "label_en",
  "description_sl",
  "description_en",
  "inclusion",
  "exclusion",
  "study_focus_sl",
  "study_focus_en",
];

function validateTopic(topic, sourceLabel) {
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) {
    throw new Error(`${sourceLabel}: each topic must be an object`);
  }
  for (const key of ["id", "broad_id"]) {
    if (!ID_PATTERN.test(String(topic[key] || ""))) {
      throw new Error(`${sourceLabel}: invalid ${key} on topic ${topic.id || "(blank)"}`);
    }
  }
  if (topic.id === topic.broad_id) {
    throw new Error(`${sourceLabel}: topic ${topic.id} duplicates its broad navigation domain`);
  }
  for (const key of REQUIRED_TEXT_FIELDS) {
    if (!String(topic[key] || "").trim()) {
      throw new Error(`${sourceLabel}: topic ${topic.id} has no ${key}`);
    }
  }
  if (!Array.isArray(topic.example_indices)) {
    throw new Error(`${sourceLabel}: topic ${topic.id} has no example_indices array`);
  }
  const exampleIndices = topic.example_indices;
  if (exampleIndices.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error(`${sourceLabel}: topic ${topic.id} has an invalid example index`);
  }
  if (new Set(exampleIndices).size !== exampleIndices.length) {
    throw new Error(`${sourceLabel}: topic ${topic.id} has duplicate example indices`);
  }
}

export function reviewedTaxonomySha256(taxonomy) {
  const fingerprint = {
    version: taxonomy.version,
    topics: taxonomy.topics,
    editorial_notes: taxonomy.editorial_notes || [],
  };
  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
}

export async function loadReviewedTaxonomy(catalogDir, basePath) {
  const resolvedBasePath = basePath || path.join(catalogDir, "src/_data/curated/question-topic-taxonomy.json");
  const base = JSON.parse(await readFile(resolvedBasePath, "utf8"));
  const additionsPath = path.join(catalogDir, "src/_data/curated/question-topic-taxonomy-additions.json");
  let additions = { topics: [] };
  try {
    additions = JSON.parse(await readFile(additionsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!Number.isInteger(base.version) || base.version < 1) {
    throw new Error("Reviewed taxonomy has no valid version");
  }
  if (!Array.isArray(base.topics) || !Array.isArray(additions.topics)) {
    throw new Error("Reviewed taxonomy files must contain topic arrays");
  }
  if (additions.version !== undefined && additions.version !== base.version) {
    throw new Error(`Taxonomy additions version ${additions.version} does not match base version ${base.version}`);
  }
  const topics = [...base.topics, ...(additions.topics || [])];
  topics.forEach((topic, index) => validateTopic(topic, `Reviewed taxonomy topic ${index}`));
  const ids = topics.map((topic) => topic.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate topic IDs across taxonomy files");
  return { ...base, topics };
}
