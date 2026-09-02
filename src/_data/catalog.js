import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "../../lib/csv.mjs";
import {
  episodeKey,
  evidenceRecords,
  normalizedLetter,
  pad2,
  parseMoney,
  selectQuestionEvidence,
  seasonKey,
  slugBase,
  splitSemicolon,
} from "../../lib/catalog-utils.mjs";
import { repeatedQuestionGroups } from "../../lib/repeated-questions.mjs";
import { loadReviewedTaxonomy, reviewedTaxonomySha256 } from "../../tools/question-topic-review/taxonomy.mjs";

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(dataDir, "../..");
const expectedTopicMethod = "Every question was assigned through GPT semantic review of its complete Slovenian wording and all four answer options. Code only validates coverage and calculates totals.";

async function readCsv(name) {
  const text = await readFile(path.join(catalogDir, name), "utf8");
  return parseCsvObjects(text);
}

async function readJsonIfPresent(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(catalogDir, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function isRealPersonName(value) {
  const name = String(value || "").trim();
  if (!name) return false;
  return !/^(no contestant|no winner|not applicable|not visible|not fully visible|vip charity segment|lower-third|n\/a)/i.test(name);
}

function parseEntrants(value) {
  return splitSemicolon(value)
    .map((display) => {
      const match = display.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
      const name = (match ? match[1] : display).trim();
      if (!isRealPersonName(name)) return null;
      return {
        display,
        name,
        location: match ? match[2].trim() : "",
      };
    })
    .filter(Boolean);
}

function questionFlags(notes) {
  const normalized = String(notes || "").toLowerCase().replaceAll("-", " ");
  const isSwitchedOriginal = normalized.includes("original q") && (normalized.includes("switch") || normalized.includes("zamenjav"));
  const isNoStakes = [
    "no stakes",
    "walk away",
    "takes the money",
    "took the money",
    "non binding",
    "did not affect prize",
    "switched out",
  ].some((marker) => normalized.includes(marker)) || isSwitchedOriginal;
  return {
    isSwitchedOriginal,
    isNoStakes,
    isWalkAway: isNoStakes && !isSwitchedOriginal,
  };
}

function lifelineKeys(value) {
  const text = String(value || "").toLowerCase();
  const keys = [];
  if (/(polovička|50:50)/.test(text)) keys.push("fifty-fifty");
  if (/(glas ljudstva|pomoč občinstva)/.test(text)) keys.push("audience");
  if (/(klic v sili|klic prijatelju)/.test(text)) keys.push("phone");
  if (/(mnenje voditelja|pomoč voditelja)/.test(text)) keys.push("host");
  if (/zamenjava vprašanja/.test(text)) keys.push("switch");
  return keys;
}

function classifyQuestionOutcome(question) {
  if (question.isSwitched) return "switched";
  if (!question.contestantAnswer) return "unknown";
  if (question.isWalkAway) return question.isCorrect ? "walk-correct" : "walk-wrong";
  return question.isCorrect ? "correct" : "wrong";
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSorted(values, locale = "sl") {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, locale));
}

function dateSort(a, b) {
  return a.airingDate.localeCompare(b.airingDate) || a.key.localeCompare(b.key);
}

function isFastFingersEvidence(item) {
  const name = path.basename(String(item?.nestedPath || item?.sourcePath || "")).toLowerCase();
  return ["fast-board", "fast-result"].includes(item?.kind)
    || /(?:^|[_-])(?:fast|ff)\d*(?:[_-]|\.|$)/.test(name);
}

function fastFingersFeaturedEvidence(items) {
  const labelledEvidence = items.filter(isFastFingersEvidence);
  const evidence = labelledEvidence.length ? labelledEvidence : items;
  if (!evidence.length) return undefined;
  const basename = (item) => path.basename(item.nestedPath || item.sourcePath || "");
  // A settled result or a full ordering board is more useful in the episode
  // hero than a close-up of the winner. Prefer those explicit frames when
  // the older archive row contains both kinds of image.
  return evidence.find((item) => /(?:^|[_-])results?(?:[_\-.]|$)/i.test(basename(item)))
    || evidence.find((item) => item.kind === "fast-board")
    || evidence.find((item) => item.kind === "fast-result" && !/(?:winner|portrait|identity)/i.test(basename(item)))
    || evidence.find((item) => /(?:lineup|order|options?)/i.test(basename(item)))
    || evidence.find((item) => item.kind === "fast-result")
    || (evidence.length === 2 ? evidence.at(-1) : evidence.length > 1 ? evidence.at(-2) : evidence[0]);
}

function fastFingersEvidencePriority(item) {
  const name = path.basename(String(item?.nestedPath || item?.sourcePath || ""));
  if (/(?:^|[_-])results?(?:[_\-.]|$)/i.test(name)) return 500;
  if (/(?:lineup)/i.test(name)) return 450;
  if (item?.kind === "fast-board") return 400;
  if (item?.kind === "fast-result") return 350;
  if (/(?:order|options?)/i.test(name)) return 325;
  if (/(?:^|[_-])(?:fast|ff)\d*(?:[_\-.]|$)/i.test(name)) return 250;
  return 100;
}

function itemForSourcePath(items, sourcePath) {
  if (!sourcePath) return undefined;
  return items.find((item) => item.sourcePath === sourcePath);
}

function firstEvidence(items, predicate) {
  return items.find(predicate);
}

function isCharityRun(runRows, runQuestions) {
  const notes = [...runRows, ...runQuestions]
    .map((item) => item.notes || "")
    .join(" ");
  return /charity|donation|dobrodel|humanitar|\bVIP\b|\bplays? for\b|\bfinal (?:charity )?prize(?: remains| is| was)?\s+\d[\d.,]*\s*EUR\s+for\b/i.test(notes);
}

export default async function () {
  const [questionRows, contestantRows, patternResults, topicResults, questionAuditFile, contestantAuditFile, fastFingersFile] = await Promise.all([
    readCsv("questions.csv"),
    readCsv("contestants.csv"),
    readFile(path.join(catalogDir, "src", "assets", "data", "answer-patterns.json"), "utf8").then(JSON.parse),
    readFile(path.join(catalogDir, "src", "_data", "generated", "question-topics.json"), "utf8").then(JSON.parse),
    readJsonIfPresent("audit/question-audit.json", { entries: [] }),
    readJsonIfPresent("audit/contestant-audit.json", { entries: [] }),
    readJsonIfPresent("src/_data/curated/fast-fingers.json", { rounds: {} }),
  ]);
  const curatedFastFingers = fastFingersFile?.rounds && typeof fastFingersFile.rounds === "object"
    ? fastFingersFile.rounds
    : {};
  const questionAuditByRow = new Map((questionAuditFile.entries || [])
    .filter((entry) => entry && entry.type === "question")
    .map((entry) => [Number(entry.rowIndex), entry]));
  const profileAuditByKey = Object.fromEntries((contestantAuditFile.entries || [])
    .filter((entry) => entry && entry.type === "profile")
    .map((entry) => [String(entry.key), entry]));
  const questionSource = await readFile(path.join(catalogDir, "questions.csv"), "utf8");
  const topicSourceHash = createHash("sha256").update(questionSource).digest("hex");
  const reviewedTaxonomy = await loadReviewedTaxonomy(catalogDir);
  const topicTaxonomyHash = reviewedTaxonomySha256(reviewedTaxonomy);
  if (topicResults.version !== 3
      || topicResults.method !== expectedTopicMethod
      || !Array.isArray(topicResults.topics)
      || topicResults.active_topic_count !== topicResults.topics?.length
      || !/^[a-f0-9]{64}$/.test(String(topicResults.review_provenance_sha256 || ""))
      || !Number.isInteger(topicResults.override_replacement_count)
      || topicResults.taxonomy_version !== reviewedTaxonomy.version
      || topicResults.taxonomy_sha256 !== topicTaxonomyHash
      || topicResults.taxonomy_topic_count !== reviewedTaxonomy.topics.length) {
    throw new Error("Generated question-topic data is not the current GPT semantic review; merge and rebuild the topic analysis first");
  }
  const topicIndices = topicResults.topics.flatMap((item) => item.question_indices);
  const sortedTopicIndices = [...topicIndices].sort((a, b) => a - b);
  if (topicResults.source_sha256 !== topicSourceHash
      || topicResults.question_count !== questionRows.length
      || sortedTopicIndices.length !== questionRows.length
      || sortedTopicIndices.some((value, index) => value !== index)) {
    throw new Error("Generated question-topic data is stale or does not cover questions.csv exactly once");
  }
  const identityVariants = new Map([
    ["Aleksandar Manovski", new Map([
      ["s05e12", "medvode"],
      ["s10e06", "ljubljana-s10e06"],
    ])],
    ["Andrej Štrk", new Map([
      ["s03e68", "skofja-vas-pri-celju"],
      ["s04e28", "skofja-vas-pri-celju"],
      ["s04e29", "skofja-vas-pri-celju"],
      ["s10e13", "celje-s10e13"],
    ])],
    ["David Nastran", new Map([
      ["s01e39", "s01e39"],
      ["s02e39", "s02e39-s02e40"],
      ["s02e40", "s02e39-s02e40"],
      ["s06e10", "zelodnik-radomlje"],
      ["s10e08", "zelodnik-radomlje"],
    ])],
    ["Jože Remškar", new Map([
      ["s03e42", "brezje"],
      ["s04e52", "cemsenik"],
    ])],
    ["Matija Jenko", new Map([
      ["s04e58", "ljubljana"],
      ["s04e62", "kranj"],
    ])],
    ["Miha Gabruč", new Map([
      ["s01e16", "s01e16"],
      ["s06e46", "spodnje-gameljne"],
      ["s06e47", "spodnje-gameljne"],
      ["s09e34", "spodnje-gameljne"],
      ["s10e12", "spodnje-gameljne"],
    ])],
    ["Miha Novak", new Map([
      ["s02e16", "s02e16"],
      ["s02e50", "s02e50"],
      ["s04e23", "zgornje-konjisce"],
      ["s09e04", "mackovec-pri-dvoru"],
    ])],
    ["Mojca Skobe", new Map([
      ["s01e24", "s01e24"],
      ["s03e04", "ljubljana"],
      ["s04e69", "ljubljana"],
    ])],
    ["Žiga Kobal", new Map([
      ["s03e22", "trebnje"],
      ["s08e08", "trebnje"],
      ["s03e52", "s03e52"],
      ["s08e19", "logatec"],
      ["s09e02", "s09e02"],
    ])],
  ]);
  const identityVariantFor = (name, season, episode) =>
    identityVariants.get(name)?.get(episodeKey(season, episode)) || "default";
  const identityKeyFor = (name, season, episode) =>
    `${name}\u0000${identityVariantFor(name, season, episode)}`;
  const personSeeds = new Map();
  const registerPerson = (name, location = "", season = 0, episode = 0) => {
    if (!isRealPersonName(name)) return;
    const identityKey = identityKeyFor(name, season, episode);
    if (!personSeeds.has(identityKey)) {
      personSeeds.set(identityKey, {
        identityKey,
        identityVariant: identityVariantFor(name, season, episode),
        name,
        locations: new Set(),
      });
    }
    if (location) personSeeds.get(identityKey).locations.add(location);
  };

  for (const row of questionRows) {
    registerPerson(
      String(row.contestant_name || "").trim(),
      "",
      Number.parseInt(row.season, 10),
      Number.parseInt(row.episode, 10),
    );
  }
  for (const row of contestantRows) {
    const season = Number.parseInt(row.season, 10);
    const episode = Number.parseInt(row.episode, 10);
    for (const entrant of parseEntrants(row.fast_fingers_contestants)) {
      registerPerson(entrant.name, entrant.location, season, episode);
    }
    registerPerson(String(row.fast_fingers_winner || "").trim(), "", season, episode);
    registerPerson(String(row.millionaire_contestant || "").trim(), "", season, episode);
  }

  const identityCountByName = new Map();
  for (const seed of personSeeds.values()) {
    identityCountByName.set(seed.name, (identityCountByName.get(seed.name) || 0) + 1);
  }
  const slugCounts = new Map();
  const people = [...personSeeds.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "sl") || a.identityVariant.localeCompare(b.identityVariant, "sl"))
    .map((seed) => {
      const nameBase = slugBase(seed.name);
      const base = identityCountByName.get(seed.name) > 1
        ? `${nameBase}-${slugBase(seed.identityVariant)}`
        : nameBase;
      const count = (slugCounts.get(base) || 0) + 1;
      slugCounts.set(base, count);
      return {
        identityKey: seed.identityKey,
        identityVariant: seed.identityVariant,
        name: seed.name,
        slug: count === 1 ? base : `${base}-${count}`,
        locations: uniqueSorted([...seed.locations]),
        lineupAppearances: [],
        winnerAppearances: [],
        hotSeatRuns: [],
        questions: [],
        episodes: [],
      };
    });
  const personByIdentity = new Map(people.map((person) => [person.identityKey, person]));
  const personFor = (name, season, episode) =>
    personByIdentity.get(identityKeyFor(name, season, episode));

  const questions = questionRows.map((row, sourceIndex) => {
    const season = Number.parseInt(row.season, 10);
    const episode = Number.parseInt(row.episode, 10);
    const questionNumber = Number.parseInt(row.question_number, 10);
    const contestantName = String(row.contestant_name || "").trim();
    const correctAnswer = normalizedLetter(row.correct_answer);
    const contestantAnswer = normalizedLetter(row.contestant_answer);
    const evidence = evidenceRecords(row.evidence_frame);
    const sourceTimestamps = splitSemicolon(row.source_timestamp);
    const notes = String(row.notes || "").trim();
    const flags = questionFlags(notes);
    const lifelinesUsed = splitSemicolon(row.lifelines_used);
    const questionLifelineKeys = lifelineKeys(row.lifelines_used);
    const displayEvidence = selectQuestionEvidence(evidence, {
      lifelineKeys: questionLifelineKeys,
      notes,
      audit: questionAuditByRow.get(sourceIndex),
    });
    const contestantIdentityKey = identityKeyFor(contestantName, season, episode);
    const question = {
      sourceIndex,
      season,
      episode,
      seasonKey: seasonKey(season),
      episodeKey: episodeKey(season, episode),
      airingDate: row.airing_date,
      hostName: row.host_name,
      contestantName,
      contestantIdentityKey,
      contestantSlug: personByIdentity.get(contestantIdentityKey)?.slug || slugBase(contestantName),
      questionNumber,
      prize: row.prize,
      prizeValue: parseMoney(row.prize),
      prompt: row.question,
      answers: {
        A: row.answer_a,
        B: row.answer_b,
        C: row.answer_c,
        D: row.answer_d,
      },
      correctAnswer,
      contestantAnswer,
      lifelinesUsed,
      lifelineKeys: questionLifelineKeys,
      sourceTimestamps,
      evidence,
      // Only the strict audit-selected primary may be rendered. Keeping the
      // raw evidence array is useful for diagnostics, but it must not be a
      // fallback image when a row is pending or source-limited.
      primaryEvidence: displayEvidence.primary,
      displayPrimaryEvidence: displayEvidence.primary,
      displaySupplementalEvidence: displayEvidence.supplemental,
      displayEvidenceMode: displayEvidence.mode,
      hasCompleteBoardEvidence: displayEvidence.hasCompleteBoard,
      hasExplicitCorrectOutcomeEvidence: displayEvidence.hasExplicitCorrectOutcome,
      auditVerified: Boolean(displayEvidence.auditVerified),
      notes,
      isNoStakes: flags.isNoStakes,
      isWalkAway: flags.isWalkAway,
      isSwitched: flags.isSwitchedOriginal,
      isCorrect: Boolean(contestantAnswer) && contestantAnswer === correctAnswer,
    };
    question.outcome = classifyQuestionOutcome(question);
    return question;
  });

  const strictEvidencePending = questions.filter((question) => !question.displayPrimaryEvidence);
  if (strictEvidencePending.length) {
    const sample = strictEvidencePending
      .slice(0, 12)
      .map((question) => `${question.episodeKey}:row${question.sourceIndex}`)
      .join(", ");
    console.warn(
      `[catalog] Strict green question evidence is unavailable for ${strictEvidencePending.length} rows `
      + `(${sample}). Those questions will render without an evidence image; `
      + "a yellow/orange or unverified frame is never used as a fallback.",
    );
  }

  const questionIds = new Map();
  for (const question of questions) {
    const base = `${question.episodeKey}-${question.contestantSlug}-q${pad2(question.questionNumber)}`;
    const occurrence = (questionIds.get(base) || 0) + 1;
    questionIds.set(base, occurrence);
    question.occurrence = occurrence;
    question.id = occurrence === 1 ? base : `${base}-${occurrence}`;
  }

  const contestantRuns = contestantRows.map((row, sourceIndex) => {
    const season = Number.parseInt(row.season, 10);
    const episode = Number.parseInt(row.episode, 10);
    const millionaireName = String(row.millionaire_contestant || "").trim();
    const winnerName = String(row.fast_fingers_winner || "").trim();
    const evidence = evidenceRecords(row.evidence_frame);
    const entrants = parseEntrants(row.fast_fingers_contestants).map((entrant) => ({
      ...entrant,
      identityKey: identityKeyFor(entrant.name, season, episode),
      slug: personFor(entrant.name, season, episode)?.slug || slugBase(entrant.name),
    }));
    const winnerIdentityKey = identityKeyFor(winnerName, season, episode);
    const millionaireIdentityKey = identityKeyFor(millionaireName, season, episode);
    return {
      sourceIndex,
      season,
      episode,
      seasonKey: seasonKey(season),
      episodeKey: episodeKey(season, episode),
      airingDate: row.airing_date,
      seasonName: row.season_name,
      hostName: row.host_name,
      entrants,
      fastFingersWinner: isRealPersonName(winnerName) ? winnerName : "",
      fastFingersWinnerIdentityKey: winnerIdentityKey,
      fastFingersWinnerSlug: personByIdentity.get(winnerIdentityKey)?.slug || "",
      millionaireContestant: isRealPersonName(millionaireName) ? millionaireName : "",
      millionaireContestantIdentityKey: millionaireIdentityKey,
      millionaireContestantSlug: personByIdentity.get(millionaireIdentityKey)?.slug || "",
      prizeWinnings: row.prize_winnings,
      prizeValue: parseMoney(row.prize_winnings),
      prizeStatus: /^pending$/i.test(row.prize_winnings) ? "pending" : parseMoney(row.prize_winnings) === null ? "unavailable" : "known",
      sourceTimestamps: splitSemicolon(row.source_timestamp),
      evidence,
      notes: String(row.notes || "").trim(),
    };
  });

  const runIds = new Map();
  for (const run of contestantRuns) {
    const subject = run.millionaireContestantSlug || "no-contestant";
    const base = `${run.episodeKey}-${subject}`;
    const occurrence = (runIds.get(base) || 0) + 1;
    runIds.set(base, occurrence);
    run.id = occurrence === 1 ? base : `${base}-${occurrence}`;
  }

  const episodeMap = new Map();
  const ensureEpisode = (season, episode, airingDate, hostName) => {
    const key = episodeKey(season, episode);
    if (!episodeMap.has(key)) {
      episodeMap.set(key, {
        key,
        season,
        episode,
        seasonKey: seasonKey(season),
        airingDate,
        hosts: new Set(),
        questions: [],
        contestantRuns: [],
        fastFingers: [],
        people: new Set(),
        evidence: [],
        available: true,
      });
    }
    if (hostName) episodeMap.get(key).hosts.add(hostName);
    return episodeMap.get(key);
  };

  for (const question of questions) {
    const episode = ensureEpisode(question.season, question.episode, question.airingDate, question.hostName);
    episode.questions.push(question);
    episode.people.add(question.contestantName);
  }
  for (const run of contestantRuns) {
    const episode = ensureEpisode(run.season, run.episode, run.airingDate, run.hostName);
    episode.contestantRuns.push(run);
    if (run.millionaireContestant) episode.people.add(run.millionaireContestant);
    for (const entrant of run.entrants) episode.people.add(entrant.name);
  }

  const episodes = [...episodeMap.values()].sort(dateSort);
  for (let index = 0; index < episodes.length; index += 1) {
    const episode = episodes[index];
    episode.hosts = uniqueSorted([...episode.hosts]);
    episode.people = uniqueSorted([...episode.people]);
    episode.questionCount = episode.questions.length;
    episode.runCount = episode.contestantRuns.filter((run) => run.millionaireContestant).length;
    episode.previousKey = episodes[index - 1]?.key || "";
    episode.nextKey = episodes[index + 1]?.key || "";
    episode.evidence = dedupeBy(
      [...episode.contestantRuns.flatMap((run) => run.evidence), ...episode.questions.flatMap((question) => question.evidence)],
      (item) => item.sourcePath,
    );
    episode.fastFingers = episode.contestantRuns
      .filter((run) => run.entrants.length || run.fastFingersWinner)
      .map((run, roundIndex) => {
        // Most later rows use explicit `fast`/`ff` evidence names. Older rows
        // predate that naming convention, but their run record still consists
        // of the Fastest Finger First segment, so retain that complete run
        // evidence as the fallback instead of letting the episode hero fall
        // back to an arbitrary hot-seat frame.
        const labelledEvidence = run.evidence.filter(isFastFingersEvidence);
        const evidence = labelledEvidence.length ? labelledEvidence : run.evidence;
        const curated = curatedFastFingers[`${episode.key}:${roundIndex + 1}`] || {};
        const questionEvidence = itemForSourcePath(evidence, curated.boardEvidence)
          || firstEvidence(evidence, (item) => item.kind === "fast-board")
          || firstEvidence(evidence, (item) => /(?:order|options?|board)/i.test(item.nestedPath || ""));
        const resultEvidence = itemForSourcePath(evidence, curated.resultEvidence)
          || firstEvidence(evidence, (item) => item.kind === "fast-result" && !/(?:winner|profile|portrait|identity)/i.test(item.nestedPath || ""))
          || firstEvidence(evidence, (item) => /(?:result|order)/i.test(item.nestedPath || ""));
        const lineupEvidence = itemForSourcePath(evidence, curated.lineupEvidence)
          || firstEvidence(run.evidence, (item) => item.kind === "lineup")
          || firstEvidence(run.evidence, (item) => /(?:lineup|profile|identity|name[_-]?strap)/i.test(item.nestedPath || ""));
        return {
          round: roundIndex + 1,
          entrants: run.entrants,
          winner: run.fastFingersWinner,
          winnerSlug: run.fastFingersWinnerSlug,
          evidence,
          lineupEvidence,
          // Fast Fingers wording is published only from the curated Slovenian
          // transcript, never from translated notes. Until a round is audited,
          // the page leaves this block empty instead of inventing wording.
          question: curated.question || "",
          answers: curated.answers || {},
          correctOrder: curated.correctOrder || [],
          questionEvidence,
          resultEvidence,
          featuredEvidence: resultEvidence || questionEvidence || fastFingersFeaturedEvidence(evidence),
        };
      });
    const fastFingersFeatured = episode.fastFingers
      .map((round, roundIndex) => ({ item: round.featuredEvidence, roundIndex }))
      .filter(({ item }) => item)
      .sort((a, b) => fastFingersEvidencePriority(b.item) - fastFingersEvidencePriority(a.item) || a.roundIndex - b.roundIndex)
      .at(0)?.item;
    const lineupHero = episode.fastFingers
      .map((round) => round.lineupEvidence)
      .find(Boolean);
    episode.featuredEvidence =
      lineupHero ||
      fastFingersFeatured ||
      episode.evidence.find((item) => item.kind === "fast-result") ||
      episode.evidence.find((item) => item.kind === "fast-board") ||
      episode.evidence.find((item) => item.kind === "lineup") ||
      episode.contestantRuns.flatMap((run) => run.evidence)[0] ||
      episode.questions[0]?.primaryEvidence ||
      episode.evidence[0];
  }
  const episodeByKey = Object.fromEntries(episodes.map((episode) => [episode.key, episode]));
  const unavailableEpisode = {
    key: "s06e40",
    season: 6,
    episode: 40,
    seasonKey: "s06",
    airingDate: "",
    hosts: [],
    questions: [],
    contestantRuns: [],
    fastFingers: [],
    people: [],
    evidence: [],
    available: false,
    questionCount: 0,
      runCount: 0,
      moneyAwarded: 0,
      charityMoney: 0,
      contestantMoney: 0,
    previousKey: "s06e39",
    nextKey: "s06e41",
  };
  if (episodeByKey.s06e39) episodeByKey.s06e39.nextKey = unavailableEpisode.key;
  if (episodeByKey.s06e41) episodeByKey.s06e41.previousKey = unavailableEpisode.key;
  const originalEpisodeSlots = [...episodes, unavailableEpisode].sort(
    (a, b) => a.season - b.season || a.episode - b.episode,
  );

  const personEvidenceExclusions = new Set([
    "s04e52\u0000Jože Remškar\u0000work/s04e52_frames/s04e52_ff1_lineup_joze_00_34.jpg",
  ]);
  const evidenceAllowedForPerson = (run, personName, item) =>
    !personEvidenceExclusions.has(`${run.episodeKey}\u0000${personName}\u0000${item.sourcePath}`);
  const lineupEvidenceFor = (run, entrantName) => {
    const tokenSets = run.entrants.map((entrant) => ({
      name: entrant.name,
      tokens: slugBase(entrant.name).split("-").filter((token) => token.length >= 3),
    }));
    const targetTokens = tokenSets.find((entry) => entry.name === entrantName)?.tokens || [];
    return run.evidence.filter((item) => {
      if (!evidenceAllowedForPerson(run, entrantName, item)) return false;
      if (["fast-board", "fast-result"].includes(item.kind)) return true;
      if (item.kind !== "lineup") return false;
      const frameSlug = slugBase(item.nestedPath);
      const targetMentioned = targetTokens.some((token) => frameSlug.includes(token));
      const anyEntrantMentioned = tokenSets.some((entry) =>
        entry.tokens.some((token) => frameSlug.includes(token))
      );
      return targetMentioned || !anyEntrantMentioned;
    });
  };

  for (const run of contestantRuns) {
    for (const entrant of run.entrants) {
      const person = personByIdentity.get(entrant.identityKey);
      if (!person) continue;
      person.lineupAppearances.push({
        episodeKey: run.episodeKey,
        airingDate: run.airingDate,
        location: entrant.location,
        evidence: lineupEvidenceFor(run, entrant.name),
      });
    }
    if (run.fastFingersWinner) personByIdentity.get(run.fastFingersWinnerIdentityKey)?.winnerAppearances.push(run);
    if (run.millionaireContestant) {
      personByIdentity.get(run.millionaireContestantIdentityKey)?.hotSeatRuns.push({
        ...run,
        evidence: run.evidence.filter((item) => evidenceAllowedForPerson(run, run.millionaireContestant, item)),
      });
    }
  }
  for (const question of questions) personByIdentity.get(question.contestantIdentityKey)?.questions.push(question);

  for (const person of people) {
    const lineupByEpisode = new Map();
    for (const appearance of person.lineupAppearances) {
      const key = `${appearance.episodeKey}:${appearance.location}`;
      if (!lineupByEpisode.has(key)) {
        lineupByEpisode.set(key, { ...appearance, evidence: [...appearance.evidence] });
      } else {
        const current = lineupByEpisode.get(key);
        current.evidence = dedupeBy([...current.evidence, ...appearance.evidence], (item) => item.sourcePath);
      }
    }
    person.lineupAppearances = [...lineupByEpisode.values()];
    const episodeKeys = uniqueSorted([
      ...person.lineupAppearances.map((item) => item.episodeKey),
      ...person.hotSeatRuns.map((run) => run.episodeKey),
      ...person.questions.map((question) => question.episodeKey),
    ]);
    person.episodes = episodeKeys.map((key) => episodeByKey[key]).filter(Boolean).sort(dateSort);
    person.firstDate = person.episodes[0]?.airingDate || "";
    person.lastDate = person.episodes.at(-1)?.airingDate || "";
    person.maxPrize = person.hotSeatRuns.reduce((maximum, run) => Math.max(maximum, run.prizeValue || 0), 0);
    person.questionCount = person.questions.length;
    person.hotSeatCount = person.hotSeatRuns.length;
    person.fastFingersWins = person.winnerAppearances.length;
  }

  // A catalogue run joins question segments that continue across episode
  // boundaries. A segment beginning above Q1 is a continuation of that
  // contestant's preceding segment; a segment beginning at Q1 starts a new
  // hot-seat run. This keeps the smallest public page at run level while
  // preserving stable anchors for every CSV question row.
  const slotIndexByEpisode = new Map(
    originalEpisodeSlots.map((episode, index) => [episode.key, index]),
  );
  const segmentKeyFor = (episode, identityKey) => `${episode}\u0001${identityKey}`;
  const questionSegments = new Map();
  for (const question of questions) {
    const key = segmentKeyFor(question.episodeKey, question.contestantIdentityKey);
    if (!questionSegments.has(key)) {
      questionSegments.set(key, {
        key,
        episodeKey: question.episodeKey,
        contestantIdentityKey: question.contestantIdentityKey,
        contestantName: question.contestantName,
        questions: [],
      });
    }
    questionSegments.get(key).questions.push(question);
  }

  const segmentsByIdentity = new Map();
  for (const segment of questionSegments.values()) {
    if (!segmentsByIdentity.has(segment.contestantIdentityKey)) {
      segmentsByIdentity.set(segment.contestantIdentityKey, []);
    }
    segment.questions.sort((a, b) => a.sourceIndex - b.sourceIndex);
    segment.firstQuestionNumber = segment.questions[0].questionNumber;
    segment.slotIndex = slotIndexByEpisode.get(segment.episodeKey) ?? Number.MAX_SAFE_INTEGER;
    segmentsByIdentity.get(segment.contestantIdentityKey).push(segment);
  }

  const runSeeds = [];
  for (const segments of segmentsByIdentity.values()) {
    segments.sort((a, b) => a.slotIndex - b.slotIndex || a.questions[0].sourceIndex - b.questions[0].sourceIndex);
    let current = null;
    for (const segment of segments) {
      if (!current || segment.firstQuestionNumber <= 1) {
        current = {
          contestantIdentityKey: segment.contestantIdentityKey,
          contestantName: segment.contestantName,
          segments: [],
          runRows: [],
        };
        runSeeds.push(current);
      }
      current.segments.push(segment);
    }
  }

  const seedBySegmentKey = new Map();
  for (const seed of runSeeds) {
    for (const segment of seed.segments) seedBySegmentKey.set(segment.key, seed);
  }
  const personRunRow = (row) =>
    personByIdentity.get(row.millionaireContestantIdentityKey)?.hotSeatRuns.find((item) => item.id === row.id) || row;
  const unmatchedRunRows = [];
  for (const row of contestantRuns.filter((item) => item.millionaireContestant)) {
    const key = segmentKeyFor(row.episodeKey, row.millionaireContestantIdentityKey);
    const seed = seedBySegmentKey.get(key);
    if (seed) seed.runRows.push(personRunRow(row));
    else unmatchedRunRows.push(personRunRow(row));
  }

  for (const row of unmatchedRunRows) {
    const rowSlot = slotIndexByEpisode.get(row.episodeKey) ?? -1;
    const nextSeed = runSeeds
      .filter((seed) => seed.contestantIdentityKey === row.millionaireContestantIdentityKey)
      .map((seed) => ({
        seed,
        slot: Math.min(...seed.segments.map((segment) => segment.slotIndex)),
      }))
      .filter((candidate) => candidate.slot > rowSlot)
      .sort((a, b) => a.slot - b.slot)[0];
    if (nextSeed && nextSeed.slot - rowSlot === 1 && nextSeed.seed.runRows.length === 0) {
      nextSeed.seed.runRows.push(row);
    } else {
      runSeeds.push({
        contestantIdentityKey: row.millionaireContestantIdentityKey,
        contestantName: row.millionaireContestant,
        segments: [],
        runRows: [row],
      });
    }
  }

  const catalogRuns = runSeeds.map((seed) => {
    const runQuestions = seed.segments
      .flatMap((segment) => segment.questions)
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    const runRows = [...seed.runRows].sort((a, b) =>
      (slotIndexByEpisode.get(a.episodeKey) ?? Number.MAX_SAFE_INTEGER)
        - (slotIndexByEpisode.get(b.episodeKey) ?? Number.MAX_SAFE_INTEGER)
      || a.sourceIndex - b.sourceIndex
    );
    const episodeKeys = uniqueSorted([
      ...seed.segments.map((segment) => segment.episodeKey),
      ...runRows.map((row) => row.episodeKey),
    ]).sort((a, b) =>
      (slotIndexByEpisode.get(a) ?? Number.MAX_SAFE_INTEGER)
        - (slotIndexByEpisode.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
    const knownRows = runRows.filter((row) => row.prizeStatus === "known");
    const resultRow = knownRows.at(-1) || runRows.at(-1);
    const questionEvidencePaths = new Set(
      runQuestions.flatMap((question) => question.evidence.map((item) => item.sourcePath)),
    );
    const evidence = dedupeBy(
      runRows
        .flatMap((row) => row.evidence)
        .filter((item) => !questionEvidencePaths.has(item.sourcePath)),
      (item) => item.sourcePath,
    );
    const contestant = personByIdentity.get(seed.contestantIdentityKey);
    const firstEpisode = episodeByKey[episodeKeys[0]];
    const lastEpisode = episodeByKey[episodeKeys.at(-1)];
    return {
      contestantIdentityKey: seed.contestantIdentityKey,
      contestantName: seed.contestantName,
      contestantSlug: contestant?.slug || slugBase(seed.contestantName),
      episodes: episodeKeys,
      airingDateStart: firstEpisode?.airingDate || runRows[0]?.airingDate || runQuestions[0]?.airingDate || "",
      airingDateEnd: lastEpisode?.airingDate || runRows.at(-1)?.airingDate || runQuestions.at(-1)?.airingDate || "",
      hostNames: uniqueSorted([
        ...runRows.map((row) => row.hostName),
        ...runQuestions.map((question) => question.hostName),
      ]),
      questions: runQuestions,
      questionCount: runQuestions.length,
      runRows,
      evidence,
      prizeStatus: knownRows.length
        ? "known"
        : runRows.some((row) => row.prizeStatus === "pending")
          ? "pending"
          : "unavailable",
      prizeValue: knownRows.length ? resultRow.prizeValue : null,
      winnings: knownRows.length ? resultRow.prizeWinnings : "",
      isCharity: isCharityRun(runRows, runQuestions),
      awardEpisodeKey: episodeKeys.at(-1) || "",
      firstSlotIndex: Math.min(
        ...episodeKeys.map((key) => slotIndexByEpisode.get(key) ?? Number.MAX_SAFE_INTEGER),
      ),
      firstSourceIndex: runQuestions[0]?.sourceIndex ?? runRows[0]?.sourceIndex ?? Number.MAX_SAFE_INTEGER,
      featuredEvidence: evidence[0] || runQuestions[0]?.primaryEvidence,
    };
  }).sort((a, b) =>
    a.firstSlotIndex - b.firstSlotIndex
    || a.firstSourceIndex - b.firstSourceIndex
    || a.contestantName.localeCompare(b.contestantName, "sl")
  );

  const catalogRunIds = new Map();
  const contestantRunById = new Map(contestantRuns.map((row) => [row.id, row]));
  for (const run of catalogRuns) {
    const episode = run.episodes[0] || "run";
    const base = `${episode}-${run.contestantSlug}`;
    const occurrence = (catalogRunIds.get(base) || 0) + 1;
    catalogRunIds.set(base, occurrence);
    run.id = occurrence === 1 ? base : `${base}-${occurrence}`;
    for (const question of run.questions) {
      question.runId = run.id;
      question.anchor = `q-${question.id}`;
    }
    for (const row of run.runRows) {
      row.catalogRunId = run.id;
      const originalRow = contestantRunById.get(row.id);
      if (originalRow) originalRow.catalogRunId = run.id;
    }
  }
  for (let index = 0; index < catalogRuns.length; index += 1) {
    catalogRuns[index].previousRun = catalogRuns[index - 1]?.id || "";
    catalogRuns[index].nextRun = catalogRuns[index + 1]?.id || "";
  }

  for (const episode of episodes) {
    episode.catalogRunIds = catalogRuns
      .filter((run) => run.episodes.includes(episode.key))
      .map((run) => run.id);
    episode.runCount = episode.catalogRunIds.length;
    const awardedRuns = catalogRuns.filter((run) => run.awardEpisodeKey === episode.key && run.prizeValue !== null);
    episode.moneyAwarded = awardedRuns.reduce((sum, run) => sum + run.prizeValue, 0);
    episode.charityMoney = awardedRuns.filter((run) => run.isCharity).reduce((sum, run) => sum + run.prizeValue, 0);
    episode.contestantMoney = episode.moneyAwarded - episode.charityMoney;
  }
  for (const person of people) {
    const personRuns = catalogRuns.filter((run) => run.contestantIdentityKey === person.identityKey);
    person.catalogRunIds = personRuns.map((run) => run.id);
    person.hotSeatCount = person.catalogRunIds.length;
    person.maxPrize = personRuns.reduce((maximum, run) => Math.max(maximum, run.prizeValue || 0), 0);
    person.totalWinnings = personRuns.reduce((sum, run) => sum + (run.prizeValue || 0), 0);
    person.totalContestantWinnings = personRuns
      .filter((run) => !run.isCharity)
      .reduce((sum, run) => sum + (run.prizeValue || 0), 0);
    person.furthestQuestion = personRuns.reduce(
      (maximum, run) => Math.max(maximum, ...run.questions.map((question) => question.questionNumber), 0),
      0,
    );
  }

  const seasons = [];
  for (let season = 1; season <= 10; season += 1) {
    const seasonEpisodes = episodes.filter((episode) => episode.season === season);
    const seasonQuestions = questions.filter((question) => question.season === season);
    const seasonRuns = contestantRuns.filter((run) => run.season === season);
    const seasonCatalogRuns = catalogRuns.filter((run) => run.episodes[0]?.startsWith(`s${pad2(season)}e`));
    const seasonPeople = people.filter((person) =>
      person.episodes.some((episode) => episode.season === season),
    );
    const answerDistribution = Object.fromEntries(
      ["A", "B", "C", "D"].map((letter) => [letter, seasonQuestions.filter((question) => question.correctAnswer === letter).length]),
    );
    const episodeSlots = [...seasonEpisodes];
    if (season === 6) {
      episodeSlots.push(unavailableEpisode);
      episodeSlots.sort((a, b) => a.episode - b.episode);
    }
    seasons.push({
      key: seasonKey(season),
      season,
      episodes: seasonEpisodes,
      episodeSlots,
      episodeCount: seasonEpisodes.length,
      originalEpisodeCount: season === 6 ? seasonEpisodes.length + 1 : seasonEpisodes.length,
      questions: seasonQuestions,
      questionCount: seasonQuestions.length,
      contestantRuns: seasonRuns,
      catalogRuns: seasonCatalogRuns,
      runCount: seasonCatalogRuns.length,
      people: seasonPeople.map((person) => person.name),
      peopleCount: seasonPeople.length,
      hosts: uniqueSorted(seasonEpisodes.flatMap((episode) => episode.hosts)),
      dateStart: seasonEpisodes[0]?.airingDate || "",
      dateEnd: seasonEpisodes.at(-1)?.airingDate || "",
      answerDistribution,
      moneyAwarded: seasonEpisodes.reduce((sum, episode) => sum + episode.moneyAwarded, 0),
      charityMoney: seasonEpisodes.reduce((sum, episode) => sum + episode.charityMoney, 0),
      contestantMoney: seasonEpisodes.reduce((sum, episode) => sum + episode.contestantMoney, 0),
    });
  }

  const answerDistribution = Object.fromEntries(
    ["A", "B", "C", "D"].map((letter) => [letter, questions.filter((question) => question.correctAnswer === letter).length]),
  );
  const playedQuestions = questions.filter(
    (question) => question.contestantAnswer && !question.isNoStakes,
  );
  const lifelineDistribution = Object.fromEntries(
    ["fifty-fifty", "audience", "phone", "host", "switch"].map((key) => [
      key,
      questions.filter((question) => question.lifelineKeys.includes(key)).length,
    ]),
  );
  const questionPosition = [];
  for (let number = 1; number <= 14; number += 1) {
    const atPosition = questions.filter((question) => question.questionNumber === number);
    const played = atPosition.filter((question) => question.contestantAnswer && !question.isNoStakes);
    questionPosition.push({
      number,
      total: atPosition.length,
      played: played.length,
      correct: played.filter((question) => question.isCorrect).length,
      accuracy: played.length ? played.filter((question) => question.isCorrect).length / played.length : null,
    });
  }
  const repeatedQuestions = repeatedQuestionGroups(questions);

  const prizeCounts = new Map();
  for (const run of catalogRuns) {
    if (run.prizeValue === null) continue;
    prizeCounts.set(run.prizeValue, (prizeCounts.get(run.prizeValue) || 0) + 1);
  }
  const prizeDistribution = [...prizeCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value);

  const topPeople = people
    .filter((person) => person.maxPrize > 0)
    .sort((a, b) => b.maxPrize - a.maxPrize || a.name.localeCompare(b.name, "sl"))
    .slice(0, 24);

  const uniqueEvidence = new Set([
    ...questions.flatMap((question) => question.evidence.map((item) => item.sourcePath)),
    ...contestantRuns.flatMap((run) => run.evidence.map((item) => item.sourcePath)),
  ]);

  const stats = {
    originalEpisodes: 474,
    availableEpisodes: episodes.length,
    unavailableEpisodes: 1,
    seasons: seasons.length,
    questions: questions.length,
    contestantRows: contestantRuns.length,
    hotSeatRuns: catalogRuns.length,
    people: people.length,
    evidenceImages: uniqueEvidence.size,
    totalMoneyAwarded: catalogRuns.reduce((sum, run) => sum + (run.prizeValue || 0), 0),
    charityMoneyAwarded: catalogRuns.filter((run) => run.isCharity).reduce((sum, run) => sum + (run.prizeValue || 0), 0),
    contestantMoneyAwarded: catalogRuns.filter((run) => !run.isCharity).reduce((sum, run) => sum + (run.prizeValue || 0), 0),
    dateStart: episodes[0]?.airingDate || "",
    dateEnd: episodes.at(-1)?.airingDate || "",
    answerDistribution,
    playedQuestionCount: playedQuestions.length,
    playedCorrectCount: playedQuestions.filter((question) => question.isCorrect).length,
    playedAccuracy: playedQuestions.length
      ? playedQuestions.filter((question) => question.isCorrect).length / playedQuestions.length
      : 0,
    walkAwayQuestions: questions.filter((question) => question.isWalkAway).length,
    switchedQuestions: questions.filter((question) => question.isSwitched).length,
    lifelineDistribution,
    questionPosition,
    repeatedQuestionGroups: repeatedQuestions.length,
    exactRepeatedQuestionGroups: repeatedQuestions.filter((group) => group.kind === "exact").length,
    nearRepeatedQuestionGroups: repeatedQuestions.filter((group) => group.kind === "near").length,
    prizeDistribution,
    topPeople,
    knownSourceGapQuestions: patternResults.source.known_source_gap_questions,
  };

  const questionTopics = topicResults.topics.map((item) => ({
    ...item,
    questions: item.question_indices.map((index) => questions[index]).filter(Boolean),
    examples: item.example_indices.map((index) => questions[index]).filter(Boolean),
  }));
  const topicById = Object.fromEntries(questionTopics.map((topic) => [topic.id, topic]));
  for (const topic of questionTopics) {
    for (const question of topic.questions) {
      question.topicId = topic.id;
      question.topic = topic;
    }
  }
  const rankedQuestionTopics = [...questionTopics];
  rankedQuestionTopics.forEach((topic, index) => { topic.rank = index + 1; });
  stats.questionTopics = rankedQuestionTopics.length;
  stats.topicClassifiedQuestions = rankedQuestionTopics.reduce((sum, topic) => sum + topic.count, 0);

  const searchRecords = [
    ...seasons.map((season) => ({
      type: "season",
      id: season.key,
      season: season.season,
      title: `Sezona ${pad2(season.season)} | Season ${pad2(season.season)}`,
      text: `${season.hosts.join(" ")} ${season.dateStart} ${season.dateEnd}`,
    })),
    ...episodes.map((episode) => ({
      type: "episode",
      id: episode.key,
      season: episode.season,
      title: `S${pad2(episode.season)}E${pad2(episode.episode)}`,
      text: `${episode.airingDate} ${episode.hosts.join(" ")} ${episode.people.join(" ")}`,
    })),
    {
      type: "episode",
      id: unavailableEpisode.key,
      season: 6,
      title: "S06E40",
      text: "unavailable ni na voljo original episode izvirna epizoda",
    },
    ...people.map((person) => ({
      type: "contestant",
      id: person.slug,
      season: person.episodes[0]?.season || 0,
      title: person.name,
      text: `${person.locations.join(" ")} ${person.episodes.map((episode) => episode.key.toUpperCase()).join(" ")}`,
    })),
    ...questions.map((question) => ({
      type: "question",
      id: question.id,
      runId: question.runId,
      anchor: question.anchor,
      target: `runs/${question.runId}/#${question.anchor}`,
      season: question.season,
      title: question.prompt,
      titleEn: "",
      text: `${Object.values(question.answers).join(" ")} ${question.contestantName} ${question.episodeKey.toUpperCase()} ${question.prize}`,
      meta: `${question.episodeKey.toUpperCase()} · ${question.contestantName} · Q${question.questionNumber}`,
    })),
    ...rankedQuestionTopics.map((topic) => ({
      type: "topic",
      id: topic.id,
      season: 0,
      title: topic.label_sl,
      titleEn: topic.label_en,
      text: `${topic.broad_sl} ${topic.broad_en} ${topic.description_sl} ${topic.description_en}`,
    })),
  ];

  const languages = ["sl", "en"];

  return {
    languages,
    questions,
    contestantRuns,
    runs: catalogRuns,
    people,
    seasons,
    episodes,
    originalEpisodeSlots,
    unavailableEpisode,
    episodeByKey,
    personBySlug: Object.fromEntries(people.map((person) => [person.slug, person])),
    runById: Object.fromEntries(catalogRuns.map((run) => [run.id, run])),
    stats,
    searchRecords,
    patternResults,
    topicResults,
    questionTopics,
    rankedQuestionTopics,
    topicById,
    repeatedQuestionGroups: repeatedQuestions,
    questionPositionPages: questionPosition.flatMap((position) =>
      languages.map((lang) => ({ lang, position }))),
    seasonPages: seasons.flatMap((season) => languages.map((lang) => ({ lang, season }))),
    episodePages: episodes.flatMap((episode) => languages.map((lang) => ({ lang, episode }))),
    unavailableEpisodePages: languages.map((lang) => ({ lang, episode: unavailableEpisode })),
    contestantPages: people.flatMap((person) => languages.map((lang) => ({ lang, person }))),
    runPages: catalogRuns.flatMap((run) => languages.map((lang) => ({ lang, run }))),
    topicPages: questionTopics.flatMap((topic) => languages.map((lang) => ({ lang, topic }))),
    questionAuditByRow: Object.fromEntries([...questionAuditByRow.entries()].map(([index, entry]) => [String(index), entry])),
    profileAuditByKey,
  };
}
