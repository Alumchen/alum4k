export interface CatalogItem {
  id: string; mediaType: "movie" | "tv"; title: string; originalTitle?: string; aliases?: string[]; tmdbId?: number;
  category: string; region: string; genres: string[]; year?: number; rating?: number; createdAt?: string; updatedAt?: string; featured?: boolean;
  resources?: { access?: "free" | "vip"; availability?: string }[];
}

export function latestCategoryItems<T extends CatalogItem>(items: T[], category: string, limit: number): T[] {
  const timestamp = (item: T) => Date.parse(item.updatedAt || item.createdAt || "") || 0;
  return items.filter((item) => item.category === category).sort((a, b) => timestamp(b) - timestamp(a) || (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id)).slice(0, limit);
}
export interface CatalogFilters { category: string; genre: string; access: string; region: string; year: string; rating: string; resources: string; sort: string; }
export const defaultFilters: CatalogFilters = { category: "首页", genre: "全部", access: "全部", region: "全部", year: "全部", rating: "全部", resources: "全部", sort: "热门" };
export function normalizeSearch(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[《》<>"']/g, "").replace(/[\s._\-:：·，,。/\\]+/g, "");
}
export function matchesExact(item: CatalogItem, query: string) {
  const term = normalizeSearch(query);
  return Boolean(term) && ([item.title, item.originalTitle, ...(item.aliases ?? [])].some((value) => value && normalizeSearch(value) === term) || String(item.tmdbId ?? "") === query.trim());
}
export function suggestMedia<T extends CatalogItem>(items: T[], query: string) {
  const term = normalizeSearch(query);
  if (!term) return [];
  return items.map((item) => {
    const names = [item.title, item.originalTitle, ...(item.aliases ?? [])].map(normalizeSearch);
    const score = matchesExact(item, query) ? 3 : names.some((name) => name.startsWith(term)) ? 2 : names.some((name) => name.includes(term)) ? 1 : 0;
    return { item, score };
  }).filter((entry) => entry.score).sort((a, b) => b.score - a.score || (b.item.rating ?? 0) - (a.item.rating ?? 0)).slice(0, 8).map((entry) => entry.item);
}
export function filterCatalog<T extends CatalogItem>(items: T[], filters: CatalogFilters, query = "") {
  const next = items.filter((item) => {
    const usable = item.resources ?? [];
    return (!query || matchesExact(item, query)) && (filters.category === "首页" || item.category === filters.category) &&
      (filters.genre === "全部" || item.genres.includes(filters.genre)) && (filters.region === "全部" || item.region === filters.region) &&
      (filters.year === "全部" || String(item.year) === filters.year) && (filters.rating === "全部" || (item.rating ?? 0) >= Number(filters.rating)) &&
      (filters.resources === "全部" || (filters.resources === "有资源" ? usable.length > 0 : usable.length === 0)) &&
      (filters.access === "全部" || usable.some((resource) => filters.access === "免费" ? resource.access === "free" : resource.access !== "free"));
  });
  if (filters.sort === "高分好评") next.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (filters.sort === "最新上架") next.sort((a, b) => (Date.parse(b.createdAt ?? "") || (b.year ?? 0)) - (Date.parse(a.createdAt ?? "") || (a.year ?? 0)));
  return next;
}
export function mediaPath(item: Pick<CatalogItem, "id" | "mediaType">) { return `/${item.mediaType}/${encodeURIComponent(item.id)}`; }
export function parseDetailPath(pathname: string): { id: string; mediaType: "movie" | "tv" } | null {
  const match = /^\/(movie|tv)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try { const id = decodeURIComponent(match[2]); return id && !/[\/\\\x00-\x1f]/.test(id) ? { id, mediaType: match[1] as "movie" | "tv" } : null; } catch { return null; }
}
export function readCatalogUrl(url: URL) {
  const filters = { ...defaultFilters };
  for (const key of Object.keys(filters) as (keyof CatalogFilters)[]) filters[key] = url.searchParams.get(key) || filters[key];
  if (!["全部", "免费", "VIP"].includes(filters.access)) filters.access = "全部";
  if (!["全部", "有资源", "待补资源"].includes(filters.resources)) filters.resources = "全部";
  if (!["全部", "7", "8", "9"].includes(filters.rating)) filters.rating = "全部";
  if (!["热门", "最新上架", "高分好评"].includes(filters.sort)) filters.sort = "热门";
  return { filters, query: (url.searchParams.get("q") ?? "").slice(0, 100) };
}
export function catalogPath(filters: CatalogFilters, query: string) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  for (const key of Object.keys(filters) as (keyof CatalogFilters)[]) if (filters[key] !== defaultFilters[key]) params.set(key, filters[key]);
  return params.size ? `/?${params}` : "/";
}
