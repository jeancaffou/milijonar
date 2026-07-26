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
  if (/(charity|intro|strap)/.test(name)) return "identity";
  if (/(correct|green|reveal|wrong_answer)/.test(name)) return "reveal";
  if (/(board|options?|full_question|question)/.test(name)) return "board";
  return "evidence";
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
