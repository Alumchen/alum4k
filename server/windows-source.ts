import { parse, parseFragment, type DefaultTreeAdapterMap } from "parse5";
import crypto from "node:crypto";
import { windowsDefaults, type WindowsStore, type WindowsResource } from "../shared/windows";

type Node = DefaultTreeAdapterMap["node"];
function plain(node: Node): string { if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value; if (["script", "style"].includes(node.nodeName)) return ""; return (["p", "div", "li"].includes(node.nodeName) ? "\n" : "") + ("childNodes" in node ? node.childNodes.map(plain).join("") : "") + (["br", "p", "div", "li"].includes(node.nodeName) ? "\n" : ""); }
function scripts(node: Node): string[] { if (node.nodeName === "script" && "childNodes" in node) return node.childNodes.map((child) => child.nodeName === "#text" ? (child as DefaultTreeAdapterMap["textNode"]).value : ""); return "childNodes" in node ? node.childNodes.flatMap(scripts) : []; }
export function parseWindowsSource(html: string): WindowsStore {
  const script = scripts(parse(html)).find((script) => /^\s*items:\s*\[/m.test(script));
  const line = script?.split(/\r?\n/).find((line) => /^\s*items:\s*\[/.test(line));
  if (!line) throw new Error("来源页面结构已变化，未找到资源清单。原有数据未改动。");
  // Parse the JSON data literal only; never execute scripts from the source site.
  const start = line.indexOf("["); const end = line.lastIndexOf("]");
  const groups = JSON.parse(line.slice(start, end + 1));
  if (!Array.isArray(groups) || groups.length > 100) throw new Error("来源分类格式不正确。");
  const categories: string[] = []; const items: WindowsResource[] = []; const ids = new Set<string>();
  for (const group of groups) {
    if (typeof group?.category !== "string" || !group.category || !Array.isArray(group.list)) continue;
    if (!categories.includes(group.category)) categories.push(group.category);
    let heading = "";
    for (const entry of group.list) {
      if (entry?.type === "divider") { heading = plain(parseFragment(String(entry.content || ""))).trim(); continue; }
      if (typeof entry?.title !== "string" || !entry.title.trim()) continue;
      const sourceId = String(entry.id || crypto.createHash("sha256").update(group.category + entry.title).digest("hex").slice(0, 24));
      let id = `hw-${sourceId.replace(/[^\w-]/g, "-")}`;
      if (ids.has(id)) id += "-" + crypto.createHash("sha256").update(group.category + entry.title).digest("hex").slice(0, 12);
      if (ids.has(id)) continue; ids.add(id);
      const links = Array.isArray(entry.links) ? entry.links.filter((link: any) => link && !link.hide && typeof link.url === "string" && link.url && typeof link.name === "string").map((link: any) => ({ name: link.name, url: link.url })) : [];
      const info = plain(parseFragment(String(entry.info || ""))).trim().split("\n").filter((line) => /^(?:文件|大小|SHA[- ]?1|SHA[- ]?256|MD5|日期|版本|语言|File|Size|Date|Build|提取码)\s*[:：]/i.test(line.trim())).join("\n");
      items.push({ id, sourceId, category: group.category, group: heading, title: entry.title, architecture: typeof entry.bit === "string" ? entry.bit : "", edition: typeof entry.type === "string" ? entry.type : "", activation: typeof entry.activation === "string" ? entry.activation : "", date: typeof entry.date === "string" ? entry.date : "", info, links, published: true });
    }
  }
  if (!items.length) throw new Error("来源没有可采集的公开资源。原有数据未改动。");
  return { revision: 0, settings: windowsDefaults, categories, items, source: "https://hellowindows.cn/", collectedAt: new Date().toISOString() };
}
export async function collectWindowsSource() {
  const response = await fetch("https://hellowindows.cn/", { signal: AbortSignal.timeout(25000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error(`来源请求失败（HTTP ${response.status}），原有数据未改动。`);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2_000_000) throw new Error("来源页面超过大小限制。"); chunks.push(value); } } catch (error) { await reader.cancel(); throw error; }
  return parseWindowsSource(Buffer.concat(chunks).toString("utf8"));
}
