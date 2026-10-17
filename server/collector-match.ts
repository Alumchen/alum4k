import type { MediaItem } from "./types";
import { matchesExact } from "../shared/catalog";
import { isSeasonNumber } from "../shared/seasons";

function normalized(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[._\s-]+/g, " ").trim();
}

export function matchCollectorTarget(items: MediaItem[], input: { mediaId?: string; title?: string; year?: number; seasonNumber?: unknown }, filename: string) {
  const source = normalized(filename);
  const years = [...filename.matchAll(/(?:^|[\s._()[\]-])((?:18|19|20|21)\d{2})(?=$|[\s._()[\]-])/g)].map((match) => Number(match[1]));
  const detectedSeasons = [...filename.matchAll(/(?:(?<![a-z0-9])S(\d{1,3})(?=E\d|[^a-z0-9]|$)|第\s*(\d{1,3})\s*季)/gi)].map((match) => Number(match[1] || match[2]));
  const hasSeasonRange = /(?<![a-z0-9])S\d{1,3}\s*[-~至]\s*S?\d{1,3}/i.test(filename);
  const seasonSet = [...new Set(detectedSeasons)];
  if (hasSeasonRange || seasonSet.length > 1) throw new Error("检测到多季合集，请人工确认资源归属，未追加。");
  const explicitSeason = input.seasonNumber;
  if (explicitSeason !== undefined && !isSeasonNumber(explicitSeason)) throw new Error("季数不正确，未追加。");
  if (explicitSeason !== undefined && seasonSet.length && explicitSeason !== seasonSet[0]) throw new Error("指定季数与种子名称不一致，未追加。");
  const candidates = items.filter((item) => {
    if (input.mediaId) return item.id === input.mediaId;
    if (input.year !== undefined && item.year !== input.year) return false;
    if (input.title) return matchesExact(item, input.title);
    const names = [item.title, item.originalTitle, ...(item.aliases ?? [])].filter((name): name is string => !!name);
    const prefix = names.some((name) => {
      const key = normalized(name);
      if (!key || !source.startsWith(key)) return false;
      const suffix = source.slice(key.length);
      if (!suffix) return true;
      if (/^[[({【（]/u.test(suffix)) return true;
      if (!suffix.startsWith(" ")) return false;
      const metadata = suffix.trimStart();
      return /^[[({【（]/u.test(metadata) || /^(?:(?:18|19|20|21)\d{2}|\d{3,4}p|4k|uhd|web|bluray|blu ray|remux|hdr10\+?|s\d{1,3}(?:e\d+)?|complete|extended|uncut)(?=$|[^a-z0-9])/i.test(metadata) || /^(?:第\s*\d+\s*季|全\s*\d+\s*集|全集)/u.test(metadata);
    });
    if (!prefix) return false;
    // A TV season's release year need not equal the series premiere year.
    return item.mediaType === "tv" && seasonSet.length === 1 || !years.length || item.year !== undefined && years.includes(item.year);
  });
  if (candidates.length !== 1) throw new Error(candidates.length ? "存在多个可能匹配的已有影视，请指定影视 ID，未追加。" : "未找到匹配的已有影视，不会新建条目。");
  const target = candidates[0];
  let seasonNumber = explicitSeason ?? seasonSet[0];
  if (target.mediaType === "movie") {
    if (seasonNumber !== undefined) throw new Error("电影资源检测到季数，请人工确认，未追加。");
  } else if (target.seasons?.length) {
    if (seasonNumber === undefined && target.seasons.length === 1) seasonNumber = target.seasons[0].number;
    if (seasonNumber === undefined || !target.seasons.some((season) => season.number === seasonNumber)) throw new Error("无法确认目标季数，请指定已有的季数，未追加。");
  }
  return { target, seasonNumber };
}
