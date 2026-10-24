export interface WindowsLink { name: string; url: string; }
export interface WindowsResource { id: string; category: string; group: string; title: string; architecture: string; edition: string; activation: string; date: string; info: string; links: WindowsLink[]; published: boolean; sourceId: string; }
export interface WindowsSettings { name: string; description: string; notice: string; }
export interface WindowsStore { revision: number; settings: WindowsSettings; categories: string[]; items: WindowsResource[]; source: string; collectedAt: string; }
export const windowsDefaults: WindowsSettings = { name: "AlumWindows", description: "Windows / Server / Office 系统软件资源仓储", notice: "资源信息与下载链接采集自 HelloWindows，本站不存储安装文件。第三方链接可能变更，下载后请自行核对校验值及软件授权。" };
export function windowsHref(value: string) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } }
export function defaultWindowsCategory(categories: string[]) { return categories.find((name) => /Windows\s*11.*version/i.test(name)) || categories[0] || ""; }
