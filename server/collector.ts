import { inspectMetadata, maximumMetadataBytes } from "../scripts/115-collector/metadata.mjs";
import { appendCollectorResource, loadLibrary } from "./library";
import { getTmdbDetail, hasTmdbCredentials, searchTmdb } from "./tmdb";
import { matchesExact } from "../shared/catalog";
import { isSeasonNumber } from "../shared/seasons";
import type { MediaItem } from "./types";
import { matchCollectorTarget } from "./collector-match";

export async function importCollectorResource(input: Record<string, unknown>, existingOnly = false) {
  if (!input || typeof input !== "object" || typeof input.magnet !== "string" || typeof input.torrent !== "string" || input.torrent.length > Math.ceil(maximumMetadataBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.torrent)) throw new Error("缺少有效的种子元数据，未上传。");
  const checkedAt = typeof input.checkedAt === "string" ? Date.parse(input.checkedAt) : NaN;
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 10 * 60000 || checkedAt > Date.now() + 30000) throw new Error("检测记录已过期，请重新检测后上传。");
  const metadata = await inspectMetadata(input.magnet, Buffer.from(input.torrent, "base64"));
  const text = (key: string, maximum: number) => {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > maximum || /[\x00-\x1f]/.test(value)) throw new Error("采集资料格式不正确。");
    return value.trim();
  };
  const title = text("title", 100); const mediaId = text("mediaId", 100); const resourceTitle = text("resourceTitle", 160); const sourceUpdatedAt = text("sourceUpdatedAt", 10);
  if (sourceUpdatedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(sourceUpdatedAt) || !Number.isFinite(Date.parse(sourceUpdatedAt)) || new Date(sourceUpdatedAt).toISOString().slice(0, 10) !== sourceUpdatedAt)) throw new Error("来源更新时间不正确。");
  if (!existingOnly && input.mediaType !== "movie" && input.mediaType !== "tv") throw new Error("请指定电影或多集类型。");
  const year = input.year;
  if (year !== undefined && (!Number.isInteger(year) || Number(year) < 1800 || Number(year) > 2199)) throw new Error("年份不正确。");
  const items = await loadLibrary();
  let target: Partial<MediaItem> | undefined;
  let seasonNumber = input.seasonNumber;
  if (existingOnly) {
    const matched = matchCollectorTarget(items, { mediaId, title, year: year as number | undefined, seasonNumber }, metadata.name);
    target = matched.target; seasonNumber = matched.seasonNumber;
  } else if (mediaId) {
    target = items.find((item) => item.id === mediaId);
    if (!target) throw new Error("指定影视不存在，未上传。");
  } else {
    if (!title || year === undefined) throw new Error("请设置准确影视名和年份，或指定已有影视 ID，未上传。");
    const exact = (item: MediaItem) => item.mediaType === input.mediaType && item.year === year && matchesExact(item, title);
    const local = items.filter(exact);
    if (local.length > 1) throw new Error("存在多个同名影视，请指定影视 ID，未上传。");
    target = local[0];
    if (!target) {
      if (!hasTmdbCredentials()) throw new Error("本地无匹配影视且未配置 TMDB，未上传。");
      const remote = (await searchTmdb(title)).filter(exact);
      if (remote.length !== 1) throw new Error("TMDB 未找到唯一精确匹配，请人工确认影视，未上传。");
      target = await getTmdbDetail(remote[0].mediaType, remote[0].tmdbId!);
    }
  }
  if (!existingOnly && target.mediaType !== input.mediaType) throw new Error("影视类型与目标不一致，未上传。");
  if (seasonNumber !== undefined && (target.mediaType !== "tv" || !isSeasonNumber(seasonNumber))) throw new Error("季数不正确。");
  if (target.mediaType === "tv" && (target.seasons?.length ?? 0) > 0 && (seasonNumber === undefined || !target.seasons!.some((season) => season.number === seasonNumber))) throw new Error("多季影视请指定已有的季数，避免绑定错季。");
  return appendCollectorResource(target, {
    id: `magnet-${metadata.hash}`, type: "magnet", title: resourceTitle || metadata.name || "磁力资源",
    url: `magnet:?xt=urn:btih:${metadata.hash}`, access: "vip", size: metadata.size,
    resolution: metadata.resolution, qualityLabel: metadata.qualityLabel,
    sourceUpdatedAt: sourceUpdatedAt ? `${sourceUpdatedAt}T00:00:00+08:00` : undefined,
    seasonNumber: seasonNumber as number | undefined
  }, metadata.hash, existingOnly || items.some((item) => item.id === target.id));
}
