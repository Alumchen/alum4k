import crypto from "node:crypto";

export function magnetLinks(text) {
  if (typeof text !== "string" || text.length > 32768) return [];
  const found = new Map();
  for (const match of text.matchAll(/magnet:\?[^\s<>"'\x00-\x1f]+/gi)) {
    const original = match[0].replace(/[。，；、)\]]+$/u, "");
    if (original.length > 10000) continue;
    try {
      const url = new URL(original);
      if (url.protocol !== "magnet:" || url.host || url.pathname || url.hash) continue;
      const hashes = [...new Set(url.searchParams.getAll("xt").map((xt) => /^urn:btih:([a-f0-9]{40})$/i.exec(xt)?.[1]?.toLowerCase()).filter(Boolean))];
      if (hashes.length !== 1) continue;
      if (!found.has(hashes[0])) found.set(hashes[0], { hash: hashes[0], magnet: original, displayName: (url.searchParams.get("dn") || "").replace(/[\x00-\x1f]/g, "").slice(0, 500) });
    } catch { /* Only complete SHA-1 BTIH magnets enter this collector. */ }
  }
  return [...found.values()];
}

export const categories = ["电影", "电视剧", "综艺", "动漫", "少儿", "短剧", "纪录片", "游戏"];
export const resolutions = ["", "2160p / 4K", "1080p", "720p", "480p", "其他"];
export function cleanContext(input = {}) {
  const text = (key, maximum) => {
    const value = input[key] === undefined ? "" : String(input[key]).trim();
    if (value.length > maximum || /[\x00-\x1f]/.test(value)) throw new Error(`${key}: invalid text or length.`);
    return value;
  };
  const title = text("title", 100); const resourceTitle = text("resourceTitle", 160); const size = text("size", 80); const quality = text("quality", 40);
  const category = input.category || "电影"; const mediaType = input.mediaType || (category === "电影" ? "movie" : "tv");
  const year = input.year === undefined || input.year === "" ? undefined : Number(input.year);
  if (year !== undefined && (!Number.isInteger(year) || year < 1800 || year > 2199)) throw new Error("year: expected 1800-2199.");
  if (!categories.includes(category) || !["movie", "tv"].includes(mediaType) || !resolutions.includes(quality)) throw new Error("Invalid category, media type or quality.");
  const mediaId = text("mediaId", 100);
  const sourceUpdatedAt = text("sourceUpdatedAt", 10);
  if (sourceUpdatedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(sourceUpdatedAt) || !Number.isFinite(Date.parse(sourceUpdatedAt)) || new Date(sourceUpdatedAt).toISOString().slice(0, 10) !== sourceUpdatedAt)) throw new Error("Invalid source update date.");
  const seasonNumber = input.seasonNumber === undefined || input.seasonNumber === "" ? undefined : Number(input.seasonNumber);
  if (seasonNumber !== undefined && (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 1000)) throw new Error("Invalid season number.");
  return { title, year, category, mediaType, resourceTitle, size, quality, ...(mediaId ? { mediaId } : {}), ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}), ...(seasonNumber !== undefined ? { seasonNumber } : {}) };
}

export function addMagnets(records, text, context = {}, now = new Date().toISOString()) {
  const next = records.slice(); const known = new Set(records.map((item) => item.hash)); const added = [];
  const metadata = cleanContext(context);
  const texts = Array.isArray(text) ? text : [text];
  if (texts.length > 100000) throw new Error("Too many input lines.");
  for (const value of texts) {
    for (const link of magnetLinks(value)) {
      if (known.has(link.hash)) continue;
      const item = { ...link, ...metadata, collectedAt: now };
      known.add(item.hash); next.push(item); added.push(item);
    }
  }
  if (next.length > 100000) throw new Error("Collector record limit reached.");
  return { records: next, added };
}

export function validateCollection(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.records) || input.records.length > 100000) throw new Error("Invalid collector file; existing data was not changed.");
  const hashes = new Set();
  for (const item of input.records) {
    const parsed = magnetLinks(item?.magnet);
    if (parsed.length !== 1 || parsed[0].hash !== item.hash || parsed[0].magnet !== item.magnet || hashes.has(item.hash) || typeof item.collectedAt !== "string" || !Number.isFinite(Date.parse(item.collectedAt))) throw new Error("Invalid or duplicate stored magnet; existing data was not changed.");
    const context = cleanContext(item);
    for (const key of ["title", "category", "mediaType", "resourceTitle", "size", "quality"]) if (typeof item[key] !== "string" || item[key] !== context[key]) throw new Error("Invalid stored collector metadata.");
    if (item.year !== context.year || typeof item.displayName !== "string" || item.displayName.length > 500 || /[\x00-\x1f]/.test(item.displayName)) throw new Error("Invalid stored collector metadata.");
    for (const key of ["mediaId", "seasonNumber", "sourceUpdatedAt"]) if (item[key] !== context[key]) throw new Error("Invalid stored collector target or source date.");
    hashes.add(item.hash);
  }
  return input.records;
}

export function libraryDraft(records) {
  const groups = new Map();
  for (const item of records) {
    if (!item.title) continue;
    const key = JSON.stringify([item.title.normalize("NFKC"), item.year ?? null, item.mediaType, item.category]);
    if (!groups.has(key)) groups.set(key, { id: `collector-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`, title: item.title, year: item.year, mediaType: item.mediaType, category: item.category, categoryMode: "manual", access: "会员", resources: [] });
    groups.get(key).resources.push({ id: `magnet-${item.hash}`, type: "magnet", title: item.resourceTitle || item.displayName.slice(0, 160) || "磁力资源", url: item.magnet, size: item.size || undefined, resolution: item.quality || undefined, access: "vip" });
  }
  return [...groups.values()];
}
