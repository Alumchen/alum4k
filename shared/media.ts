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

export function extractDownloadLink(type: "115" | "magnet", input: string) {
  const text = input.trim();
  const candidates = text.match(type === "115" ? /https?:\/\/[^\s<>"|，。]+/gi : /magnet:\?[^\s<>"|，。]+/gi) ?? [];
  const urls = [...new Set(candidates.map((candidate) => candidate.replace(/[)）\]】；;]+$/g, "")).filter((url) => isDownloadUrl(type, url)))];
  if (urls.length !== 1) throw new Error(urls.length ? "每个输入框请只粘贴一条链接。" : "未找到有效链接，请检查粘贴内容。");
  const code = type === "115" ? text.match(/(?:提取码|访问码|访问密码)\s*[:：]?\s*([a-z0-9]{4,12})/i)?.[1] : undefined;
  return { url: urls[0], code };
}

export function resourceHref(value: string): string | undefined {
  const text = value.trim();
  if (/\s/.test(text)) return undefined;
  try {
    const url = new URL(text);
    return ["https:", "http:", "magnet:"].includes(url.protocol) && !url.username && !url.password ? text : undefined;
  } catch { return undefined; }
}
