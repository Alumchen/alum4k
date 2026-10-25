export interface AiTool { id: string; name: string; description: string; url: string; enabled: boolean; order: number; }
export interface AiSettings { name: string; description: string; notice: string; allowedUsers: string[]; }
export interface AiStore { revision: number; settings: AiSettings; tools: AiTool[]; }
export interface AiDesktop { id: string; websocketPath: string; toolId: string; }
export function aiTarget(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2000) throw new Error("请填写有效的 HTTPS 网站地址。");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes(".") || /^\d+(\.\d+){3}$/.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error("只允许公开的 HTTPS 网站，不允许内网地址或带密码的地址。");
  return url.href;
}
