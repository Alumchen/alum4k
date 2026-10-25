export interface AiImage { id: string; name: string; mime: string; size: number; width: number; height: number; }
export interface AiImageInput { name: string; mime: string; base64: string; }
export interface AiRichNode { tag?: string; text?: string; href?: string; imageId?: string; children?: AiRichNode[]; }
export interface AiPresentation { nodes: AiRichNode[]; snapshot?: AiImage; images: AiImage[]; warning?: string; }
export interface AiChatMessage {
  id: string; requestId: string; role: "user" | "assistant"; text: string;
  status: "pending" | "complete" | "error" | "cancelled"; createdAt: string;
  code?: string; error?: string; submitted?: boolean;
  images?: AiImage[]; presentation?: AiPresentation;
  inputDigest?: string;
}
export interface AiChat { id: string; toolId: string; title: string; createdAt: string; updatedAt: string; messages: AiChatMessage[]; }
export interface StoredAiChat extends AiChat { remoteUrl?: string; }
export function supportsWebRelay(tool: { url: string }) {
  try { const url = new URL(tool.url); return url.origin === "https://chatgpt.com" && url.pathname === "/" && !url.search && !url.hash; } catch { return false; }
}
