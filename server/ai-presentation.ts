import type { Locator } from "playwright";
import { saveAiImage } from "./ai-assets";
import type { AiPresentation, AiRichNode } from "../shared/ai-chat";

export async function captureAiReply(response: Locator, username: string, chatId: string): Promise<AiPresentation> {
  const warnings: string[] = [];
  const media = response.locator("img");
  for (let index = 0; index < await media.count(); index++) {
    const image = media.nth(index); if (!await image.isVisible()) continue;
    await image.evaluate((element) => (element as HTMLImageElement).loading = "eager");
    try { await image.evaluate(async (element) => { const image = element as HTMLImageElement; await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error("Image timeout")), 8000))]); if (!image.naturalWidth) throw new Error("Image unavailable"); }); } catch { warnings.push("部分网页图片未加载完成。"); }
  }
  // Extract a bounded, inert document tree. No provider HTML, scripts, CSS or remote URLs are replayed.
  const tree = await response.evaluate((element) => {
    const allowed = new Set(["div","p","span","h1","h2","h3","h4","h5","h6","strong","b","em","i","s","del","u","ul","ol","li","blockquote","pre","code","table","thead","tbody","tr","th","td","br","hr","a","sup","sub"]);
    const skip = new Set(["SCRIPT","STYLE","BUTTON","INPUT","TEXTAREA","SELECT","IFRAME","VIDEO","AUDIO","FORM"]);
    let count = 0; let characters = 0; let images = 0;
    const visit = { walk(node: Node, depth: number): AiRichNode | null {
      if (++count > 3000 || depth > 30 || characters > 60000) return null;
      if (node.nodeType === Node.TEXT_NODE) { const text = (node.textContent || "").slice(0,60000-characters); characters += text.length; return { text }; }
      if (!(node instanceof Element) || skip.has(node.tagName)) return null;
      const style = getComputedStyle(node); if (style.display === "none" || style.visibility === "hidden" || node.getAttribute("aria-hidden") === "true") return null;
      if (node.tagName === "IMG" || node.tagName.toLowerCase() === "svg" || node.tagName.toLowerCase() === "math" || node.classList.contains("katex")) {
        if (images >= 12) return { text: "[图片数量超过本地排版上限，请查看原貌]" };
        const imageId = String(images++); node.setAttribute("data-alum-capture", imageId); return { tag: "img", imageId };
      }
      const tag = node.tagName.toLowerCase(); const children = Array.from(node.childNodes).map(child=>visit.walk(child,depth+1)).filter((node): node is AiRichNode=>!!node);
      const href = tag === "a" && ["https:","http:"].some(scheme=>(node.getAttribute("href") || "").startsWith(scheme+"//")) ? node.getAttribute("href") : undefined;
      return { tag: allowed.has(tag) ? tag : "div", ...(href ? { href } : {}), children };
    } };
    return { nodes: [visit.walk(element,0)].filter((node): node is AiRichNode=>!!node), images };
  });
  const result: AiPresentation = { nodes: tree.nodes, images: [] };
  for (let index = 0; index < tree.images; index++) {
    const image = response.locator(`[data-alum-capture="${index}"]`); const box = await image.boundingBox();
    try {
      if (!box || box.width < 1 || box.width > 1800 || box.height > 8000 || box.width * box.height > 12000000) throw new Error("Image too large");
      const asset = await saveAiImage(username, chatId, await image.screenshot({ type: "png", animations: "disabled", scale: "css", timeout: 10000 }), "回答图片.png");
      result.images.push(asset);
      function replace(nodes: AiRichNode[]) { for (const node of nodes) { if (node.imageId === String(index)) node.imageId = asset.id; if (node.children) replace(node.children); } } replace(result.nodes);
    } catch { warnings.push("部分图片未能保存，请检查原貌或账号网页。"); }
  }
  try {
    const box = await response.boundingBox();
    if (!box || box.width < 1 || box.width > 1800 || box.height > 16000 || box.width * box.height > 28000000) throw new Error("Snapshot exceeds limit");
    result.snapshot = await saveAiImage(username, chatId, await response.screenshot({ type: "png", animations: "disabled", scale: "css", timeout: 15000 }), "回答原貌.png", "image/png", true);
  } catch { warnings.push("原貌快照未能完整保存，已保留可恢复的排版和文字。"); }
  if (warnings.length) result.warning = [...new Set(warnings)].join(" ");
  return result;
}
