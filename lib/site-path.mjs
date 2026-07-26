function normalizeBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.includes("?") || raw.includes("#")) {
    throw new Error(`Invalid CATALOG_BASE_PATH: ${raw}`);
  }
  const normalized = `/${raw.replace(/^\/+|\/+$/g, "")}`;
  if (normalized.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid CATALOG_BASE_PATH: ${raw}`);
  }
  return normalized;
}

export const siteBase = normalizeBasePath(process.env.CATALOG_BASE_PATH);

export function sitePath(value = "/") {
  const source = String(value || "/");
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(source)) return source;
  const pathname = source.startsWith("/") ? source : `/${source}`;
  if (!siteBase || pathname === siteBase || pathname.startsWith(`${siteBase}/`)) return pathname;
  return `${siteBase}${pathname}`;
}
