import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSettings } from "./api";
import { defaultSettings, type SiteSettings, type SiteTheme } from "../shared/site";

const themeKey = "alum4k:public-theme";
type PersonalTheme = "light" | "dark";
function savedTheme(): PersonalTheme | null {
  try { const value = localStorage.getItem(themeKey); return value === "light" || value === "dark" ? value : null; }
  catch { return null; }
}
const SiteContext = createContext({ settings: defaultSettings, setSettings: (_settings: SiteSettings) => {}, theme: "dark" as SiteTheme, toggleTheme: () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [personalTheme, setPersonalTheme] = useState(savedTheme);
  const admin = /^\/admin(?:\/|$)/.test(location.pathname);
  const theme = !admin && personalTheme ? personalTheme : settings.branding.theme;
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setPersonalTheme(next);
    try { localStorage.setItem(themeKey, next); } catch { /* The choice still applies when storage is unavailable. */ }
  }
  useEffect(() => {
    function sync(event: StorageEvent) { if (event.key === themeKey || event.key === null) setPersonalTheme(savedTheme()); }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { fetchSettings().then(setSettings).catch(() => undefined); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const title = settings.seo.title || settings.branding.name;
    if (admin) document.title = settings.seo.adminTitle || `${title} · 管理后台`;
    for (const [name, content] of admin ? [["description", settings.seo.description], ["robots", "noindex, nofollow"]] : []) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!meta) { meta = document.createElement("meta"); meta.name = name; document.head.append(meta); }
      meta.content = content;
    }
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.append(icon); }
    icon.href = settings.branding.logo || "/brand.svg";
  }, [settings.branding, settings.seo, admin]);
  return <SiteContext.Provider value={{ settings, setSettings, theme, toggleTheme }}>{children}</SiteContext.Provider>;
}

export function useSite() { return useContext(SiteContext); }
export function BrandMark() {
  const { settings } = useSite();
  return <img className="brand-logo" src={settings.branding.logo || "/brand.svg"} alt="" />;
}
