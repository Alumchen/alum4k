import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { fetchSettings } from "./api";
import { defaultSettings, type SiteSettings } from "../shared/site";

const SiteContext = createContext({ settings: defaultSettings, setSettings: (_settings: SiteSettings) => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  useEffect(() => { fetchSettings().then(setSettings).catch(() => undefined); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.branding.theme;
    document.title = settings.branding.name;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (settings.branding.logo) {
      if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.append(icon); }
      icon.href = settings.branding.logo;
    } else { icon?.remove(); }
  }, [settings.branding]);
  return <SiteContext.Provider value={{ settings, setSettings }}>{children}</SiteContext.Provider>;
}

export function useSite() { return useContext(SiteContext); }
export function BrandMark() {
  const { settings } = useSite();
  return settings.branding.logo ? <img className="brand-logo" src={settings.branding.logo} alt="" />
    : <span className="brand-mark"><Play size={16} fill="currentColor" /></span>;
}
