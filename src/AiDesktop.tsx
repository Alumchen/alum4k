import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Copy, Keyboard, Maximize, Minimize, Monitor, PlugZap, Unplug, X } from "lucide-react";
import Dialog from "./Dialog";
import { writeJson } from "./api";
import type RFB from "@novnc/novnc/lib/rfb";
import type { AiDesktop as Desktop } from "../shared/ai";

export default function AiDesktop({ session, name, onClose }: { session: Desktop; name: string; onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null); const wrapper = useRef<HTMLDivElement>(null); const client = useRef<RFB | null>(null);
  const [status, setStatus] = useState("正在连接远程画面…"); const [connected, setConnected] = useState(false); const [scale, setScale] = useState(true); const [clipboard, setClipboard] = useState(false); const [text, setText] = useState(""); const [received, setReceived] = useState(""); const [error, setError] = useState(""); const [full, setFull] = useState(false); const [clipBusy, setClipBusy] = useState(false);
  useEffect(() => {
    let cancelled = false; let instance: RFB | undefined;
    import("@novnc/novnc/lib/rfb").then(({ default: Remote }) => {
      if (cancelled || !surface.current) return;
      const url = new URL(session.websocketPath, location.origin); url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      instance = new Remote(surface.current, url.href, { shared: true }); client.current = instance; instance.scaleViewport = true; instance.background = "#171c21";
      instance.addEventListener("connect", () => { if (!cancelled) { setConnected(true); setStatus("已连接"); } });
      instance.addEventListener("disconnect", () => { if (!cancelled) { setConnected(false); setStatus("远程连接已断开，请关闭后重新打开。"); } });
      instance.addEventListener("securityfailure", () => { if (!cancelled) { setConnected(false); setStatus("远程桌面验证失败，请联系管理员。"); } });
    }).catch(() => { if (!cancelled) setStatus("远程桌面组件加载失败，请重新加载页面。"); });
    return () => { cancelled = true; instance?.disconnect(); client.current = null; };
  }, [session.id]);
  useEffect(() => { if (client.current) { client.current.scaleViewport = scale; client.current.clipViewport = !scale; client.current.dragViewport = !scale; } }, [scale]);
  useEffect(() => { function changed() { setFull(!!document.fullscreenElement); } document.addEventListener("fullscreenchange", changed); return () => document.removeEventListener("fullscreenchange", changed); }, []);
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await wrapper.current?.requestFullscreen(); } catch { setStatus("当前浏览器不支持全屏。"); } }
  async function paste() { if (!client.current || !connected || clipBusy) return; setClipBusy(true); setError(""); try { await writeJson(`/api/ai/sessions/${session.id}/clipboard`, "POST", { text }); client.current?.sendKey(0xffe3, "ControlLeft", true); client.current?.sendKey(0x76, "KeyV"); client.current?.sendKey(0xffe3, "ControlLeft", false); setClipboard(false); client.current?.focus(); } catch (error) { setError((error as Error).message); } finally { setClipBusy(false); } }
  return <section className="ai-desktop" ref={wrapper}><header><div><span className={connected ? "ai-dot online" : "ai-dot"} /><strong>{name}</strong><span className="ai-desktop-status" role="status">{status}</span></div><div className="ai-desktop-tools"><button title={scale ? "原始尺寸" : "适应窗口"} aria-label={scale ? "原始尺寸" : "适应窗口"} onClick={() => setScale(!scale)}><Monitor size={17} /></button><button title="远程剪贴板" aria-label="远程剪贴板" disabled={!connected} onClick={() => { setClipboard(true); setError(""); }}><ClipboardPaste size={17} /></button><button title="发送回车" aria-label="发送回车" disabled={!connected} onClick={() => client.current?.sendKey(0xff0d, "Enter")}><Keyboard size={17} /></button><button title={full ? "退出全屏" : "全屏"} aria-label={full ? "退出全屏" : "全屏"} onClick={fullscreen}>{full ? <Minimize size={17} /> : <Maximize size={17} />}</button><button title="关闭远程浏览器" aria-label="关闭远程浏览器" onClick={onClose}><Unplug size={17} /></button></div></header><div className="ai-remote-surface" ref={surface} />{!connected ? <div className="ai-remote-status"><PlugZap size={30} /><p>{status}</p></div> : null}
    {clipboard ? <Dialog title="远程剪贴板" onClose={() => setClipboard(false)} className="ai-clipboard"><label>发送文本<textarea aria-label="发送文本" maxLength={20000} rows={7} value={text} onChange={(event) => setText(event.target.value)} /></label><button className="primary-action" disabled={!text || !connected || clipBusy} onClick={paste}><ClipboardPaste size={16} />粘贴到远程窗口</button><button disabled={clipBusy || !connected} onClick={async () => { setClipBusy(true); setError(""); try { const result = await writeJson<{ text: string }>(`/api/ai/sessions/${session.id}/clipboard/read`, "POST"); setReceived(result.text); if (!result.text) setError("远程剪贴板为空或没有文本。"); } catch (error) { setError((error as Error).message); } finally { setClipBusy(false); } }}>读取远程剪贴板</button>{received ? <><label>远程复制的文本<textarea aria-label="远程复制的文本" readOnly rows={5} value={received} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(received); setError("已复制到本机剪贴板。"); } catch { setError("无法写入本机剪贴板，请从文本框手动复制。"); } }}><Copy size={16} />复制到本机</button></> : null}{error ? <p role="status">{error}</p> : null}</Dialog> : null}
  </section>;
}
