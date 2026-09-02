import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "../lib/csv.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(scriptDir, "..");
const auditDir = path.join(catalogDir, "audit");
const questionLedgerPath = path.join(auditDir, "question-audit.json");
const contestantLedgerPath = path.join(auditDir, "contestant-audit.json");

async function readCsv(name) {
  return parseCsvObjects(await readFile(path.join(catalogDir, name), "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function split(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

const NO_GREEN_NOTE = /(?:no[- ]green|no green|no stable green|no settled green|does not render (?:a )?(?:stable )?green|no rendered green|no green-correct state|no green reveal|green state.*(?:not|never)|broadcast does not show.*green)/i;

function episodeKey(row) {
  return `s${String(Number(row.season)).padStart(2, "0")}e${String(Number(row.episode)).padStart(2, "0")}`;
}

function parseEntrants(value) {
  return split(value).map((display, index) => {
    const match = display.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    return {
      index,
      display,
      name: (match ? match[1] : display).trim(),
      location: match ? match[2].trim() : "",
    };
  });
}

function questionKey(row, rowIndex) {
  return `${episodeKey(row)}:${String(row.contestant_name || "").trim()}:q${String(Number(row.question_number)).padStart(2, "0")}:${rowIndex}`;
}

function contestantAppearanceKey(row, rowIndex, entrantIndex) {
  return `${episodeKey(row)}:${rowIndex}:${entrantIndex}`;
}

function profileKey(name, season, episode) {
  return `${episodeKey({ season, episode })}:${name}`;
}

function preserve(previous, key, defaults) {
  const prior = previous?.entries?.find((entry) => entry.key === key);
  return prior ? { ...defaults, ...prior, key } : { ...defaults, key };
}

const [questions, contestants] = await Promise.all([
  readCsv("questions.csv"),
  readCsv("contestants.csv"),
]);
const [previousQuestions, previousContestants] = await Promise.all([
  readJsonIfPresent(questionLedgerPath),
  readJsonIfPresent(contestantLedgerPath),
]);

const questionEntries = questions.map((row, rowIndex) => {
  const noteDisqualifiesGreen = NO_GREEN_NOTE.test(String(row.notes || ""));
  const entry = preserve(previousQuestions, String(rowIndex), {
    type: "question",
    rowIndex,
    season: Number(row.season),
    episode: Number(row.episode),
    episodeKey: episodeKey(row),
    contestantName: String(row.contestant_name || "").trim(),
    questionNumber: Number(row.question_number),
    sourceTimestamps: split(row.source_timestamp),
    candidates: split(row.evidence_frame),
    lifelines: split(row.lifelines_used),
    primary: null,
    supplemental: [],
    status: "pending",
    greenSettled: false,
    noGreenException: false,
    allFourVisible: false,
    fiftyFiftyException: false,
    review: "",
  });
  // Historical no-green exceptions are deliberately not durable publish
  // states. Rebuilding the ledger must leave every question pending until a
  // strict native green reveal has been recorded by the repair workflow.
  if (entry.noGreenException === true || noteDisqualifiesGreen) {
    entry.noGreenException = false;
    entry.greenSettled = false;
    entry.primary = null;
    entry.supplemental = [];
    entry.status = "pending";
    entry.review = "Strict native-source scan has not yet recovered a sharp settled green-correct answer reveal; this row is not publishable.";
  }
  return entry;
});

const appearanceEntries = [];
const profileDefaults = new Map();
for (const [rowIndex, row] of contestants.entries()) {
  const key = episodeKey(row);
  const entrants = parseEntrants(row.fast_fingers_contestants);
  for (const entrant of entrants) {
    const appearanceKey = contestantAppearanceKey(row, rowIndex, entrant.index);
    appearanceEntries.push(preserve(previousContestants, appearanceKey, {
      type: "appearance",
      key: appearanceKey,
      rowIndex,
      entrantIndex: entrant.index,
      season: Number(row.season),
      episode: Number(row.episode),
      episodeKey: key,
      name: entrant.name,
      location: entrant.location,
      candidates: split(row.evidence_frame),
      primary: null,
      status: "pending",
      nameVisible: false,
      locationVisible: false,
      sharpSettled: false,
      review: "",
    }));
    const pKey = profileKey(entrant.name, row.season, row.episode);
    if (!profileDefaults.has(pKey)) profileDefaults.set(pKey, {
      type: "profile",
      key: pKey,
      name: entrant.name,
      season: Number(row.season),
      episode: Number(row.episode),
      episodeKey: key,
      locations: [],
      primary: null,
      status: "pending",
      nameVisible: false,
      locationVisible: false,
      sharpSettled: false,
      review: "",
    });
    const profile = profileDefaults.get(pKey);
    if (entrant.location && !profile.locations.includes(entrant.location)) profile.locations.push(entrant.location);
  }
  for (const name of [row.fast_fingers_winner, row.millionaire_contestant].map((value) => String(value || "").trim()).filter(Boolean)) {
    const pKey = profileKey(name, row.season, row.episode);
    if (!profileDefaults.has(pKey)) profileDefaults.set(pKey, {
      type: "profile",
      key: pKey,
      name,
      season: Number(row.season),
      episode: Number(row.episode),
      episodeKey: key,
      locations: [],
      primary: null,
      status: "pending",
      nameVisible: false,
      locationVisible: false,
      sharpSettled: false,
      review: "",
    });
  }
}

const profileEntries = [...profileDefaults.values()].map((defaults) => preserve(previousContestants, defaults.key, defaults));
await mkdir(auditDir, { recursive: true });
await writeFile(questionLedgerPath, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries: questionEntries }, null, 2)}\n`);
await writeFile(contestantLedgerPath, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries: [...appearanceEntries, ...profileEntries] }, null, 2)}\n`);

console.log(`Audit ledgers refreshed: ${questionEntries.length} questions, ${appearanceEntries.length} contestant appearances, ${profileEntries.length} profile appearances.`);
