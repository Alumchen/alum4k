import { useEffect } from "react";
import { pageMetadata } from "../shared/seo";
import { useSite } from "./SiteContext";
import type { MediaItem } from "./types";

export default function usePageSeo(item: MediaItem | undefined, missing: boolean, search = false) {
  const { settings } = useSite();
  useEffect(() => {
    const metadata = pageMetadata(settings, item, missing); const canonical = (settings.seo.siteUrl || location.origin) + metadata.path;
    document.title = metadata.title;
    for (const [attribute, name, content] of [["name", "description", metadata.description], ["name", "robots", missing || search ? "noindex, follow" : metadata.robots], ["property", "og:title", metadata.title], ["property", "og:description", metadata.description], ["property", "og:url", canonical], ["property", "og:image", metadata.image]]) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      if (!content) { meta?.remove(); continue; }
      if (!meta) { meta = document.createElement("meta"); meta.setAttribute(attribute, name); document.head.append(meta); }
      meta.content = content;
    }
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.append(link); } link.href = canonical;
  }, [settings, item, missing, search]);
}
