import path from "node:path";
import { sitePath } from "./site-path.mjs";

export const pad2 = (value) => String(value).padStart(2, "0");

export function splitSemicolon(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function slugBase(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "oseba";
}

export function normalizedLetter(value) {
  const letter = String(value || "").trim().toUpperCase();
  return /^[ABCD]$/.test(letter) ? letter : "";
}

export function parseMoney(value) {
  const source = String(value || "").trim();
  if (!/EUR/i.test(source)) return null;
  const digits = source.replace(/[^0-9]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

export function episodeKey(season, episode) {
  return `s${pad2(season)}e${pad2(episode)}`;
}

export function seasonKey(season) {
  return `s${pad2(season)}`;
}

export function publicEvidenceParts(sourcePath) {
  const normalized = String(sourcePath || "").replaceAll("\\", "/");
  const match = normalized.match(/^work\/(s\d{2}e\d{2})_frames\/(.+\.jpg)$/i);
  if (!match || match[2].split("/").includes("..")) return null;
  return {
    episode: match[1].toLowerCase(),
    nestedPath: match[2],
    url: sitePath(`/assets/evidence/${match[1].toLowerCase()}/${match[2]}`),
  };
}

export function classifyEvidence(sourcePath) {
  const name = path.basename(String(sourcePath || "")).toLowerCase();
  if (/(lineup|name_?strap|contestants?)/.test(name)) return "lineup";
  if (/(fast|ff\d*).*(winner|result)|(?:winner|result).*(fast|ff\d*)/.test(name)) return "fast-result";
  if (/(fast|ff\d*).*(order|board|option)|(?:order|board|option).*(fast|ff\d*)/.test(name)) return "fast-board";
  if (/(audience|glas_ljudstva|poll)/.test(name)) return "audience";
  if (/(phone|klic)/.test(name)) return "phone";
  if (/(half|polovicka|50_?50)/.test(name)) return "fifty-fifty";
  if (/(final|prize|dobitek|winnings)/.test(name)) return "winnings";
  if (/(charity|intro|strap|identity|portrait|profile)/.test(name)) return "identity";
  if (/(correct|green|reveal|wrong_answer)/.test(name)) return "reveal";
  if (/(board|options?|full_question|question)/.test(name)) return "board";
  return "evidence";
}

function evidenceFileName(item) {
  return path.basename(String(item?.sourcePath || item?.nestedPath || item?.url || "")).toLowerCase();
}

function explicitCorrectOutcomeScore(item) {
  const name = evidenceFileName(item);
  if (/(?:^|[_-])(?:transient|unstable|sliding|onset|partial|cropped?)(?=[_.-]|$)/.test(name)) {
    return 0;
  }
  if (/(?:^|[_-])green\d*(?=[_.-]|$)/.test(name)) return 500;
  if (/(?:^|[_-])correct\d*(?=[_.-]|$)/.test(name)) return 400;
  return 0;
}

function bestExplicitCorrectOutcome(items) {
  let selected;
  let selectedScore = 0;
  for (const item of items) {
    const score = explicitCorrectOutcomeScore(item);
    if (score > selectedScore) {
      selected = item;
      selectedScore = score;
    }
  }
  return selected;
}

function isRevealState(item) {
  const name = evidenceFileName(item);
  return item?.kind === "reveal"
    || /(?:^|[_-])(?:correct|green|reveal)\d*(?=[_.-]|$)/.test(name);
}

function completeBoardScore(item) {
  const name = evidenceFileName(item);
  if (/(?:^|[_-])confirmed[_-]?orange(?=[_.-]|$)/.test(name)) return 300;
  if (/(?:^|[_-])(?:half|polovicka|50_?50)(?=[_.-]|$)/.test(name)) return 0;
  if (/(?:^|[_-])(?:correct|green|reveal|answer|lock|selected|selection|orange|wrong)\d*(?=[_.-]|$)/.test(name)) {
    return 0;
  }
  if (/(?:^|[_-])options?\d*(?=[_.-]|$)/.test(name)) return 500;
  if (/(?:^|[_-])full(?:[_-]?(?:board|question))?\d*(?=[_.-]|$)/.test(name)) return 450;
  if (/(?:^|[_-])board\d*(?=[_.-]|$)/.test(name)) return 400;
  return 0;
}

function bestCompleteBoard(items) {
  let selected;
  let selectedScore = 0;
  for (const item of items) {
    const score = completeBoardScore(item);
    if (score > selectedScore) {
      selected = item;
      selectedScore = score;
    }
  }
  return selected;
}

function noteBoardPreference(notes) {
  const text = String(notes || "").toLowerCase();
  const supplementalBoard = /supplemental[^.]{0,100}(?:(?:complete|full)[ -]?board|all four options)/.test(text);
  const incompleteOutcome = [
    "reveal camera crop",
    "green reveal is in a close-up",
    "green only after the board starts sliding",
    "never renders a green answer panel",
    "never displays a stable green state",
    "sharp settled full board is the best available primary",
  ].some((marker) => text.includes(marker));
  return { supplementalBoard, incompleteOutcome, preferred: supplementalBoard || incompleteOutcome };
}

function declaredCompleteBoard(items, notes, explicitBoard, primaryOutcome) {
  const preference = noteBoardPreference(notes);
  if (explicitBoard) return { item: explicitBoard, preferred: preference.preferred };
  if (!preference.preferred) return { item: undefined, preferred: false };

  if (preference.supplementalBoard) {
    const supplemental = items.find((item) =>
      item.url !== primaryOutcome?.url
      && !["audience", "phone", "winnings", "identity"].includes(item.kind));
    if (supplemental) return { item: supplemental, preferred: true };
  }

  const settledFullState = items.find((item) =>
    /(?:^|[_-])(?:confirmed[_-]?orange|settled[_-]?yellow)(?=[_.-]|$)/.test(evidenceFileName(item)));
  return { item: settledFullState || items[0], preferred: true };
}

function isQuestionState(item) {
  if (["audience", "phone", "fifty-fifty", "identity", "lineup", "fast-result", "fast-board"].includes(item?.kind)) {
    return false;
  }
  const name = evidenceFileName(item);
  return ["board", "reveal"].includes(item?.kind)
    || /(?:^|[_-])(?:options?|full|board|question|correct|green|reveal|answer|lock|orange|selected|selection|wrong)\d*(?=[_.-]|$)/.test(name);
}

function withDisplayKind(item, displayKind) {
  return item ? { ...item, displayKind } : item;
}

function auditedQuestionEvidence(evidence, audit) {
  if (!audit || !["verified", "accepted"].includes(String(audit.status || "").toLowerCase())) {
    return null;
  }
  const bySourcePath = new Map(evidence.map((item) => [item.sourcePath, item]));
  const primary = bySourcePath.get(String(audit.primary || "").trim());
  if (!primary) return null;
  const supplemental = [...new Set((Array.isArray(audit.supplemental) ? audit.supplemental : [])
    .map((sourcePath) => bySourcePath.get(String(sourcePath || "").trim()))
    .filter(Boolean)
    .filter((item) => item.url !== primary.url))];
  const primaryKind = audit.primaryKind || (audit.greenSettled ? "reveal" : primary.kind);
  const displayPrimary = withDisplayKind(primary, primaryKind);
  const fiftyFiftyException = Boolean(audit.fiftyFiftyException);
  return {
    primary: displayPrimary,
    supplemental: supplemental.map((item) => item.url === primary.url ? item : withDisplayKind(item, item.kind)),
    mode: fiftyFiftyException ? "verified-fifty-fifty" : "verified-correct-outcome",
    hasCompleteBoard: Boolean(audit.allFourVisible || fiftyFiftyException),
    hasExplicitCorrectOutcome: Boolean(audit.greenSettled),
    auditVerified: true,
  };
}

export function selectQuestionEvidence(items, { lifelineKeys = [], notes = "", audit = null } = {}) {
  const evidence = [...new Map((items || []).map((item) => [item.url, item])).values()];
  if (!evidence.length) {
    return {
      primary: undefined,
      supplemental: [],
      mode: "question-image",
      hasCompleteBoard: false,
      hasExplicitCorrectOutcome: false,
    };
  }

  const audited = auditedQuestionEvidence(evidence, audit);
  if (audited) return audited;

  const usesFiftyFifty = lifelineKeys.includes("fifty-fifty");
  const explicitCorrect = bestExplicitCorrectOutcome(evidence);
  const reveal = evidence.find((item) => isRevealState(item)
    && !/(?:^|[_-])(?:transient|unstable|sliding|onset|partial|cropped?)(?=[_.-]|$)/.test(evidenceFileName(item)))
    || evidence.find(isRevealState);
  const outcome = explicitCorrect || reveal;
  const explicitBoard = bestCompleteBoard(evidence);
  const board = declaredCompleteBoard(evidence, notes, explicitBoard, outcome);
  const useBoard = Boolean(board.item) && (usesFiftyFifty || board.preferred);
  const primary = useBoard ? board.item : outcome || evidence[0];

  let mode = "question-image";
  let displayPrimary = primary;
  if (useBoard) {
    mode = usesFiftyFifty ? "before-fifty-fifty" : "complete-board";
    displayPrimary = withDisplayKind(primary, "board");
  } else if (explicitCorrect && primary.url === explicitCorrect.url) {
    mode = "correct-outcome";
    displayPrimary = withDisplayKind(primary, "reveal");
  } else if (isRevealState(primary)) {
    mode = "answer-state";
    displayPrimary = withDisplayKind(primary, "reveal");
  }

  let supplemental;
  if (useBoard) {
    const primaryAlreadyShowsAnswerState = isRevealState(primary);
    const supportingOutcome = explicitCorrect && explicitCorrect.url !== primary.url
      ? explicitCorrect
      : primaryAlreadyShowsAnswerState
        ? undefined
        : evidence.find((item) => item.url !== primary.url && isRevealState(item));
    supplemental = evidence
      .filter((item) => {
        if (item.url === primary.url) return false;
        if (item.url === supportingOutcome?.url) return true;
        return !isQuestionState(item);
      })
      .map((item) => item.url === supportingOutcome?.url ? withDisplayKind(item, "reveal") : item);
  } else if (explicitCorrect && primary.url === explicitCorrect.url) {
    supplemental = evidence.filter((item) => item.url !== primary.url && !isQuestionState(item));
  } else {
    supplemental = evidence.filter((item) => item.url !== primary.url);
  }

  return {
    primary: displayPrimary,
    supplemental,
    mode,
    hasCompleteBoard: Boolean(board.item),
    hasExplicitCorrectOutcome: Boolean(explicitCorrect),
  };
}

export function evidenceRecords(value) {
  return splitSemicolon(value).map((sourcePath) => {
    const publicParts = publicEvidenceParts(sourcePath);
    if (!publicParts) {
      throw new Error(`Unsafe or unsupported evidence path: ${sourcePath}`);
    }
    return {
      sourcePath,
      url: publicParts.url,
      episode: publicParts.episode,
      nestedPath: publicParts.nestedPath,
      kind: classifyEvidence(sourcePath),
    };
  });
}
