import path from "node:path";
import { slugBase } from "./catalog-utils.mjs";

function nameTokens(name) {
  return slugBase(name)
    .split("-")
    .filter((token) => token.length >= 3);
}

function frameTokens(item) {
  return new Set(
    slugBase(path.basename(item.nestedPath, path.extname(item.nestedPath)))
      .split("-")
      .filter(Boolean),
  );
}

function selectFromContestantIntroduction(run, person, allowedUrls) {
  const entrantIndex = run.entrants.findIndex((entrant) => entrant.identityKey === person.identityKey);
  if (entrantIndex < 0) return null;

  const frames = run.evidence.filter((item) => item.kind === "lineup");
  if (!frames.length) return null;

  const entrants = run.entrants.map((entrant) => ({
    identityKey: entrant.identityKey,
    tokens: nameTokens(entrant.name),
  }));
  const ownership = new Map();
  for (const entrant of entrants) {
    for (const token of new Set(entrant.tokens)) {
      ownership.set(token, (ownership.get(token) || 0) + 1);
    }
  }

  const tokensByFrame = frames.map(frameTokens);
  const repeatedContextTokens = new Set(
    [...ownership.keys()].filter((token) => tokensByFrame.every((tokens) => tokens.has(token))),
  );
  const uniqueTokensFor = (entrant) => entrant.tokens.filter(
    (token) => ownership.get(token) === 1 && !repeatedContextTokens.has(token),
  );
  const targetTokens = uniqueTokensFor(entrants[entrantIndex]);
  const otherTokens = new Set(
    entrants
      .filter((_, index) => index !== entrantIndex)
      .flatMap(uniqueTokensFor),
  );

  const explicitlyNamed = frames
    .map((item, index) => {
      const tokens = tokensByFrame[index];
      const targetMatches = targetTokens.filter((token) => tokens.has(token)).length;
      const otherMatches = [...otherTokens].filter((token) => tokens.has(token)).length;
      return { item, index, targetMatches, otherMatches };
    })
    .filter(({ item, targetMatches, otherMatches }) =>
      allowedUrls.has(item.url) && targetMatches > 0 && otherMatches === 0
    )
    .sort((a, b) => b.targetMatches - a.targetMatches || a.index - b.index)[0];
  if (explicitlyNamed) return explicitlyNamed.item;

  // Many older episodes contain one unnamed introduction frame per entrant in
  // the same order as the contestant list. Use that mapping only when the two
  // sequences have the same length and the candidate is not labelled for
  // somebody else.
  if (frames.length === entrants.length) {
    const candidate = frames[entrantIndex];
    const candidateTokens = tokensByFrame[entrantIndex];
    const namesAnotherEntrant = [...otherTokens].some((token) => candidateTokens.has(token));
    if (allowedUrls.has(candidate.url) && !namesAnotherEntrant) return candidate;
  }

  return null;
}

export function selectContestantProfileImage(person, contestantRuns, logicalRuns, episodeByKey = {}) {
  for (const appearance of person.lineupAppearances) {
    const allowedUrls = new Set(
      (appearance.evidence || [])
        .filter((item) => item.kind === "lineup")
        .map((item) => item.url),
    );
    if (!allowedUrls.size) continue;

    const matchingRuns = contestantRuns.filter((run) =>
      run.episodeKey === appearance.episodeKey &&
      run.entrants.some((entrant) => entrant.identityKey === person.identityKey)
    );
    for (const run of matchingRuns) {
      const image = selectFromContestantIntroduction(run, person, allowedUrls);
      if (image) return { item: image, source: "contestant-introduction" };
    }
  }

  // A hot-seat identity frame is an intentional fallback for contestants who
  // have no usable introduction portrait. Shared boards and result screens are
  // deliberately not used as profile images.
  const identityFrame = logicalRuns
    .flatMap((run) => run.evidence || [])
    .find((item) => item.kind === "identity");
  if (identityFrame) return { item: identityFrame, source: "hot-seat" };

  // A question frame still identifies the contestant more clearly than a
  // monogram when no dedicated introduction image survives in the archive.
  const questionFrame = person.questions
    .map((question) => question.primaryEvidence || question.evidence?.[0])
    .find(Boolean);
  if (questionFrame) return { item: questionFrame, source: "question" };

  // Fastest Finger First-only contestants may have only a shared segment
  // image. Keep the profile visual and link it to the earliest appearance.
  const sharedFrame = person.lineupAppearances
    .flatMap((appearance) => appearance.evidence || [])
    .find(Boolean);
  if (sharedFrame) return { item: sharedFrame, source: "shared-segment" };

  const episodeFrame = person.episodes
    .map((episode) => episodeByKey[episode.key]?.featuredEvidence)
    .find(Boolean);
  return episodeFrame ? { item: episodeFrame, source: "episode" } : null;
}
