export interface MediaSeason {
  number: number;
  name: string;
  episodeCount?: number;
  airDate?: string;
  posterPath?: string;
  status?: string;
}
interface SeriesFields {
  mediaType?: string;
  seasons?: MediaSeason[];
  selectedSeason?: number;
  episodeCount?: number;
  status?: string;
  resources?: Array<{ seasonNumber?: number }>;
}
export function isSeasonNumber(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000; }
export function isEpisodeCount(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10000; }
export function seasonLabel(number: number) { return number === 0 ? "特别篇" : `第 ${number} 季`; }
export function seasonStatus(season?: Pick<MediaSeason, "status" | "episodeCount">, fallback = "待更新") {
  return season?.status?.trim() || (season?.episodeCount ? `全${season.episodeCount}集` : fallback);
}
export function episodeStatus(mediaType?: string, episodeCount?: number, status?: string) {
  if (status?.trim() && !/^(?:全\d+集|正片)$|^待/.test(status.trim())) return status.trim();
  return episodeCount ? `全${episodeCount}集` : status?.trim() || (mediaType === "movie" ? "正片" : "待更新");
}
export function getSeasons(item: SeriesFields): MediaSeason[] {
  if (item.mediaType !== "tv") return [];
  const result = new Map<number, MediaSeason>();
  for (const season of Array.isArray(item.seasons) ? item.seasons : []) {
    if (season && isSeasonNumber(season.number)) result.set(season.number, { ...season, name: season.name || seasonLabel(season.number) });
  }
  for (const resource of Array.isArray(item.resources) ? item.resources : []) {
    if (isSeasonNumber(resource?.seasonNumber) && !result.has(resource.seasonNumber)) result.set(resource.seasonNumber, { number: resource.seasonNumber, name: seasonLabel(resource.seasonNumber) });
  }
  return [...result.values()].sort((left, right) => left.number - right.number);
}
export function selectedSeasonNumber(item: SeriesFields) {
  const seasons = getSeasons(item);
  return seasons.find((season) => season.number === item.selectedSeason)?.number ?? seasons.find((season) => season.number > 0)?.number ?? seasons[0]?.number;
}
export function resourcesForSeason<T extends { seasonNumber?: number }>(resources: T[], number?: number): T[] {
  return number === undefined ? resources : resources.filter((resource) => resource.seasonNumber === undefined || resource.seasonNumber === number);
}
export function mergeSeasons(incoming: MediaSeason[] = [], previous: MediaSeason[] = []) {
  const seasons = new Map(previous.map((season) => [season.number, season]));
  for (const season of incoming) {
    const old = seasons.get(season.number);
    const status = old?.status && old.status !== seasonStatus({ episodeCount: old.episodeCount }) ? old.status : season.status;
    seasons.set(season.number, { ...old, ...season, episodeCount: season.episodeCount ?? old?.episodeCount, status });
  }
  return [...seasons.values()].sort((left, right) => left.number - right.number);
}
export function validateSeasonFields(input: SeriesFields) {
  if (input.episodeCount !== undefined && !isEpisodeCount(input.episodeCount)) throw new Error("影视集数需为 0-10000 的整数。");
  if (input.selectedSeason !== undefined && !isSeasonNumber(input.selectedSeason)) throw new Error("季编号需为 0-1000 的整数。");
  if (input.seasons !== undefined) {
    if (!Array.isArray(input.seasons) || input.seasons.length > 200) throw new Error("每部剧最多保存 200 季。");
    const numbers = new Set<number>();
    for (const season of input.seasons) {
      if (!season || !isSeasonNumber(season.number) || numbers.has(season.number)) throw new Error("季编号不能重复，需为 0-1000 的整数。");
      numbers.add(season.number);
      if (season.episodeCount !== undefined && !isEpisodeCount(season.episodeCount)) throw new Error("每季集数需为 0-10000 的整数。");
      for (const [key, maximum] of [["name", 100], ["status", 100], ["airDate", 20], ["posterPath", 2000]] as const) {
        if (season[key] !== undefined && (typeof season[key] !== "string" || season[key]!.length > maximum)) throw new Error("分季资料格式或长度不正确。");
      }
    }
  }
  for (const resource of Array.isArray(input.resources) ? input.resources : []) {
    if (resource?.seasonNumber !== undefined && !isSeasonNumber(resource.seasonNumber)) throw new Error("资源所属季需为 0-1000 的整数。");
  }
}
