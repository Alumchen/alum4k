import { createElement, useEffect, useState } from "react";
import { Download, Image as ImageIcon } from "lucide-react";
import type { AiChatMessage, AiImage, AiRichNode } from "../shared/ai-chat";
import { getAuthToken } from "./api";

export function AiPrivateImage({ image, chatId, snapshot = false }: { image: AiImage; chatId: string; snapshot?: boolean }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false; let objectUrl = ""; const abort = new AbortController();
    fetch(`/api/ai/chats/${chatId}/images/${image.id}`, { headers: { authorization: `Bearer ${getAuthToken()}` }, signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("图片读取失败或访问权限已失效。");
      objectUrl = URL.createObjectURL(await response.blob()); if (!cancelled) setUrl(objectUrl);
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [chatId, image.id]);
  return <span className={snapshot ? "ai-private-image snapshot" : "ai-private-image"}>{url ? <><img src={url} alt={image.name} width={image.width} height={image.height} /><a href={url} download={image.name} title={snapshot ? "下载回答原貌" : "下载图片"} aria-label={snapshot ? "下载回答原貌" : "下载图片"}><Download size={15} /></a></> : <span role="status"><ImageIcon size={16} />{error || "正在加载图片…"}</span>}</span>;
}
export default function AiResponse({ message, chatId }: { message: AiChatMessage; chatId: string }) {
  const [mode, setMode] = useState<"snapshot" | "rich" | "text">("snapshot");
  const presentation = message.presentation;
  if (!presentation) return null;
  function render(node: AiRichNode, key: number): React.ReactNode {
    if (node.text !== undefined) return node.text;
    if (node.imageId) { const image = presentation!.images.find(image=>image.id===node.imageId); return image ? <AiPrivateImage key={key} image={image} chatId={chatId} /> : <span key={key}>[图片未保存]</span>; }
    const tag = node.tag || "div";
    const allowed = /^(div|p|span|h[1-6]|strong|b|em|i|s|del|u|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|br|hr|a|sup|sub)$/;
    if (!allowed.test(tag)) return null;
    const props = tag === "a" && /^https?:\/\//i.test(node.href || "") ? { key, href: node.href, target: "_blank", rel: "noopener noreferrer nofollow" } : { key };
    return createElement(tag, props, node.children?.length ? node.children.map(render) : undefined);
  }
  return <div className="ai-response"><div className="ai-response-modes" role="group" aria-label="回答显示方式">{([ ["snapshot","原貌"], ["rich","排版"], ["text","文字"] ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} disabled={value==="snapshot"&&!presentation.snapshot} onClick={()=>setMode(value)}>{label}</button>)}</div>{mode === "snapshot" && presentation.snapshot ? <AiPrivateImage image={presentation.snapshot} chatId={chatId} snapshot /> : mode === "text" ? <div className="ai-response-text">{message.text}</div> : <div className="ai-rich-document ai-markdown">{presentation.nodes.map(render)}</div>}{presentation.warning ? <p className="ai-reply-error" role="status">{presentation.warning}</p> : null}</div>;
}
