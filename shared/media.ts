export const mediaCategories = ["电影", "电视剧", "综艺", "动漫", "少儿", "短剧", "纪录片", "游戏"];

export function classifyMedia(item: { mediaType: "movie" | "tv"; genres?: string[] }) {
  const genres = new Set((item.genres ?? []).map((genre) => genre.trim().toLowerCase()));
  const has = (...names: string[]) => names.some((name) => genres.has(name));
  if (has("儿童", "少儿", "kids")) return "少儿";
  if (has("动画", "动漫", "animation")) return "动漫";
  if (has("纪录", "纪录片", "documentary")) return "纪录片";
  if (has("真人秀", "脱口秀", "reality", "talk")) return "综艺";
  return item.mediaType === "movie" ? "电影" : "电视剧";
}

export function isDownloadUrl(type: "115" | "magnet", value: string) {
  try {
    const url = new URL(value.trim());
    if (type === "magnet") {
      return url.protocol === "magnet:" && url.searchParams.getAll("xt").some((xt) =>
        /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(xt) || /^urn:btmh:1220[a-f0-9]{64}$/i.test(xt)
      );
    }
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      (url.hostname === "115.com" || url.hostname.endsWith(".115.com"));
  } catch {
    return false;
  }
}
