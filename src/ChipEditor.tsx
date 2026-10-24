import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import Dialog from "./Dialog";
import { postKinds, type ChipPost, type PublicChipPost } from "../shared/xinsj";

export default function ChipEditor({ item, categories, admin = false, onClose, onSave }: { item?: ChipPost | PublicChipPost; categories: string[]; admin?: boolean; onClose: () => void; onSave: (value: ChipPost) => Promise<void> }) {
  const [draft, setDraft] = useState({ title: "", content: "", category: categories[0], kind: "文章", tags: [], cover: "", link: "", status: "published", pinned: false, featured: false, locked: false, reviewNote: "", ...item } as ChipPost);
  const [tags, setTags] = useState(item?.tags.join("，") || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [baseline] = useState(() => JSON.stringify({ ...draft, tagText: tags }));
  function patch(value: Partial<ChipPost>) { setDraft({ ...draft, ...value }); }
  function close() { if (!busy && (JSON.stringify({ ...draft, tagText: tags }) === baseline || confirm("放弃未保存的编辑？"))) onClose(); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onSave({ ...draft, tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) }); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "保存失败。"); } finally { setBusy(false); } }
  return <Dialog title={item ? "编辑帖子" : "发布内容"} className="chip-editor" onClose={close}><form className="auth-fields" onSubmit={submit}>
    <label>标题<input value={draft.title} required maxLength={160} onChange={(event) => patch({ title: event.target.value })} /></label>
    <div className="chip-field-pair"><label>技术分类<select aria-label="技术分类" value={draft.category} onChange={(event) => patch({ category: event.target.value })}>{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label>内容类型<select aria-label="内容类型" value={draft.kind} onChange={(event) => patch({ kind: event.target.value as ChipPost["kind"] })}>{postKinds.map((name) => <option key={name}>{name}</option>)}</select></label></div>
    <label>正文<textarea rows={9} required maxLength={40000} value={draft.content} onChange={(event) => patch({ content: event.target.value })} /></label>
    <label>标签<input maxLength={150} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔，最多6个" /></label>
    <label>封面图片地址<input type="url" maxLength={2000} value={draft.cover} onChange={(event) => patch({ cover: event.target.value })} /></label>
    <label>视频或资料链接<input type="url" maxLength={2000} value={draft.link} onChange={(event) => patch({ link: event.target.value })} /></label>
    {admin ? <><label>发布状态<select aria-label="发布状态" value={draft.status} onChange={(event) => patch({ status: event.target.value as ChipPost["status"] })}><option value="published">已发布</option><option value="pending">待审核</option><option value="rejected">未通过</option></select></label><div className="chip-checks">{([['pinned', '置顶'], ['featured', '精华'], ['locked', '关闭评论']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={(event) => patch({ [key]: event.target.checked })} />{label}</label>)}</div><label>审核说明<textarea maxLength={1000} rows={2} value={draft.reviewNote} onChange={(event) => patch({ reviewNote: event.target.value })} /></label></> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}<button disabled={busy} className="primary-action" type="submit"><Save size={16} />{busy ? "正在保存…" : "提交帖子"}</button>
  </form></Dialog>;
}
