import { mediaPath, type CatalogItem } from "./catalog";
import type { SiteSettings } from "./site";
export function pageMetadata(settings: SiteSettings, item?: CatalogItem & { overview: string; posterPath?: string }, missing = false) {
  const site = settings.seo.title || settings.branding.name;
  if (settings.access.requireLogin) return { title: `登录 - ${site}`, description: settings.seo.description, path: "/", image: "", robots: "noindex, nofollow" };
  return { title: missing ? `影视不存在 - ${site}` : item ? `${item.title}${item.year ? ` (${item.year})` : ""} - ${site}` : site,
    description: missing ? "该影视不存在或已经删除。" : item ? `${item.title}，${item.category}${item.year ? `，${item.year}` : ""}。${item.overview}`.slice(0, 180) : settings.seo.description,
    path: item ? mediaPath(item) : "/", image: item?.posterPath || "", robots: missing ? "noindex, follow" : "index, follow" };
}
