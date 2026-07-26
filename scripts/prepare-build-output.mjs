import { copyFile, link, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicEvidenceParts } from "../lib/catalog-utils.mjs";
import { parseCsvObjects } from "../lib/csv.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(scriptDir, "..");
const outputDir = path.join(catalogDir, "_site");

async function readEvidencePaths(csvName) {
  const text = await readFile(path.join(catalogDir, csvName), "utf8");
  const rows = parseCsvObjects(text);
  return rows.flatMap((row) =>
    String(row.evidence_frame || "")
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item.startsWith("work/") && item.toLowerCase().endsWith(".jpg")),
  );
}

async function allEvidencePaths() {
  return [...new Set([
    ...(await readEvidencePaths("questions.csv")),
    ...(await readEvidencePaths("contestants.csv")),
  ])].sort();
}

async function mapLimit(items, limit, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

function evidenceDestination(relativePath) {
  const parts = publicEvidenceParts(relativePath);
  if (!parts) throw new Error(`Rejected evidence path: ${relativePath}`);
  const source = path.resolve(catalogDir, relativePath);
  const workRoot = `${path.resolve(catalogDir, "work")}${path.sep}`;
  if (!source.startsWith(workRoot)) throw new Error(`Evidence path escapes work/: ${relativePath}`);
  return {
    source,
    destination: path.join(outputDir, "assets", "evidence", parts.episode, parts.nestedPath),
  };
}

async function linkEvidence() {
  await mkdir(path.join(outputDir, "assets", "evidence"), { recursive: true });
  const paths = await allEvidencePaths();
  await mapLimit(paths, 48, async (relativePath) => {
    const { source, destination } = evidenceDestination(relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await link(source, destination);
    } catch (error) {
      // Normal incremental/serve builds revisit the same immutable public
      // evidence path. The clean production build removes the whole output
      // tree first; an existing hardlink can therefore be retained safely.
      if (error.code !== "EEXIST") throw error;
    }
  });
}

async function materializeEvidence() {
  await mkdir(path.join(outputDir, "assets", "evidence"), { recursive: true });
  const paths = await allEvidencePaths();
  await mapLimit(paths, 16, async (relativePath) => {
    const { source, destination } = evidenceDestination(relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  });
}

async function copyPublicSources() {
  const destination = path.join(outputDir, "data");
  await mkdir(destination, { recursive: true });
  await Promise.all([
    copyFile(path.join(catalogDir, "questions.csv"), path.join(destination, "questions.csv")),
    copyFile(path.join(catalogDir, "contestants.csv"), path.join(destination, "contestants.csv")),
  ]);
}

export async function prepareBuildOutput({ portableEvidence = false } = {}) {
  await copyPublicSources();
  if (portableEvidence) await materializeEvidence();
  else await linkEvidence();
}

if (process.argv.includes("--portable")) {
  await prepareBuildOutput({ portableEvidence: true });
}
