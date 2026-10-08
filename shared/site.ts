export const themes = [
  { value: "dark", label: "深色", background: "#101415", surface: "#191e20" },
  { value: "light", label: "浅色", background: "#f4f6f8", surface: "#ffffff" },
  { value: "graphite", label: "石墨灰", background: "#242628", surface: "#303336" },
  { value: "forest", label: "森林绿", background: "#10201b", surface: "#1b3028" }
] as const;
export type SiteTheme = typeof themes[number]["value"];
export interface Announcement {
  enabled: boolean;
  title: string;
  content: string;
  frequency: "session" | "daily" | "always";
  revision: string;
}
export interface SiteSettings {
  branding: { name: string; logo: string; theme: SiteTheme };
  announcement: Announcement;
  seo: { title: string; adminTitle: string; description: string; siteUrl?: string };
  bulletins: Bulletin[];
}
export interface Bulletin {
  id: string;
  type: "announcement" | "advertisement";
  enabled: boolean;
  title: string;
  content: string;
  link: string;
  image: string;
}
export const defaultSettings: SiteSettings = {
  branding: { name: "Alum4K", logo: "", theme: "dark" },
  announcement: { enabled: false, title: "站点公告", content: "", frequency: "session", revision: "initial" },
  seo: { title: "", adminTitle: "", description: "影视资料、115 网盘与磁力下载资源。", siteUrl: "" },
  bulletins: []
};
