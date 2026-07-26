import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "../../lib/csv.mjs";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "./taxonomy.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(toolDir, "../..");
const taxonomy = await loadReviewedTaxonomy(catalogDir);
const reviewedSource = await readFile(path.join(catalogDir, "src/_data/curated/question-topic-assignments.json"), "utf8");
const reviewed = JSON.parse(reviewedSource);
const questionSource = await readFile(path.join(catalogDir, "questions.csv"), "utf8");
const questions = parseCsvObjects(questionSource);
const sourceHash = createHash("sha256").update(questionSource).digest("hex");
const taxonomyHash = reviewedTaxonomySha256(taxonomy);
const topicIds = new Set(taxonomy.topics.map((topic) => topic.id));
const confidenceValues = new Set(["high", "medium", "low"]);
const expectedReviewMethod = "Row-by-row GPT semantic review of the complete Slovenian question and all four answer options.";
const publicTopicCopyOverrides = {
  "awards-prizes-honours": {
    label_sl: "Nagrade, priznanja in odlikovanja",
    label_en: "Awards, prizes and honours",
    description_sl: "Prejemniki, kategorije, ustanovitelji in zgodovina nagrad, ki nimajo samostojne področne teme.",
    description_en: "Recipients, categories, founders and histories of awards without a dedicated subject topic.",
  },
  "basketball-teams-coaches-leagues": {
    study_focus_en: "Connect teams with leagues, coaches, eras, starting fives and honours.",
  },
  "international-pop-rock-bands-members": {
    description_en: "Band origins, frontpeople, former members, instruments and personnel changes.",
    study_focus_en: "Prepare a map of bands, founders, frontpeople and notable personnel histories.",
  },
  "law-courts-legal-concepts-penology": {
    description_sl: "Sodni postopki, pravni izrazi, ugotavljanje dejstev, sankcije, pomilostitve, dedovanje, sodni simboli in penologija.",
    description_en: "Court procedure, legal terminology, fact-finding, sanctions, clemency, inheritance, judicial symbols and penology.",
    study_focus_sl: "Ponovi temeljne pravne pojme, sodne postopke, pravila ugotavljanja dejstev, sankcije, pomilostitve in kaznovalni sistem.",
    study_focus_en: "Review core legal terms, court procedures, fact-finding rules, sanctions, clemency and penal systems.",
  },
  "rugby-rules-teams-tournaments": {
    study_focus_sl: "Ponovi različice, sestave ekip, točkovanje, položaje, reprezentance in pokale.",
  },
};

function publicTopicCopy(topic, field) {
  return publicTopicCopyOverrides[topic.id]?.[field] ?? topic[field];
}

if (reviewed.version !== 1 || reviewed.source !== "questions.csv") {
  throw new Error("Reviewed assignment file has unsupported provenance");
}
if (reviewed.method !== expectedReviewMethod || !/^gpt-/i.test(String(reviewed.model || ""))) {
  throw new Error("Reviewed assignment file does not declare the GPT semantic-review method");
}
if (reviewed.source_sha256 !== sourceHash || reviewed.question_count !== questions.length) {
  throw new Error("Reviewed assignments do not match the current questions.csv");
}
if (reviewed.taxonomy_version !== taxonomy.version
    || reviewed.taxonomy_sha256 !== taxonomyHash
    || reviewed.taxonomy_topic_count !== taxonomy.topics.length) {
  throw new Error("Reviewed assignments do not match the current topic taxonomy");
}
if (!Array.isArray(reviewed.assignments) || reviewed.assignments.length !== questions.length) {
  throw new Error("Reviewed assignment count is incomplete");
}
const assignmentsHash = createHash("sha256").update(JSON.stringify(reviewed.assignments)).digest("hex");
if (reviewed.assignments_sha256 !== assignmentsHash) {
  throw new Error("Reviewed assignments have changed since they were merged");
}
const reviewProvenance = {
  review_batches: reviewed.review_batches,
  legacy_unbound_taxonomy_batches: reviewed.legacy_unbound_taxonomy_batches,
  review_overrides: reviewed.review_overrides,
  override_replacement_count: reviewed.override_replacement_count,
};
const reviewProvenanceHash = createHash("sha256").update(JSON.stringify(reviewProvenance)).digest("hex");
if (reviewed.review_provenance_sha256 !== reviewProvenanceHash) {
  throw new Error("Reviewed assignment provenance has changed since it was merged");
}
if (!Array.isArray(reviewed.review_batches)
    || !Array.isArray(reviewed.legacy_unbound_taxonomy_batches)
    || !Array.isArray(reviewed.review_overrides)) {
  throw new Error("Reviewed assignment provenance arrays are incomplete");
}
const overrideRows = new Set();
for (const override of reviewed.review_overrides) {
  if (!Array.isArray(override.row_indices) || override.row_count !== override.row_indices.length) {
    throw new Error(`Override ${override.file || "(unknown)"} has invalid row coverage`);
  }
  if (override.taxonomy_sha256 !== taxonomyHash || !/^[a-f0-9]{64}$/.test(String(override.input_sha256 || ""))) {
    throw new Error(`Override ${override.file || "(unknown)"} has stale provenance`);
  }
  if (!Number.isInteger(override.changed_assignment_count)
      || override.changed_assignment_count < 0
      || override.changed_assignment_count > override.row_count) {
    throw new Error(`Override ${override.file || "(unknown)"} has an invalid change count`);
  }
  for (const rowIndex of override.row_indices) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= questions.length || overrideRows.has(rowIndex)) {
      throw new Error(`Override ${override.file || "(unknown)"} has a duplicate or invalid row index`);
    }
    overrideRows.add(rowIndex);
  }
}
if (reviewed.override_replacement_count !== overrideRows.size) {
  throw new Error("Override replacement total does not match its provenance records");
}
for (let index = 0; index < reviewed.assignments.length; index += 1) {
  const assignment = reviewed.assignments[index];
  const { row_index: rowIndex, topic_id: topicId, confidence, alternate_topic_id: alternateTopicId, note } = assignment;
  if (rowIndex !== index) throw new Error(`Reviewed row ${index} is missing, duplicated, or out of order`);
  if (!topicIds.has(topicId)) throw new Error(`Unknown reviewed topic ${topicId} at row ${rowIndex}`);
  if (!confidenceValues.has(confidence)) throw new Error(`Invalid confidence ${confidence} at row ${rowIndex}`);
  if (alternateTopicId !== null && !topicIds.has(alternateTopicId)) {
    throw new Error(`Unknown alternate topic ${alternateTopicId} at row ${rowIndex}`);
  }
  if (alternateTopicId === topicId) throw new Error(`Identical topics at row ${rowIndex}`);
  if (typeof note !== "string") throw new Error(`Invalid review note at row ${rowIndex}`);
  if (confidence === "high" && (alternateTopicId !== null || note.trim())) {
    throw new Error(`High-confidence row ${rowIndex} must have no alternate or note`);
  }
  if (confidence !== "high" && (!alternateTopicId || !note.trim())) {
    throw new Error(`${confidence}-confidence row ${rowIndex} needs an alternate and note`);
  }
}
for (const topic of taxonomy.topics) {
  if (topic.example_indices.some((index) => index >= questions.length)) {
    throw new Error(`Topic ${topic.id} has an example index outside questions.csv`);
  }
}

const topicById = new Map(taxonomy.topics.map((topic) => [topic.id, {
  ...topic,
  count: 0,
  positionTotal: 0,
  position_bands: { q1_q5: 0, q6_q10: 0, q11_plus: 0 },
  question_positions: Object.fromEntries(Array.from({ length: 14 }, (_, index) => [String(index + 1), 0])),
  seasons: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), 0])),
  confidence_counts: { high: 0, medium: 0, low: 0 },
  question_indices: [],
}]));

for (const assignment of reviewed.assignments) {
  const topic = topicById.get(assignment.topic_id);
  if (!topic) throw new Error(`Unknown reviewed topic ${assignment.topic_id}`);
  const question = questions[assignment.row_index];
  const position = Number.parseInt(question.question_number, 10);
  const season = Number.parseInt(question.season, 10);
  topic.count += 1;
  topic.positionTotal += position;
  topic.question_indices.push(assignment.row_index);
  topic.question_positions[String(position)] = (topic.question_positions[String(position)] || 0) + 1;
  topic.seasons[String(season)] = (topic.seasons[String(season)] || 0) + 1;
  topic.confidence_counts[assignment.confidence] += 1;
  if (position <= 5) topic.position_bands.q1_q5 += 1;
  else if (position <= 10) topic.position_bands.q6_q10 += 1;
  else topic.position_bands.q11_plus += 1;
}

function chooseExamples(topic) {
  const assigned = new Set(topic.question_indices);
  const reviewedExamples = topic.example_indices.filter((index) => assigned.has(index));
  const selected = [...reviewedExamples];
  const usedSeasons = new Set(selected.map((index) => questions[index].season));
  for (const index of topic.question_indices) {
    const season = questions[index].season;
    if (selected.length >= 6) break;
    if (!usedSeasons.has(season)) {
      selected.push(index);
      usedSeasons.add(season);
    }
  }
  for (const index of topic.question_indices) {
    if (selected.length >= 6) break;
    if (!selected.includes(index)) selected.push(index);
  }
  return selected;
}

const topics = [...topicById.values()]
  .filter((topic) => topic.count > 0)
  .map((topic) => ({
    id: topic.id,
    broad_id: topic.broad_id,
    broad_sl: topic.broad_sl,
    broad_en: topic.broad_en,
    label_sl: publicTopicCopy(topic, "label_sl"),
    label_en: publicTopicCopy(topic, "label_en"),
    description_sl: publicTopicCopy(topic, "description_sl"),
    description_en: publicTopicCopy(topic, "description_en"),
    study_focus_sl: publicTopicCopy(topic, "study_focus_sl"),
    study_focus_en: publicTopicCopy(topic, "study_focus_en"),
    count: topic.count,
    share: topic.count / questions.length,
    average_question_position: topic.positionTotal / topic.count,
    position_bands: topic.position_bands,
    question_positions: topic.question_positions,
    seasons: topic.seasons,
    confidence_counts: topic.confidence_counts,
    question_indices: topic.question_indices,
    example_indices: chooseExamples(topic),
  }))
  .sort((a, b) => b.count - a.count || a.label_sl.localeCompare(b.label_sl, "sl"));

const output = {
  version: 3,
  source: "questions.csv",
  source_sha256: sourceHash,
  question_count: questions.length,
  method: "Every question was assigned through GPT semantic review of its complete Slovenian wording and all four answer options. Code only validates coverage and calculates totals.",
  taxonomy_version: taxonomy.version,
  taxonomy_sha256: taxonomyHash,
  taxonomy_topic_count: taxonomy.topics.length,
  reviewed_assignments_sha256: assignmentsHash,
  review_provenance_sha256: reviewProvenanceHash,
  override_replacement_count: overrideRows.size,
  active_topic_count: topics.length,
  topics,
};

const outputPath = path.join(catalogDir, "src/_data/generated/question-topics.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(path.relative(catalogDir, outputPath));
console.log(`${topics.length} active topics, ${questions.length} classified questions`);
