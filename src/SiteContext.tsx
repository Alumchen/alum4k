import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSettings } from "./api";
import { defaultSettings, type SiteSettings } from "../shared/site";

const SiteContext = createContext({ settings: defaultSettings, setSettings: (_settings: SiteSettings) => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  useEffect(() => { fetchSettings().then(setSettings).catch(() => undefined); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.branding.theme;
    const admin = /^\/admin(?:\/|$)/.test(location.pathname);
    const title = settings.seo.title || settings.branding.name;
    document.title = admin ? settings.seo.adminTitle || `${title} · 管理后台` : title;
    for (const [name, content] of [["description", settings.seo.description], ["robots", admin ? "noindex, nofollow" : "index, follow"]]) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!meta) { meta = document.createElement("meta"); meta.name = name; document.head.append(meta); }
      meta.content = content;
    }
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.append(icon); }
    icon.href = settings.branding.logo || "/brand.svg";
  }, [settings.branding, settings.seo]);
  return <SiteContext.Provider value={{ settings, setSettings }}>{children}</SiteContext.Provider>;
}

export function useSite() { return useContext(SiteContext); }
export function BrandMark() {
  const { settings } = useSite();
  return <img className="brand-logo" src={settings.branding.logo || "/brand.svg"} alt="" />;
}
