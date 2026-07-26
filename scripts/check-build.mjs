import {
  lstat,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteBase } from "../lib/site-path.mjs";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "../tools/question-topic-review/taxonomy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(scriptDir, "..");
const outputDir = path.join(catalogDir, "_site");
const errors = [];
const internalTargets = new Set();
const evidenceTargets = new Set();
const sourceMediaFilename = /(?:Milijonar(?:\.|%2e)S\d{2}E\d{2}[^\s"'<>]*)|(?:\.(?:mp4|mkv|avi|mov|srt|vtt)(?:\b|%))/i;
const markdownReference = /(?:^|[\s"'(<])[^\s"'<>]*\.(?:md|markdown)(?=$|[\s"')>])/i;
const rejectedPublicCopy = /\bevidence\b|\bline-?ups?\b|\bdokaz[\p{L}]*|\bpostava\b|\bpostave\b|\bpostavo\b|\bpostavah\b|\bpostavami\b/iu;
const expectedTopicMethod = "Every question was assigned through GPT semantic review of its complete Slovenian wording and all four answer options. Code only validates coverage and calculates totals.";

function fail(message) {
  errors.push(message);
}

async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(root, extension) {
  const found = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (!extension || entry.name.endsWith(extension)) found.push(entryPath);
    }
  }
  return found.sort();
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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
  return rows;
}

function routeFile(route) {
  return path.join(outputDir, route, "index.html");
}

function publicPathForHtml(filePath) {
  const relative = path.relative(outputDir, filePath).split(path.sep).join("/");
  return `${siteBase}/${relative.replace(/index\.html$/, "")}`;
}

function deployedPath(pathname) {
  return `${siteBase}${pathname}`;
}

function extractAttributes(html, attribute) {
  const values = [];
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi");
  let match;
  while ((match = pattern.exec(html))) values.push((match[1] ?? match[2] ?? match[3] ?? "").replaceAll("&amp;", "&"));
  return values;
}

function publicCopyForAudit(html) {
  const withoutRecordText = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<article\b[^>]*class=["'][^"']*\bquestion-board\b[^"']*["'][\s\S]*?<\/article>/gi, " ")
    .replace(/<span\b[^>]*class=["'][^"']*\bquestion-list__answers\b[^"']*["'][\s\S]*?<small\b[^>]*class=["'][^"']*\bquestion-list__correct\b[^"']*["'][\s\S]*?<\/small>/gi, " ")
    .replace(/<span\b[^>]*class=["'][^"']*\bquestion-list__copy\b[^"']*["'][\s\S]*?<\/span>/gi, " ")
    .replace(/<ol\b[^>]*class=["'][^"']*\bposition-question-list\b[^"']*["'][\s\S]*?<\/ol>/gi, " ")
    .replace(/<ol\b[^>]*class=["'][^"']*\btopic-question-list\b[^"']*["'][\s\S]*?<\/ol>/gi, " ")
    .replace(/<section\b[^>]*class=["'][^"']*\brepeated-questions\b[^"']*["'][\s\S]*?<\/section>/gi, " ")
    .replace(/<section\b[^>]*class=["'][^"']*\brecent-questions\b[^"']*["'][\s\S]*?<\/section>/gi, " ");
  const visibleText = withoutRecordText.replace(/<[^>]+>/g, " ");
  const accessibleCopy = [
    ...extractAttributes(withoutRecordText, "alt"),
    ...extractAttributes(withoutRecordText, "aria-label"),
    ...(withoutRecordText.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/gi) || [])
      .flatMap((tag) => extractAttributes(tag, "content")),
  ].join(" ");
  return `${visibleText} ${accessibleCopy}`;
}

function targetFromUrl(rawValue, sourceFile) {
  const value = rawValue.trim();
  if (!value || value.startsWith("#")) return null;
  let url;
  try {
    const sourceUrl = new URL(publicPathForHtml(sourceFile), "https://catalog.invalid");
    url = new URL(value, sourceUrl);
  } catch {
    fail(`${path.relative(outputDir, sourceFile)} has an invalid URL: ${value}`);
    return null;
  }
  if (url.origin !== "https://catalog.invalid") return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    fail(`${path.relative(outputDir, sourceFile)} has malformed URL encoding: ${value}`);
    return null;
  }
  if (siteBase && pathname !== siteBase && !pathname.startsWith(`${siteBase}/`)) {
    fail(`${path.relative(outputDir, sourceFile)} has an internal URL outside the configured base path: ${value}`);
    return null;
  }
  const outputPathname = siteBase ? pathname.slice(siteBase.length) || "/" : pathname;
  const resolved = path.resolve(outputDir, `.${outputPathname}`);
  if (resolved !== outputDir && !resolved.startsWith(`${outputDir}${path.sep}`)) {
    fail(`${path.relative(outputDir, sourceFile)} links outside the build: ${value}`);
    return null;
  }
  return { pathname: outputPathname, resolved };
}

async function assertCoreRoutes() {
  const routes = [
    "",
    "seasons",
    "episodes",
    "questions",
    "topics",
    "contestants",
    "runs",
    "statistics",
    "search",
    "statistics/answer-patterns",
  ];
  for (const language of ["sl", "en"]) {
    for (const route of routes) {
      const filePath = routeFile(path.join(language, route));
      if (!(await exists(filePath))) fail(`Missing core route: /${language}/${route ? `${route}/` : ""}`);
      else {
        const html = await readFile(filePath, "utf8");
        if (!new RegExp(`<html\\s+lang=["']${language}["']`, "i").test(html)) {
          fail(`Wrong or missing language on /${language}/${route ? `${route}/` : ""}`);
        }
        if (!html.includes('class="site-footer"')) {
          fail(`Missing shared footer on /${language}/${route ? `${route}/` : ""}`);
        }
        for (const required of [
          '<a class="footer-author" href="https://github.com/jeancaffou"',
          '<a href="https://github.com/jeancaffou/milijonar"',
          "@jeancaffou",
        ]) {
          if (!html.includes(required)) {
            fail(`Shared footer is missing ${required} on /${language}/${route ? `${route}/` : ""}`);
          }
        }
      }
    }
    if (await exists(routeFile(path.join(language, "data")))) {
      fail(`Removed standalone data route still exists: /${language}/data/`);
    }
  }
  for (const name of ["index.html", "404.html"]) {
    const filePath = path.join(outputDir, name);
    if (!(await exists(filePath))) {
      fail(`Missing /${name}`);
      continue;
    }
    if (name === "404.html") {
      const html = await readFile(filePath, "utf8");
      if (!html.includes('class="site-header"') || !html.includes('class="site-footer"')) {
        fail("404 page is outside the shared catalogue shell");
      }
    }
  }
}

async function assertPageCountsAndSamples() {
  const indexPath = path.join(outputDir, "assets", "search-index.json");
  if (!(await exists(indexPath))) {
    fail("Missing /assets/search-index.json");
    return { records: [] };
  }

  let payload;
  try {
    payload = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    fail(`Invalid search index JSON: ${error.message}`);
    return { records: [] };
  }
  if (!Array.isArray(payload.records)) {
    fail("Search index does not contain a records array");
    return { records: [] };
  }

  const questionsCsvText = await readFile(path.join(catalogDir, "questions.csv"), "utf8");
  const questionsCsv = parseCsv(questionsCsvText);
  const contestantsCsv = parseCsv(await readFile(path.join(catalogDir, "contestants.csv"), "utf8"));
  const questionRows = Math.max(0, questionsCsv.length - 1);
  const questionRecords = payload.records.filter((record) => record.type === "question");
  if (questionRecords.length !== questionRows) {
    fail(`Question index count ${questionRecords.length} does not match questions.csv rows ${questionRows}`);
  }
  const runIds = new Set();
  for (const record of questionRecords) {
    if (record.titleEn) fail(`Question search record ${record.id} contains a translated title`);
    if (!record.runId || !record.anchor) {
      fail(`Question search record ${record.id} has no run target`);
      continue;
    }
    const expectedTarget = `runs/${record.runId}/#${record.anchor}`;
    if (record.target !== expectedTarget) {
      fail(`Question search record ${record.id} has malformed target ${record.target}`);
    }
    if (record.anchor !== `q-${record.id}`) {
      fail(`Question search record ${record.id} has unstable anchor ${record.anchor}`);
    }
    runIds.add(record.runId);
  }

  const topicPath = path.join(catalogDir, "src", "_data", "generated", "question-topics.json");
  let topicPayload;
  try {
    topicPayload = JSON.parse(await readFile(topicPath, "utf8"));
  } catch (error) {
    fail(`Invalid generated question-topic JSON: ${error.message}`);
    topicPayload = { topics: [] };
  }
  const topics = Array.isArray(topicPayload.topics) ? topicPayload.topics : [];
  const reviewedTaxonomy = await loadReviewedTaxonomy(catalogDir);
  const expectedTaxonomyHash = reviewedTaxonomySha256(reviewedTaxonomy);
  if (topicPayload.version !== 3) fail(`Question-topic output has unsupported version ${topicPayload.version}`);
  if (topicPayload.method !== expectedTopicMethod) fail("Question-topic output does not declare the GPT semantic-review method");
  if (topicPayload.taxonomy_version !== reviewedTaxonomy.version
      || topicPayload.taxonomy_sha256 !== expectedTaxonomyHash
      || topicPayload.taxonomy_topic_count !== reviewedTaxonomy.topics.length) {
    fail("Generated question-topic data does not match the current reviewed taxonomy");
  }
  if (topicPayload.active_topic_count !== topics.length) {
    fail(`Question-topic active count ${topicPayload.active_topic_count} does not match ${topics.length} published topics`);
  }
  const reviewedAssignmentPath = path.join(catalogDir, "src", "_data", "curated", "question-topic-assignments.json");
  try {
    const reviewedAssignments = JSON.parse(await readFile(reviewedAssignmentPath, "utf8"));
    const actualAssignmentsHash = createHash("sha256").update(JSON.stringify(reviewedAssignments.assignments)).digest("hex");
    const actualProvenanceHash = createHash("sha256").update(JSON.stringify({
      review_batches: reviewedAssignments.review_batches,
      legacy_unbound_taxonomy_batches: reviewedAssignments.legacy_unbound_taxonomy_batches,
      review_overrides: reviewedAssignments.review_overrides,
      override_replacement_count: reviewedAssignments.override_replacement_count,
    })).digest("hex");
    if (reviewedAssignments.assignments_sha256 !== actualAssignmentsHash
        || topicPayload.reviewed_assignments_sha256 !== actualAssignmentsHash) {
      fail("Generated question-topic data does not match the merged GPT assignments");
    }
    if (reviewedAssignments.review_provenance_sha256 !== actualProvenanceHash
        || topicPayload.review_provenance_sha256 !== actualProvenanceHash
        || topicPayload.override_replacement_count !== reviewedAssignments.override_replacement_count) {
      fail("Generated question-topic data does not match the targeted adjudication provenance");
    }
  } catch (error) {
    fail(`Invalid merged question-topic assignments: ${error.message}`);
  }
  const topicIds = new Set();
  const assignedIndices = [];
  for (const topic of topics) {
    if (!topic?.id || topicIds.has(topic.id)) fail(`Missing or duplicate topic ID: ${topic?.id || "(blank)"}`);
    topicIds.add(topic?.id);
    for (const key of ["broad_id", "broad_sl", "broad_en", "label_sl", "label_en", "description_sl", "description_en"]) {
      if (!String(topic?.[key] || "").trim()) fail(`Topic ${topic?.id || "(blank)"} has no ${key}`);
    }
    if (!Array.isArray(topic?.question_indices)) {
      fail(`Topic ${topic?.id || "(blank)"} has no question_indices array`);
      continue;
    }
    if (topic.count !== topic.question_indices.length) {
      fail(`Topic ${topic.id} count ${topic.count} does not match ${topic.question_indices.length} assigned indices`);
    }
    assignedIndices.push(...topic.question_indices);
  }
  const expectedSourceHash = createHash("sha256").update(questionsCsvText).digest("hex");
  if (topicPayload.source_sha256 !== expectedSourceHash) {
    fail("Generated question-topic data does not match the current questions.csv");
  }
  if (topicPayload.question_count !== questionRows) {
    fail(`Question-topic total ${topicPayload.question_count} does not match questions.csv rows ${questionRows}`);
  }
  const sortedIndices = assignedIndices.toSorted((a, b) => a - b);
  if (sortedIndices.length !== questionRows || sortedIndices.some((value, index) => value !== index)) {
    fail("Question-topic assignments do not cover every question exactly once");
  }
  const forbiddenBroadTopicIds = new Set(["general-knowledge", "everyday-general", "football", "music", "film", "literature", "history", "geography", "sport", "science"]);
  const broadNavigationIds = new Set(topics.map((topic) => topic.broad_id));
  for (const topic of topics) {
    if (forbiddenBroadTopicIds.has(topic.id)) fail(`Topic ${topic.id} is too broad for the preparation ranking`);
    if (topic.id === topic.broad_id || broadNavigationIds.has(topic.id)) {
      fail(`Topic ${topic.id} is a broad navigation domain, not a specific preparation topic`);
    }
    for (const key of ["study_focus_sl", "study_focus_en"]) {
      if (!String(topic?.[key] || "").trim()) fail(`Topic ${topic.id} has no ${key}`);
    }
  }
  const specificTopics = topics;
  for (let index = 1; index < specificTopics.length; index += 1) {
    if (specificTopics[index - 1].count < specificTopics[index].count) {
      fail(`Topic ranking is not descending at ${specificTopics[index - 1].id} / ${specificTopics[index].id}`);
    }
  }
  const topicRecords = payload.records.filter((record) => record.type === "topic");
  const indexedTopicIds = new Set(topicRecords.map((record) => record.id));
  if (topicRecords.length !== specificTopics.length || indexedTopicIds.size !== topicRecords.length) {
    fail(`Topic search index has ${topicRecords.length} records; expected ${specificTopics.length} unique specific topics`);
  }
  for (const topic of specificTopics) {
    if (!indexedTopicIds.has(topic.id)) fail(`Topic search index is missing ${topic.id}`);
  }
  for (const language of ["sl", "en"]) {
    const directory = path.join(outputDir, language, "topics");
    const entries = await readdir(directory, { withFileTypes: true });
    const detailDirectories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (detailDirectories.length !== topics.length) {
      fail(`/${language}/topics/ has ${detailDirectories.length} detail pages; expected ${topics.length}`);
    }
    const indexHtml = await readFile(path.join(directory, "index.html"), "utf8");
    for (const topic of topics) {
      const detailPath = path.join(directory, topic.id, "index.html");
      if (!(await exists(detailPath))) fail(`Missing topic page: /${language}/topics/${topic.id}/`);
      else if (language === "en") {
        const detailHtml = await readFile(detailPath, "utf8");
        const questionLists = [...detailHtml.matchAll(/<ol\b[^>]*class=["'][^"']*\btopic-question-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ol>/gi)];
        if (topic.count > 0 && !questionLists.length) fail(`/en/topics/${topic.id}/ has no question lists`);
        for (const [, listHtml] of questionLists) {
          for (const tag of listHtml.match(/<(?:p|b)\b[^>]*>/gi) || []) {
            if (!/\blang=["']sl["']/i.test(tag)) {
              fail(`/en/topics/${topic.id}/ contains question wording without lang=\"sl\"`);
              break;
            }
          }
        }
      }
      const expectedHref = deployedPath(`/${language}/topics/${topic.id}/`);
      if (!indexHtml.includes(`href="${expectedHref}"`)) {
        fail(`/${language}/topics/ does not link to ${expectedHref}`);
      }
    }
  }

  const header = questionsCsv[0] || [];
  const seasonColumn = header.indexOf("season");
  const episodeColumn = header.indexOf("episode");
  const questionNumberColumn = header.indexOf("question_number");
  const questionPositionCounts = new Map();
  for (const row of questionsCsv.slice(1)) {
    const number = Number(row[questionNumberColumn]);
    questionPositionCounts.set(number, (questionPositionCounts.get(number) || 0) + 1);
  }
  const contestantHeader = contestantsCsv[0] || [];
  const contestantSeasonColumn = contestantHeader.indexOf("season");
  const contestantEpisodeColumn = contestantHeader.indexOf("episode");
  const episodeKeys = new Set();
  const toEpisodeKey = (season, episode) =>
    `s${String(Number(season)).padStart(2, "0")}e${String(Number(episode)).padStart(2, "0")}`;
  for (const row of questionsCsv.slice(1)) episodeKeys.add(toEpisodeKey(row[seasonColumn], row[episodeColumn]));
  for (const row of contestantsCsv.slice(1)) {
    episodeKeys.add(toEpisodeKey(row[contestantSeasonColumn], row[contestantEpisodeColumn]));
  }
  const episodeRecords = payload.records.filter((record) => record.type === "episode");
  const expectedEpisodeKeys = new Set([...episodeKeys, "s06e40"]);
  const indexedEpisodeKeys = new Set(episodeRecords.map((record) => record.id));
  if (episodeRecords.length !== expectedEpisodeKeys.size) {
    fail(
      `Episode index count ${episodeRecords.length} does not match ${episodeKeys.size} CSV episodes `
        + "plus the documented S06E40 source gap",
    );
  }
  for (const key of expectedEpisodeKeys) {
    if (!indexedEpisodeKeys.has(key)) fail(`Episode index is missing ${key.toUpperCase()}`);
  }
  for (const key of indexedEpisodeKeys) {
    if (!expectedEpisodeKeys.has(key)) fail(`Episode index has unexpected record ${String(key).toUpperCase()}`);
  }

  const routeGroups = {
    season: "seasons",
    episode: "episodes",
    contestant: "contestants",
  };
  for (const [type, route] of Object.entries(routeGroups)) {
    const records = payload.records.filter((record) => record.type === type);
    const uniqueIds = new Set(records.map((record) => record.id));
    if (uniqueIds.size !== records.length) fail(`Duplicate ${type} IDs in search index`);

    for (const language of ["sl", "en"]) {
      const directory = path.join(outputDir, language, route);
      const entries = await readdir(directory, { withFileTypes: true });
      const pageDirectories = entries.filter((entry) => entry.isDirectory()).length;
      if (pageDirectories !== records.length) {
        fail(`/${language}/${route}/ has ${pageDirectories} detail pages; expected ${records.length}`);
      }

      const samples = [records[0], records[Math.floor(records.length / 2)], records.at(-1)].filter(Boolean);
      for (const record of samples) {
        const samplePath = path.join(directory, record.id, "index.html");
        if (!(await exists(samplePath))) fail(`Missing sampled ${type} page: /${language}/${route}/${record.id}/`);
        else {
          const html = await readFile(samplePath, "utf8");
          if (!new RegExp(`<html\\s+lang=["']${language}["']`, "i").test(html)) {
            fail(`Wrong language on sampled page: /${language}/${route}/${record.id}/`);
          }
        }
      }
    }
  }
  for (const language of ["sl", "en"]) {
    const questionDirectory = path.join(outputDir, language, "questions");
    const questionEntries = await readdir(questionDirectory, { withFileTypes: true });
    const questionDirectories = questionEntries.filter((entry) => entry.isDirectory());
    const unexpectedQuestionDirectories = questionDirectories.filter((entry) => entry.name !== "positions");
    if (unexpectedQuestionDirectories.length) {
      fail(
        `/${language}/questions/ contains obsolete per-question page directories: `
          + unexpectedQuestionDirectories.map((entry) => entry.name).join(", "),
      );
    }

    const expectedPositions = Array.from({ length: 14 }, (_, index) => `q${index + 1}`);
    const positionDirectory = path.join(questionDirectory, "positions");
    if (!(await exists(positionDirectory))) {
      fail(`Missing question-position directory: /${language}/questions/positions/`);
      continue;
    }
    const positionEntries = await readdir(positionDirectory, { withFileTypes: true });
    const positionDirectories = positionEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const unexpectedPositions = positionDirectories.filter((name) => !expectedPositions.includes(name));
    if (positionDirectories.length !== expectedPositions.length || unexpectedPositions.length) {
      fail(
        `/${language}/questions/positions/ has ${positionDirectories.length} position pages; `
          + `expected Q1–Q14${unexpectedPositions.length ? `; unexpected: ${unexpectedPositions.join(", ")}` : ""}`,
      );
    }

    const [questionIndexHtml, statisticsHtml] = await Promise.all([
      readFile(path.join(questionDirectory, "index.html"), "utf8"),
      readFile(path.join(outputDir, language, "statistics", "index.html"), "utf8"),
    ]);
    for (const positionId of expectedPositions) {
      const positionPath = path.join(positionDirectory, positionId, "index.html");
      if (!(await exists(positionPath))) {
        fail(`Missing question-position page: /${language}/questions/positions/${positionId}/`);
        continue;
      }
      const positionHtml = await readFile(positionPath, "utf8");
      const number = Number(positionId.slice(1));
      const deepQuestionLinks = extractAttributes(positionHtml, "href").filter((href) =>
        new RegExp(`^${siteBase}/${language}/runs/[^/#]+/#q-`).test(href));
      const expectedLinkCount = questionPositionCounts.get(number) || 0;
      if (deepQuestionLinks.length !== expectedLinkCount) {
        fail(
          `/${language}/questions/positions/${positionId}/ has ${deepQuestionLinks.length} question links; `
            + `expected ${expectedLinkCount}`,
        );
      }
      const expectedHref = deployedPath(`/${language}/questions/positions/${positionId}/`);
      if (!questionIndexHtml.includes(`href="${expectedHref}"`)) {
        fail(`/${language}/questions/ does not link to ${expectedHref}`);
      }
      if (!statisticsHtml.includes(`href="${expectedHref}"`)) {
        fail(`/${language}/statistics/ chart does not link to ${expectedHref}`);
      }
    }

    const runDirectory = path.join(outputDir, language, "runs");
    const runEntries = await readdir(runDirectory, { withFileTypes: true });
    const runDirectories = runEntries.filter((entry) => entry.isDirectory()).length;
    if (runDirectories !== runIds.size) {
      fail(`/${language}/runs/ has ${runDirectories} detail pages; expected ${runIds.size}`);
    }
    for (const runId of runIds) {
      const runPath = path.join(runDirectory, runId, "index.html");
      if (!(await exists(runPath))) fail(`Missing run page: /${language}/runs/${runId}/`);
    }
  }

  const questionRecordsByRun = new Map();
  for (const record of questionRecords) {
    if (!record.runId || !record.anchor) continue;
    if (!questionRecordsByRun.has(record.runId)) questionRecordsByRun.set(record.runId, []);
    questionRecordsByRun.get(record.runId).push(record);
  }
  for (const language of ["sl", "en"]) {
    await mapLimit([...questionRecordsByRun], 20, async ([runId, records]) => {
      const runPath = path.join(outputDir, language, "runs", runId, "index.html");
      if (!(await exists(runPath))) return;
      const html = await readFile(runPath, "utf8");
      for (const record of records) {
        if (!html.includes(`id="${record.anchor}"`)) {
          fail(`/${language}/runs/${runId}/ is missing question anchor #${record.anchor}`);
        }
      }
    });
  }
  return payload;
}

async function scanHtml(htmlFiles) {
  await mapLimit(htmlFiles, 24, async (filePath) => {
    const html = await readFile(filePath, "utf8");
    const relative = path.relative(outputDir, filePath).split(path.sep).join("/");
    if (sourceMediaFilename.test(html)) fail(`${relative} mentions a source media filename`);
    if (/\bcunt\b/i.test(html)) fail(`${relative} contains a rejected unsafe machine translation`);
    const rejectedCopy = publicCopyForAudit(html).match(rejectedPublicCopy)?.[0];
    if (rejectedCopy) fail(`${relative} contains rejected public wording: ${rejectedCopy}`);
    if (!html.includes("https://fonts.googleapis.com/")) {
      fail(`${relative} does not load its fonts from the configured CDN`);
    }
    if (/^(?:sl|en)\//.test(relative)
      && (!html.includes('class="site-header"') || !html.includes('class="site-footer"'))) {
      fail(`${relative} is outside the shared catalogue shell`);
    }
    if (html.includes('class="catalog-return"')) {
      fail(`${relative} still uses the isolated analysis navigation`);
    }
    if (html.includes("instagram.com/jeancaffou")) {
      fail(`${relative} still links to the removed Instagram profile`);
    }
    if (/^en\/runs\/[^/]+\/index\.html$/.test(relative)
      && !html.includes('class="question-board__prompt" lang="sl"')) {
      fail(`${relative} does not retain canonical Slovenian questions`);
    }

    const hrefs = extractAttributes(html, "href");
    for (const href of hrefs) {
      const pathOnly = href.split(/[?#]/, 1)[0];
      if (/\.(?:md|markdown)$/i.test(pathOnly)) fail(`${relative} contains a Markdown href: ${href}`);
      if (/\/data\/(?:questions|contestants)\.csv$/i.test(pathOnly)) {
        fail(`${relative} links to a catalogue CSV: ${href}`);
      }
      const target = targetFromUrl(href, filePath);
      if (!target) continue;
      if (target.pathname.startsWith("/assets/evidence/")) evidenceTargets.add(target.pathname);
      else internalTargets.add(target.resolved);
    }

    for (const src of extractAttributes(html, "src")) {
      const target = targetFromUrl(src, filePath);
      if (target?.pathname.startsWith("/assets/evidence/")) evidenceTargets.add(target.pathname);
    }
  });
}

async function scanPublicDataFiles(files) {
  const publicDataFiles = files.filter((filePath) => /\.(?:js|json)$/i.test(filePath));
  await mapLimit(publicDataFiles, 12, async (filePath) => {
    const text = await readFile(filePath, "utf8");
    const relative = path.relative(outputDir, filePath).split(path.sep).join("/");
    if (sourceMediaFilename.test(text)) fail(`${relative} mentions a source media filename`);
    if (markdownReference.test(text)) fail(`${relative} mentions an internal Markdown file`);
  });
}

async function assertInternalTargets() {
  await mapLimit([...internalTargets], 64, async (target) => {
    let candidate = target;
    if (path.extname(candidate) === "") candidate = path.join(candidate, "index.html");
    try {
      const metadata = await stat(candidate);
      if (!metadata.isFile()) fail(`Internal href is not a file: ${path.relative(outputDir, candidate)}`);
    } catch (error) {
      fail(`Broken internal href: /${path.relative(outputDir, candidate).split(path.sep).join("/")} (${error.code || error.message})`);
    }
  });
}

async function assertEvidenceTargets() {
  const portable = process.env.CATALOG_PORTABLE_EVIDENCE === "1";
  await mapLimit([...evidenceTargets], 64, async (pathname) => {
    const destination = path.resolve(outputDir, `.${pathname}`);
    const match = pathname.match(/^\/assets\/evidence\/(s\d{2}e\d{2})\/(.+\.jpg)$/i);
    if (!match || match[2].split("/").includes("..")) {
      fail(`Malformed evidence URL: ${pathname}`);
      return;
    }
    const source = path.resolve(catalogDir, "work", `${match[1].toLowerCase()}_frames`, match[2]);
    const workRoot = `${path.resolve(catalogDir, "work")}${path.sep}`;
    if (!source.startsWith(workRoot)) {
      fail(`Evidence URL escapes work/: ${pathname}`);
      return;
    }
    try {
      const [publishedMetadata, targetMetadata, sourceMetadata] = await Promise.all([
        lstat(destination),
        stat(destination),
        stat(source),
      ]);
      if (!publishedMetadata.isFile() && !publishedMetadata.isSymbolicLink()) {
        fail(`Evidence URL is neither a file nor a symlink: ${pathname}`);
        return;
      }
      if (!targetMetadata.isFile() || targetMetadata.size === 0) fail(`Evidence URL is empty or not a file: ${pathname}`);
      if (targetMetadata.size !== sourceMetadata.size) fail(`Evidence size differs from its source: ${pathname}`);

      // POSIX and most CIFS mounts expose stable device/inode pairs for hardlinks.
      // Portable builds are copies by design; filesystems reporting inode 0 do not
      // provide enough metadata for an identity check, so size/existence is used.
      const hasStableInodes = targetMetadata.ino > 0
        && sourceMetadata.ino > 0
        && targetMetadata.dev === sourceMetadata.dev;
      if (!portable && hasStableInodes && targetMetadata.ino !== sourceMetadata.ino) {
        fail(`Evidence file is not linked to its source: ${pathname}`);
      }
    } catch (error) {
      fail(`Broken evidence URL: ${pathname} (${error.code || error.message})`);
    }
  });
}

async function assertCsvDownloads() {
  for (const name of ["questions.csv", "contestants.csv"]) {
    const source = path.join(catalogDir, name);
    const built = path.join(outputDir, "data", name);
    try {
      const [sourceMetadata, builtMetadata] = await Promise.all([stat(source), stat(built)]);
      if (!builtMetadata.isFile() || builtMetadata.size === 0) fail(`/data/${name} is empty or not a file`);
      if (builtMetadata.size !== sourceMetadata.size) fail(`/data/${name} does not match the source CSV size`);
    } catch (error) {
      fail(`Missing CSV download /data/${name}: ${error.code || error.message}`);
    }
  }
}

async function main() {
  if (!(await exists(outputDir))) throw new Error("Build directory catalog/_site does not exist. Run npm run build first.");

  await assertCoreRoutes();
  const searchIndex = await assertPageCountsAndSamples();
  await assertCsvDownloads();
  const htmlFiles = await walkFiles(outputDir, ".html");
  const allFiles = await walkFiles(outputDir);
  const localFonts = allFiles.filter((filePath) => /\.(?:woff2?|ttf|otf|eot)$/i.test(filePath));
  for (const filePath of localFonts) fail(`Local font binary was published: ${path.relative(outputDir, filePath)}`);
  const cssFiles = allFiles.filter((filePath) => filePath.endsWith(".css"));
  await mapLimit(cssFiles, 8, async (filePath) => {
    const css = await readFile(filePath, "utf8");
    if (/@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf|eot)/i.test(css)) {
      fail(`Local font declaration found in ${path.relative(outputDir, filePath)}`);
    }
  });
  await scanHtml(htmlFiles);
  await scanPublicDataFiles(allFiles);
  await Promise.all([assertInternalTargets(), assertEvidenceTargets()]);

  if (evidenceTargets.size === 0) fail("No evidence URLs were found in generated HTML");
  if (errors.length) {
    const shown = errors.slice(0, 50).map((error) => `  - ${error}`).join("\n");
    const remainder = errors.length > 50 ? `\n  - …and ${errors.length - 50} more` : "";
    throw new Error(`Build validation failed with ${errors.length} issue(s):\n${shown}${remainder}`);
  }

  const typeCounts = Object.fromEntries(
    ["season", "episode", "contestant", "question"].map((type) => [
      type,
      searchIndex.records.filter((record) => record.type === type).length,
    ]),
  );
  console.log(
    `Build validation passed: ${htmlFiles.length} HTML pages, `
      + `${typeCounts.season} seasons, ${typeCounts.episode} episodes, `
      + `${typeCounts.contestant} contestants, ${new Set(searchIndex.records.filter((record) => record.type === "question").map((record) => record.runId)).size} runs, `
      + `${typeCounts.question} anchored questions, `
      + `${evidenceTargets.size} evidence URLs.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
