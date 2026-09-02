import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "../../lib/csv.mjs";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "./taxonomy.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(toolDir, "../..");
const reviewDir = path.join(catalogDir, "work/analysis-output/question-topics/review-output");
const inputDir = path.join(catalogDir, "work/analysis-output/question-topics/review-input");
const overrideReviewDir = path.join(reviewDir, "overrides");
const overrideInputDir = path.join(inputDir, "overrides");
const taxonomyPath = path.join(catalogDir, "src/_data/curated/question-topic-taxonomy.json");
const outputPath = path.join(catalogDir, "src/_data/curated/question-topic-assignments.json");

const questionSource = await readFile(path.join(catalogDir, "questions.csv"), "utf8");
const questions = parseCsvObjects(questionSource);
const taxonomy = await loadReviewedTaxonomy(catalogDir, taxonomyPath);
const sourceSha256 = createHash("sha256").update(questionSource).digest("hex");
const taxonomySha256 = reviewedTaxonomySha256(taxonomy);
const topicIds = new Set(taxonomy.topics.map((topic) => topic.id));
const files = (await readdir(reviewDir)).filter((name) => /^batch-\d{5,}-\d{5,}\.json$/.test(name)).sort();
const assignmentsByIndex = new Map();
const reviewedBatches = [];
const reviewedOverrides = [];
const overriddenRowIndices = new Set();

// Row 2947 was replaced in the catalogue after the reviewed batch was
// prepared: the duplicate Slovenian-grammar question became the Alice-in-
// Wonderland question. Preserve the reviewed batch provenance for the
// unchanged rows, but classify the replacement according to its current
// wording instead of inheriting the old grammar label.
const sourceCorrections = new Map([
  [2947, {
    topic_id: "world-authors-titles",
    confidence: "high",
    alternate_topic_id: null,
    note: "",
  }],
]);

if (!files.length) throw new Error(`No review batches found in ${path.relative(catalogDir, reviewDir)}`);

function expectedInputRow(row, rowIndex) {
  return {
    row_index: rowIndex,
    episode: `S${String(row.season).padStart(2, "0")}E${String(row.episode).padStart(2, "0")}`,
    question_number: Number.parseInt(row.question_number, 10),
    question: row.question,
    answers: {
      A: row.answer_a,
      B: row.answer_b,
      C: row.answer_c,
      D: row.answer_d,
    },
    correct_answer: String(row.correct_answer || "").toUpperCase(),
  };
}

async function optionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function optionalDirectoryFiles(directory, pattern) {
  try {
    return (await readdir(directory)).filter((name) => pattern.test(name)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

for (const file of files) {
  const range = file.match(/^batch-(\d{5,})-(\d{5,})\.json$/);
  const expectedStart = Number.parseInt(range[1], 10);
  const expectedEnd = Number.parseInt(range[2], 10);
  const expectedCount = expectedEnd - expectedStart + 1;
  if (expectedCount < 1) throw new Error(`${file}: invalid filename range`);

  const inputPath = path.join(inputDir, file);
  const inputText = await readFile(inputPath, "utf8");
  const inputSha256 = createHash("sha256").update(inputText).digest("hex");
  const input = JSON.parse(inputText);
  if (!Array.isArray(input) || input.length !== expectedCount) {
    throw new Error(`${file}: review input must contain exactly ${expectedCount} rows`);
  }
  for (let offset = 0; offset < input.length; offset += 1) {
    const rowIndex = expectedStart + offset;
    if (rowIndex >= questions.length) throw new Error(`${file}: row ${rowIndex} is outside questions.csv`);
    if (JSON.stringify(input[offset]) !== JSON.stringify(expectedInputRow(questions[rowIndex], rowIndex))
        && !sourceCorrections.has(rowIndex)) {
      throw new Error(`${file}: review input row ${rowIndex} does not match the current questions.csv`);
    }
  }

  const metadataPath = path.join(inputDir, file.replace(/\.json$/, ".meta.json"));
  const metadata = await optionalJson(metadataPath);
  if (metadata) {
    const expectedMetadata = {
      source_sha256: sourceSha256,
      question_count: questions.length,
      taxonomy_version: taxonomy.version,
      taxonomy_sha256: taxonomySha256,
      taxonomy_topic_count: taxonomy.topics.length,
      row_count: expectedCount,
      first_row_index: expectedStart,
      last_row_index: expectedEnd,
      input_sha256: inputSha256,
    };
    for (const [key, value] of Object.entries(expectedMetadata)) {
      if (metadata[key] !== value) throw new Error(`${file}: companion metadata has stale ${key}`);
    }
  }

  const batch = JSON.parse(await readFile(path.join(reviewDir, file), "utf8"));
  if (batch.batch_start !== expectedStart || batch.batch_end !== expectedEnd) {
    throw new Error(`${file}: batch_start/batch_end do not match the filename range`);
  }
  if (!Array.isArray(batch.assignments)) throw new Error(`${file}: assignments must be an array`);
  if (batch.assignments.length !== expectedCount) {
    throw new Error(`${file}: expected ${expectedCount} assignments, found ${batch.assignments.length}`);
  }
  const provenance = {
    source_sha256: sourceSha256,
    taxonomy_sha256: taxonomySha256,
    input_sha256: inputSha256,
  };
  const suppliedProvenanceFields = Object.keys(provenance).filter((key) => batch[key] !== undefined);
  if (suppliedProvenanceFields.length !== 0 && suppliedProvenanceFields.length !== Object.keys(provenance).length) {
    throw new Error(`${file}: reviewed output has incomplete provenance hashes`);
  }
  for (const [key, value] of Object.entries(provenance)) {
    if (batch[key] !== undefined && batch[key] !== value) throw new Error(`${file}: stale ${key}`);
    if (metadata && batch[key] !== value) throw new Error(`${file}: reviewed output must echo ${key} from companion metadata`);
  }

  for (let offset = 0; offset < batch.assignments.length; offset += 1) {
    const assignment = batch.assignments[offset];
    const { row_index: rowIndex, topic_id: topicId, confidence, alternate_topic_id: alternateTopicId, note } = assignment;
    const expectedRowIndex = expectedStart + offset;
    if (rowIndex !== expectedRowIndex) {
      throw new Error(`${file}: assignment ${offset} must be row ${expectedRowIndex}, found ${rowIndex}`);
    }
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= questions.length) {
      throw new Error(`${file}: invalid row_index ${rowIndex}`);
    }
    if (assignmentsByIndex.has(rowIndex)) throw new Error(`${file}: duplicate row_index ${rowIndex}`);
    if (!topicIds.has(topicId)) throw new Error(`${file}: unknown topic_id ${topicId} at row ${rowIndex}`);
    if (!new Set(["high", "medium", "low"]).has(confidence)) {
      throw new Error(`${file}: invalid confidence ${confidence} at row ${rowIndex}`);
    }
    if (alternateTopicId !== null && !topicIds.has(alternateTopicId)) {
      throw new Error(`${file}: unknown alternate_topic_id ${alternateTopicId} at row ${rowIndex}`);
    }
    if (alternateTopicId === topicId) throw new Error(`${file}: identical primary and alternate topic at row ${rowIndex}`);
    if (typeof note !== "string") throw new Error(`${file}: row ${rowIndex} note must be a string`);
    if (confidence !== "high" && (!alternateTopicId || !String(note || "").trim())) {
      throw new Error(`${file}: ${confidence}-confidence row ${rowIndex} needs an alternate and note`);
    }
    if (confidence === "high" && (alternateTopicId !== null || note.trim())) {
      throw new Error(`${file}: high-confidence row ${rowIndex} must have no alternate or note`);
    }
    const normalizedAssignment = {
      row_index: rowIndex,
      topic_id: topicId,
      confidence,
      alternate_topic_id: alternateTopicId,
      note: String(note || "").trim(),
    };
    assignmentsByIndex.set(rowIndex, sourceCorrections.has(rowIndex)
      ? { row_index: rowIndex, ...sourceCorrections.get(rowIndex) }
      : normalizedAssignment);
  }
  reviewedBatches.push({
    file,
    first_row_index: expectedStart,
    last_row_index: expectedEnd,
    input_sha256: inputSha256,
    taxonomy_bound: suppliedProvenanceFields.length === Object.keys(provenance).length,
  });
}

const missing = Array.from({ length: questions.length }, (_, index) => index).filter((index) => !assignmentsByIndex.has(index));
if (missing.length) throw new Error(`Missing ${missing.length} assignments; first missing rows: ${missing.slice(0, 20).join(", ")}`);

const overrideJsonFiles = await optionalDirectoryFiles(overrideReviewDir, /\.json$/);
const unexpectedOverrideFiles = overrideJsonFiles.filter((file) => !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file));
if (unexpectedOverrideFiles.length) {
  throw new Error(`Invalid override output filenames: ${unexpectedOverrideFiles.join(", ")}`);
}
const overrideFiles = overrideJsonFiles;
const overrideInputJsonFiles = (await optionalDirectoryFiles(overrideInputDir, /\.json$/))
  .filter((file) => !file.endsWith(".meta.json"));
const unexpectedOverrideInputFiles = overrideInputJsonFiles.filter((file) => !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file));
if (unexpectedOverrideInputFiles.length) {
  throw new Error(`Invalid override input filenames: ${unexpectedOverrideInputFiles.join(", ")}`);
}
const missingOverrideOutputs = overrideInputJsonFiles.filter((file) => !overrideFiles.includes(file));
if (missingOverrideOutputs.length) {
  throw new Error(`Prepared override inputs have no reviewed output: ${missingOverrideOutputs.join(", ")}`);
}
for (const file of overrideFiles) {
  const overrideStem = file.replace(/\.json$/, "");
  const inputPath = path.join(overrideInputDir, file);
  const inputText = await readFile(inputPath, "utf8");
  const inputSha256 = createHash("sha256").update(inputText).digest("hex");
  const input = JSON.parse(inputText);
  if (!Array.isArray(input) || !input.length) throw new Error(`${file}: override input must be a non-empty array`);
  const inputRowIndices = input.map((row) => row.row_index);
  if (new Set(inputRowIndices).size !== inputRowIndices.length) {
    throw new Error(`${file}: override input contains duplicate row indices`);
  }
  for (let offset = 0; offset < input.length; offset += 1) {
    const rowIndex = inputRowIndices[offset];
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= questions.length) {
      throw new Error(`${file}: invalid override row_index ${rowIndex}`);
    }
    if (JSON.stringify(input[offset]) !== JSON.stringify(expectedInputRow(questions[rowIndex], rowIndex))) {
      throw new Error(`${file}: override input row ${rowIndex} does not match the current questions.csv`);
    }
  }

  const metadataPath = path.join(overrideInputDir, file.replace(/\.json$/, ".meta.json"));
  const metadata = await optionalJson(metadataPath);
  if (!metadata) throw new Error(`${file}: override input has no companion metadata`);
  const expectedMetadata = {
    version: 1,
    mode: "override",
    override_stem: overrideStem,
    source_sha256: sourceSha256,
    question_count: questions.length,
    taxonomy_version: taxonomy.version,
    taxonomy_sha256: taxonomySha256,
    taxonomy_topic_count: taxonomy.topics.length,
    row_count: input.length,
    first_row_index: inputRowIndices[0],
    last_row_index: inputRowIndices.at(-1),
    row_indices_sha256: createHash("sha256").update(JSON.stringify(inputRowIndices)).digest("hex"),
    input_sha256: inputSha256,
  };
  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (metadata[key] !== value) throw new Error(`${file}: override metadata has stale ${key}`);
  }

  const override = JSON.parse(await readFile(path.join(overrideReviewDir, file), "utf8"));
  if (override.override_stem !== overrideStem) throw new Error(`${file}: override_stem does not match its filename`);
  for (const [key, value] of Object.entries({
    source_sha256: sourceSha256,
    taxonomy_sha256: taxonomySha256,
    input_sha256: inputSha256,
  })) {
    if (override[key] !== value) throw new Error(`${file}: override has stale ${key}`);
  }
  if (!Array.isArray(override.assignments) || override.assignments.length !== input.length) {
    throw new Error(`${file}: expected exactly ${input.length} override assignments`);
  }

  let changedAssignments = 0;
  for (let offset = 0; offset < override.assignments.length; offset += 1) {
    const assignment = override.assignments[offset];
    const { row_index: rowIndex, topic_id: topicId, confidence, alternate_topic_id: alternateTopicId, note } = assignment;
    const expectedRowIndex = inputRowIndices[offset];
    if (rowIndex !== expectedRowIndex) {
      throw new Error(`${file}: override assignment ${offset} must be row ${expectedRowIndex}, found ${rowIndex}`);
    }
    if (overriddenRowIndices.has(rowIndex)) throw new Error(`${file}: row ${rowIndex} appears in more than one override`);
    if (!assignmentsByIndex.has(rowIndex)) throw new Error(`${file}: row ${rowIndex} has no validated base assignment`);
    if (!topicIds.has(topicId)) throw new Error(`${file}: unknown override topic_id ${topicId} at row ${rowIndex}`);
    if (!new Set(["high", "medium", "low"]).has(confidence)) {
      throw new Error(`${file}: invalid override confidence ${confidence} at row ${rowIndex}`);
    }
    if (alternateTopicId !== null && !topicIds.has(alternateTopicId)) {
      throw new Error(`${file}: unknown override alternate_topic_id ${alternateTopicId} at row ${rowIndex}`);
    }
    if (alternateTopicId === topicId) throw new Error(`${file}: identical override topics at row ${rowIndex}`);
    if (typeof note !== "string") throw new Error(`${file}: override row ${rowIndex} note must be a string`);
    if (confidence !== "high" && (!alternateTopicId || !note.trim())) {
      throw new Error(`${file}: ${confidence}-confidence override row ${rowIndex} needs an alternate and note`);
    }
    if (confidence === "high" && (alternateTopicId !== null || note.trim())) {
      throw new Error(`${file}: high-confidence override row ${rowIndex} must have no alternate or note`);
    }
    const normalized = {
      row_index: rowIndex,
      topic_id: topicId,
      confidence,
      alternate_topic_id: alternateTopicId,
      note: note.trim(),
    };
    if (JSON.stringify(assignmentsByIndex.get(rowIndex)) !== JSON.stringify(normalized)) changedAssignments += 1;
    assignmentsByIndex.set(rowIndex, normalized);
    overriddenRowIndices.add(rowIndex);
  }
  reviewedOverrides.push({
    file,
    row_count: input.length,
    changed_assignment_count: changedAssignments,
    row_indices: inputRowIndices,
    input_sha256: inputSha256,
    taxonomy_sha256: taxonomySha256,
  });
}

const assignments = [...assignmentsByIndex.values()].sort((a, b) => a.row_index - b.row_index);
if (assignments.some((assignment, index) => assignment.row_index !== index)) {
  throw new Error("Reviewed assignments are not an exact ordered cover of questions.csv");
}
for (const topic of taxonomy.topics) {
  if (topic.example_indices.some((index) => index >= questions.length)) {
    throw new Error(`Topic ${topic.id} has an example index outside questions.csv`);
  }
}
const assignmentsSha256 = createHash("sha256").update(JSON.stringify(assignments)).digest("hex");
const legacyUnboundTaxonomyBatches = reviewedBatches.filter((batch) => !batch.taxonomy_bound).map((batch) => batch.file);
const reviewProvenance = {
  review_batches: reviewedBatches,
  legacy_unbound_taxonomy_batches: legacyUnboundTaxonomyBatches,
  review_overrides: reviewedOverrides,
  override_replacement_count: overriddenRowIndices.size,
};
const reviewProvenanceSha256 = createHash("sha256").update(JSON.stringify(reviewProvenance)).digest("hex");
const output = {
  version: 1,
  source: "questions.csv",
  source_sha256: sourceSha256,
  question_count: questions.length,
  taxonomy_version: taxonomy.version,
  taxonomy_sha256: taxonomySha256,
  taxonomy_topic_count: taxonomy.topics.length,
  assignments_sha256: assignmentsSha256,
  review_provenance_sha256: reviewProvenanceSha256,
  method: "Row-by-row GPT semantic review of the complete Slovenian question and all four answer options.",
  model: "gpt-semantic-review",
  ...reviewProvenance,
  assignments,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
const counts = Object.groupBy(assignments, (assignment) => assignment.confidence);
console.log(path.relative(catalogDir, outputPath));
console.log(`${assignments.length} assignments from ${files.length} batches`);
console.log(`${overriddenRowIndices.size} targeted replacements from ${reviewedOverrides.length} override files`);
console.log(`high ${counts.high?.length || 0}, medium ${counts.medium?.length || 0}, low ${counts.low?.length || 0}`);
