import { ArrowDown, ArrowUp, BellPlus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { Bulletin } from "../shared/site";
import { readSmallImage } from "./imageUpload";

export default function BulletinEditor({ items, onChange }: { items: Bulletin[]; onChange: (items: Bulletin[]) => void }) {
  const [error, setError] = useState(""); const [uploading, setUploading] = useState("");
  const latestItems = useRef(items); latestItems.current = items;
  function update(id: string, patch: Partial<Bulletin>) { onChange(latestItems.current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function move(index: number, offset: number) { const next = [...items]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); }
  return <div className="bulletin-editor">
    <div className="admin-toolbar"><h2>公告与广告</h2><div className="toolbar-spacer" /><button type="button" disabled={items.length >= 20} onClick={() => onChange([...items, { id: crypto.randomUUID(), type: "announcement", enabled: true, title: "", content: "", link: "", image: "" }])}><BellPlus size={16} />添加公告 / 广告</button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {items.map((item, index) => <div className="bulletin-edit-row" key={item.id}>
      <div className="admin-toolbar"><select aria-label={`公告${index + 1}类型`} value={item.type} onChange={(event) => update(item.id, { type: event.target.value as Bulletin["type"] })}><option value="announcement">公告</option><option value="advertisement">广告</option></select>
        <label className="switch-field"><input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked })} />发布</label><div className="toolbar-spacer" />
        <button type="button" title="上移" disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" title="下移" disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
        <button type="button" title="删除公告" onClick={() => { if (window.confirm("删除这条公告或广告？")) onChange(items.filter((entry) => entry.id !== item.id)); }}><Trash2 size={16} /></button>
      </div>
      <label className="admin-wide-field">标题<input required maxLength={80} value={item.title} onChange={(event) => update(item.id, { title: event.target.value })} /></label>
      <label className="admin-wide-field">正文<textarea aria-label="正文" rows={4} maxLength={2000} value={item.content} onChange={(event) => update(item.id, { content: event.target.value })} /></label>
      <label className="admin-wide-field">跳转链接<input type="url" maxLength={2000} value={item.link} onChange={(event) => update(item.id, { link: event.target.value })} /></label>
      <div className="bulletin-image-controls">{item.image ? <img src={item.image} alt="公告图片预览" /> : null}
        <label className="upload-control"><Upload size={16} />{uploading === item.id ? "上传中…" : "上传图片"}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`公告${index + 1}图片`} disabled={Boolean(uploading)} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(item.id); setError(""); try { update(item.id, { image: await readSmallImage(file) }); } catch (error) { setError(error instanceof Error ? error.message : "图片读取失败。"); } finally { setUploading(""); event.target.value = ""; } }} /></label>
        <button type="button" disabled={!item.image} title="移除公告图片" onClick={() => update(item.id, { image: "" })}><Trash2 size={16} /></button>
      </div>
    </div>)}
  </div>;
}
