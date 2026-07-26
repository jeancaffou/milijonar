import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "../../lib/csv.mjs";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "./taxonomy.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(toolDir, "../..");
const outputDir = path.join(catalogDir, "work/analysis-output/question-topics/review-input");
const overrideOutputDir = path.join(outputDir, "overrides");
const overrideReviewOutputDir = path.join(catalogDir, "work/analysis-output/question-topics/review-output/overrides");
const safeOutputStem = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function integer(value, fallback) {
  if (!/^\d+$/.test(String(value ?? ""))) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const mode = process.argv[2] || "batch";
const questionSource = await readFile(path.join(catalogDir, "questions.csv"), "utf8");
const rows = parseCsvObjects(questionSource);
const taxonomy = await loadReviewedTaxonomy(catalogDir);
const sourceSha256 = createHash("sha256").update(questionSource).digest("hex");
const taxonomySha256 = reviewedTaxonomySha256(taxonomy);
let selected;
let outputName;
let selectedOutputDir = outputDir;
let extraMetadata = {};

if (mode === "sample") {
  const offset = integer(process.argv[3], 0);
  const stride = Math.max(1, integer(process.argv[4], 16));
  const limit = Math.max(1, integer(process.argv[5], 600));
  selected = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => rowIndex % stride === offset % stride)
    .slice(0, limit);
  outputName = `sample-o${offset}-s${stride}-n${selected.length}.json`;
} else if (mode === "batch") {
  const start = integer(process.argv[3], 0);
  const size = Math.max(1, integer(process.argv[4], 300));
  selected = rows.slice(start, start + size).map((row, localIndex) => ({ row, rowIndex: start + localIndex }));
  outputName = `batch-${String(start).padStart(5, "0")}-${String(start + selected.length - 1).padStart(5, "0")}.json`;
} else if (mode === "all") {
  const size = Math.max(1, integer(process.argv[3], 400));
  await mkdir(outputDir, { recursive: true });
  for (let start = 0; start < rows.length; start += size) {
    const batch = rows.slice(start, start + size).map((row, localIndex) => ({ row, rowIndex: start + localIndex }));
    const compact = compactRowsFor(batch);
    const name = `batch-${String(start).padStart(5, "0")}-${String(start + compact.length - 1).padStart(5, "0")}.json`;
    await writeReviewInput(outputDir, name, compact, "batch");
  }
  console.log(`${Math.ceil(rows.length / size)} batches`);
  console.log(`${rows.length} questions`);
  process.exit(0);
} else if (mode === "override") {
  const indexListArgument = process.argv[3];
  const outputStem = String(process.argv[4] || "");
  if (!indexListArgument || !safeOutputStem.test(outputStem)) {
    throw new Error("Override mode requires an explicit JSON index array or file path and a lowercase hyphenated output stem");
  }
  const inlineIndexList = String(indexListArgument).trim().startsWith("[");
  const indexListPath = inlineIndexList ? "" : path.resolve(catalogDir, indexListArgument);
  const rowIndices = JSON.parse(inlineIndexList
    ? indexListArgument
    : await readFile(indexListPath, "utf8"));
  if (!Array.isArray(rowIndices) || !rowIndices.length) {
    throw new Error("Override row-index input must be a non-empty JSON array");
  }
  if (rowIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= rows.length)) {
    throw new Error(`Override row indices must be unique integers from 0 through ${rows.length - 1}`);
  }
  if (new Set(rowIndices).size !== rowIndices.length) {
    throw new Error("Override row-index input contains duplicates");
  }
  selected = rowIndices.map((rowIndex) => ({ row: rows[rowIndex], rowIndex }));
  outputName = `${outputStem}.json`;
  selectedOutputDir = overrideOutputDir;
  extraMetadata = {
    override_stem: outputStem,
    explicit_index_source: inlineIndexList ? "inline-json" : path.basename(indexListPath),
  };
} else {
  throw new Error(`Unknown mode: ${mode}. Use sample, batch, all, or override.`);
}

function compactRowsFor(items) {
  return items.map(({ row, rowIndex }) => ({
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
  }));
}

async function writeReviewInput(directory, name, compact, inputMode, metadataExtension = {}) {
  if (!compact.length) throw new Error(`${name}: review input cannot be empty`);
  const inputText = `${JSON.stringify(compact, null, 2)}\n`;
  const rowIndices = compact.map((row) => row.row_index);
  const metadata = {
    version: 1,
    mode: inputMode,
    source: "questions.csv",
    source_sha256: sourceSha256,
    question_count: rows.length,
    taxonomy_version: taxonomy.version,
    taxonomy_sha256: taxonomySha256,
    taxonomy_topic_count: taxonomy.topics.length,
    row_count: compact.length,
    first_row_index: compact[0].row_index,
    last_row_index: compact.at(-1).row_index,
    row_indices_sha256: createHash("sha256").update(JSON.stringify(rowIndices)).digest("hex"),
    input_sha256: createHash("sha256").update(inputText).digest("hex"),
    ...metadataExtension,
  };
  const metadataName = name.replace(/\.json$/, ".meta.json");
  await Promise.all([
    writeFile(path.join(directory, name), inputText, "utf8"),
    writeFile(path.join(directory, metadataName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
  ]);
}

const compactRows = compactRowsFor(selected);

await mkdir(selectedOutputDir, { recursive: true });
if (mode === "override") await mkdir(overrideReviewOutputDir, { recursive: true });
const outputPath = path.join(selectedOutputDir, outputName);
await writeReviewInput(selectedOutputDir, outputName, compactRows, mode, extraMetadata);
console.log(path.relative(catalogDir, outputPath));
console.log(`${compactRows.length} questions`);
