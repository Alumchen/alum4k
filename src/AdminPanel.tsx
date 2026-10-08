import {
  ArrowLeft, Bell, CheckCircle2, ChevronLeft, ChevronRight, Database, Download,
  FilePlus2, Film, Image, LayoutDashboard, Loader2, LogOut, Pencil, Plus, RefreshCcw,
  Save, Search, ShieldCheck, Sparkles, Trash2, Upload, Users, X, KeyRound, MessageSquare, Flag
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { batchMedia, collectTmdb, createAdmin, deleteMedia, fetchSettings, fetchTmdbDetail, fetchUsers, importLibrary, saveMedia, saveSettings, searchTmdb, setUserVip, resetPassword } from "./api";
import { classifyMedia, mediaCategories } from "../shared/media";
import { defaultSettings, themes } from "../shared/site";
import { BrandMark, useSite } from "./SiteContext";
import ResourceEditor, { cleanResources } from "./ResourceEditor";
import AnnouncementDialog from "./AnnouncementDialog";
import Dialog from "./Dialog";
import NoticeBoard from "./NoticeBoard";
import BulletinEditor from "./BulletinEditor";
import { InvitationAdmin, RequestsAdmin } from "./CommunityAdmin";
import ReportsAdmin from "./ReportsAdmin";
import type { MediaItem, SiteSettings, User } from "./types";

const blank: MediaItem = {
  id: "", mediaType: "movie", title: "", originalTitle: "", category: "电影", categoryMode: "auto",
  region: "其他", access: "会员", status: "待补资源", genres: [], cast: [], overview: "",
  posterPath: "", backdropPath: "", resources: [], episodes: [], featured: false
};
type View = "library" | "collect" | "users" | "settings" | "invitations" | "requests" | "reports";
const sections = [
  { key: "library" as const, label: "媒体库", icon: Database },
  { key: "collect" as const, label: "影视采集", icon: FilePlus2 },
  { key: "users" as const, label: "用户 / VIP", icon: Users },
  { key: "invitations" as const, label: "邀请码", icon: KeyRound },
  { key: "requests" as const, label: "求片管理", icon: MessageSquare },
  { key: "reports" as const, label: "资源反馈", icon: Flag },
  { key: "settings" as const, label: "站点设置", icon: Bell }
];
const pageSize = 12;

function splitList(value: string) { return value.split(/[,，\n]/).map((entry) => entry.trim()).filter(Boolean); }
function dateText(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}
function vipText(user: User) {
  if (user.role === "admin") return "管理员";
  if (user.vip) return user.vipUntil ? `VIP · 至 ${dateText(user.vipUntil)}` : "永久 VIP";
  return user.vipUntil ? "VIP 已到期" : "普通用户";
}

export default function AdminPanel({ library, currentUser, onLibraryChange, onLogout }: {
  library: MediaItem[]; currentUser: User; onLibraryChange: () => Promise<void>; onLogout: () => void;
}) {
  const { settings: publishedSettings, setSettings: publishSettings } = useSite();
  const [view, setView] = useState<View>("library");
  const [draft, setDraft] = useState<MediaItem>({ ...blank });
  const [genres, setGenres] = useState("");
  const [cast, setCast] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify([blank, "", ""]));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [resourceFilter, setResourceFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<MediaItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userFilter, setUserFilter] = useState("全部");
  const [vipDates, setVipDates] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [settingsBaseline, setSettingsBaseline] = useState(JSON.stringify(defaultSettings));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirm, setAdminConfirm] = useState("");
  const [adminError, setAdminError] = useState("");
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetNew, setResetNew] = useState(""); const [resetConfirm, setResetConfirm] = useState(""); const [resetError, setResetError] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify([draft, genres, cast]) !== baseline;
  const settingsDirty = JSON.stringify(settings) !== settingsBaseline;

  function report(error: unknown) { setNotice({ text: error instanceof Error ? error.message : "操作失败，请重试。", error: true }); }
  async function loadUsers() {
    const next = await fetchUsers(); setUsers(next);
    setVipDates(Object.fromEntries(next.map((user) => [user.username, dateText(user.vipUntil)])));
  }
  async function loadSiteSettings() {
    const next = await fetchSettings(); setSettings(next); setSettingsBaseline(JSON.stringify(next)); setSettingsLoaded(true);
  }
  useEffect(() => {
    loadUsers().catch(report); loadSiteSettings().catch(report);
  }, []);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => library.some((item) => item.id === id)));
  }, [library]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if ((view === "collect" && dirty) || (view === "settings" && settingsDirty)) event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, settingsDirty, view]);

  const filtered = useMemo(() => library.filter((item) =>
    (!query.trim() || [item.title, item.originalTitle, String(item.tmdbId ?? "")].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))) &&
    (category === "全部" || item.category === category) &&
    (resourceFilter === "全部" || (resourceFilter === "有资源" ? Boolean(item.resources?.length) : !item.resources?.length))
  ), [library, query, category, resourceFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredUsers = users.filter((user) => user.username.includes(userQuery.trim().toLowerCase()) &&
    (userFilter === "全部" || (userFilter === "管理员" ? user.role === "admin" : userFilter === "VIP" ? user.role !== "admin" && user.vip : userFilter === "已到期" ? !user.vip && Boolean(user.vipUntil) : user.role !== "admin" && !user.vip)));
  const autoCategory = classifyMedia({ mediaType: draft.mediaType, genres: splitList(genres) });

  function navigate(next: View) {
    if (busy) return;
    if (((view === "collect" && dirty) || (view === "settings" && settingsDirty)) && !window.confirm("当前修改尚未保存，确认离开？")) return;
    setView(next); setNotice(null);
    loadUsers().catch(report);
  }
  function logout() {
    if (busy) return;
    if (((view === "collect" && dirty) || (view === "settings" && settingsDirty)) && !window.confirm("退出前放弃未保存的修改？")) return;
    onLogout();
  }
  function applyDraft(item: MediaItem) {
    const next: MediaItem = { ...blank, ...item, categoryMode: item.categoryMode ?? (item.id ? "manual" : "auto"), resources: item.resources ?? [] };
    const genreText = next.genres.join("，"), castText = next.cast.join("，");
    setDraft(next); setGenres(genreText); setCast(castText);
    setBaseline(JSON.stringify([next, genreText, castText])); setView("collect");
  }
  function openDraft(item: MediaItem) {
    if (dirty && view === "collect" && !window.confirm("当前修改尚未保存，确认切换条目？")) return;
    applyDraft(item); setNotice(null); window.scrollTo({ top: 0 });
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setNotice(null);
    try { await action(); } catch (error) { report(error); } finally { setBusy(false); }
  }
  function search(event: FormEvent) {
    event.preventDefault(); if (!tmdbQuery.trim()) return;
    run(async () => { const result = await searchTmdb(tmdbQuery.trim()); setTmdbResults(result.items); setSearched(true);
      setNotice({ text: result.fallback ? "尚未配置 TMDB，当前为本地媒体库结果。" : `找到 ${result.items.length} 个结果。`, error: Boolean(result.fallback) }); });
  }
  function importTmdb(item: MediaItem) {
    if (dirty && !window.confirm("当前修改尚未保存，确认载入其他影视？")) return;
    run(async () => {
      const detail = item.tmdbId ? await fetchTmdbDetail(item.mediaType, item.tmdbId) : item;
      const existing = library.find((entry) => entry.tmdbId === detail.tmdbId && entry.mediaType === detail.mediaType);
      applyDraft({ ...detail, resources: existing?.resources ?? [], access: existing?.access ?? "会员", featured: existing?.featured ?? false });
      setNotice({ text: `已载入《${detail.title}》，分类：${detail.category}。`, error: false });
    });
  }
  function save(mode: "save" | "collect") {
    run(async () => {
      const payload = { ...draft, genres: splitList(genres), cast: splitList(cast), category: draft.categoryMode === "auto" ? autoCategory : draft.category,
        resources: cleanResources(draft.resources) };
      if (!payload.title.trim()) throw new Error("请填写影视标题。");
      const item = mode === "collect" && payload.tmdbId ? await collectTmdb(payload) : await saveMedia(payload, payload.id || undefined);
      applyDraft(item); await onLibraryChange(); setNotice({ text: `已保存《${item.title}》。`, error: false });
    });
  }
  function askDelete(ids: string[]) {
    setConfirmation({ title: "删除影视", text: `确认删除 ${ids.length} 个条目？`, run: async () => {
      if (ids.length === 1) await deleteMedia(ids[0]); else await batchMedia("delete", ids);
      setSelected([]); await onLibraryChange(); setNotice({ text: `已删除 ${ids.length} 个条目。`, error: false });
    } });
  }
  function exportMedia() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `alum4k-library-${dateText(new Date().toISOString())}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 10 * 1024 * 1024) throw new Error("导入文件不能超过 10 MB。");
      const input: unknown = JSON.parse(await file.text());
      if (!Array.isArray(input)) throw new Error("请选择媒体库 JSON 数组文件。");
      const result = await importLibrary(input); await onLibraryChange(); setNotice({ text: `已导入 ${result.count} 个条目。`, error: false });
    });
    if (fileInput.current) fileInput.current.value = "";
  }
  function updateVip(user: User, vip: boolean, until: string | null) {
    run(async () => { const updated = await setUserVip(user.username, vip, until); setUsers((items) => items.map((item) => item.username === updated.username ? updated : item));
      setVipDates((dates) => ({ ...dates, [updated.username]: dateText(updated.vipUntil) })); setNotice({ text: `${updated.username}：${vipText(updated)}。`, error: false }); });
  }
  function extendVip(user: User, days: number) {
    const current = user.vipUntil ? Date.parse(user.vipUntil) : 0;
    const date = new Date(Math.max(Date.now(), current || 0) + days * 86400000);
    updateVip(user, true, dateText(date.toISOString()));
  }

  async function readLogo(file?: File) {
    if (!file) return;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) throw new Error("请选择 1 MB 以内的 PNG、JPEG 或 WebP 图片。");
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 4096 && bitmap.height <= 4096;
      bitmap.close();
      if (!valid) throw new Error("Logo 图片长宽不能超过 4096 像素。");
      const logo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("图片读取失败。")); reader.readAsDataURL(file); });
      setSettings((current) => ({ ...current, branding: { ...current.branding, logo } }));
    } catch (error) { report(error); }
    if (logoInput.current) logoInput.current.value = "";
  }

  async function addAdmin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (adminPassword !== adminConfirm) { setAdminError("两次密码输入不一致。"); return; }
    setBusy(true); setAdminError("");
    try {
      const user = await createAdmin(adminName, adminPassword);
      await loadUsers(); setAdminOpen(false); setAdminPassword(""); setAdminConfirm(""); setAdminName("");
      setNotice({ text: `管理员 ${user.username} 已添加。`, error: false });
    } catch (error) { setAdminError(error instanceof Error ? error.message : "管理员添加失败。"); }
    finally { setBusy(false); }
  }

  return <div className="admin-workspace">
    <aside className="admin-sidebar">
      <a className="admin-brand" href="/"><BrandMark /><strong>{publishedSettings.branding.name}</strong><small>管理后台</small></a>
      <nav aria-label="后台导航">{sections.map(({ key, label, icon: Icon }) => <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => navigate(key)} disabled={busy}><Icon size={18} />{label}</button>)}</nav>
      <div className="admin-sidebar-bottom"><a href="/"><ArrowLeft size={16} />返回网站</a><button type="button" onClick={logout}><LogOut size={16} />退出登录</button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-page-head"><div><span>{publishedSettings.branding.name} / 管理后台</span><h1>{sections.find((section) => section.key === view)?.label}</h1></div>
        <div className="admin-head-actions"><span className="admin-account"><ShieldCheck size={16} />{currentUser.username}</span><button className="admin-icon-button" type="button" title="刷新数据" disabled={busy} onClick={() => run(async () => { await onLibraryChange(); await loadUsers(); if (!settingsDirty) await loadSiteSettings(); setNotice({ text: "数据已刷新。", error: false }); })}><RefreshCcw size={17} /></button><button className="admin-icon-button" type="button" title="退出登录" disabled={busy} onClick={logout}><LogOut size={17} /></button></div>
      </header>
      <NoticeBoard />
      <div className="admin-summary"><div><strong>{library.length}</strong><span>影视条目</span></div><div><strong>{library.filter((item) => item.resources?.length).length}</strong><span>已有资源</span></div><div><strong>{users.filter((user) => user.role !== "admin").length}</strong><span>注册用户</span></div><div><strong>{users.filter((user) => user.role !== "admin" && user.vip).length}</strong><span>有效 VIP</span></div></div>
      {notice ? <div className={`admin-feedback ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}><CheckCircle2 size={17} /><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} title="关闭提示"><X size={16} /></button></div> : null}
      {view === "invitations" ? <InvitationAdmin /> : null}
      {view === "requests" ? <RequestsAdmin /> : null}
      {view === "reports" ? <ReportsAdmin library={library} onEdit={openDraft} onLibraryChange={onLibraryChange} /> : null}

      {view === "library" ? <section className="admin-library-view">
        <div className="admin-toolbar">
          <label className="admin-search-field"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索影视名" aria-label="搜索媒体库" /></label>
          <select value={category} aria-label="分类筛选" onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option>全部</option>{mediaCategories.map((category) => <option key={category}>{category}</option>)}</select>
          <select value={resourceFilter} aria-label="资源筛选" onChange={(event) => { setResourceFilter(event.target.value); setPage(1); }}><option>全部</option><option>有资源</option><option>待补资源</option></select>
          <div className="toolbar-spacer" />
          <button type="button" onClick={exportMedia} disabled={busy || !library.length}><Download size={16} />导出</button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={16} />导入</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => importFile(event.target.files?.[0])} />
          <button className="primary-action" type="button" onClick={() => openDraft({ ...blank })} disabled={busy}><Plus size={16} />新增影视</button>
        </div>
        {selected.length ? <div className="admin-bulk-bar"><span>已选 {selected.length} 项</span>
          <button type="button" disabled={busy} onClick={() => run(async () => { const result = await batchMedia("classify", selected); await onLibraryChange(); setNotice({ text: `已自动分类 ${result.count} 个条目。`, error: false }); })}><Sparkles size={16} />自动分类</button>
          <button className="danger-action" type="button" disabled={busy} onClick={() => askDelete(selected)}><Trash2 size={16} />删除</button>
          <button type="button" disabled={busy} onClick={() => setSelected([])}>取消选择</button>
        </div> : null}
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
          <th className="check-cell"><input type="checkbox" aria-label="选择本页全部影视" checked={pageItems.length > 0 && pageItems.every((item) => selected.includes(item.id))} disabled={busy || !pageItems.length}
            onChange={(event) => setSelected((ids) => event.target.checked ? [...new Set([...ids, ...pageItems.map((item) => item.id)])] : ids.filter((id) => !pageItems.some((item) => item.id === id)))} /></th>
          <th>影视</th><th>分类</th><th>资源</th><th>更新日期</th><th>操作</th>
        </tr></thead><tbody>{pageItems.map((item) => <tr key={item.id}>
          <td className="check-cell"><input type="checkbox" aria-label={`选择${item.title}`} checked={selected.includes(item.id)} disabled={busy} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} /></td>
          <td><button className="table-media" type="button" disabled={busy} onClick={() => openDraft(item)}><span className="table-poster"><Film size={18} />{item.posterPath ? <img key={item.posterPath} src={item.posterPath} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span><span><strong>{item.title}{item.featured ? <em>推荐</em> : null}</strong><small>{item.year ?? "未知年份"} · {item.region}{item.tmdbId ? ` · TMDB ${item.tmdbId}` : ""}</small></span></button></td>
          <td><span className="table-tag">{item.category}</span></td><td>{item.resources?.length ? `${item.resources.length} 个链接` : <span className="muted">待补资源</span>}</td><td className="muted">{dateText(item.updatedAt ?? item.createdAt) || "—"}</td>
          <td><div className="table-actions"><button type="button" title="编辑" aria-label={`编辑${item.title}`} disabled={busy} onClick={() => openDraft(item)}><Pencil size={16} /></button><button type="button" title="删除" aria-label={`删除${item.title}`} disabled={busy} onClick={() => askDelete([item.id])}><Trash2 size={16} /></button></div></td>
        </tr>)}</tbody></table>{!pageItems.length ? <div className="admin-empty"><Database size={28} />没有匹配的影视条目</div> : null}</div>
        <div className="admin-pagination"><span>共 {filtered.length} 项</span><button type="button" title="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><span>{currentPage} / {pages}</span><button type="button" title="下一页" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div>
      </section> : null}

      {view === "collect" ? <div className="admin-collect-layout">
        <section className="admin-collect-search"><h2><Search size={18} />TMDB 采集</h2>
          <form className="admin-search" onSubmit={search}><input value={tmdbQuery} onChange={(event) => setTmdbQuery(event.target.value)} placeholder="搜索影视名" aria-label="搜索 TMDB" /><button type="submit" disabled={busy || !tmdbQuery.trim()}>{busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}搜索</button></form>
          <div className="tmdb-results">{tmdbResults.map((item) => <button className="tmdb-result" key={item.id} type="button" disabled={busy} onClick={() => importTmdb(item)}>
            {item.posterPath ? <img src={item.posterPath} alt="" loading="lazy" /> : <span className="mini-poster" />}<span><strong>{item.title}</strong><small>{item.mediaType === "movie" ? "电影" : "剧集"} · {item.year ?? "未知年份"}</small></span>
          </button>)}</div>{searched && !tmdbResults.length ? <div className="admin-empty">没有找到相关影视</div> : null}
        </section>
        <form className="admin-edit-form" onSubmit={(event) => { event.preventDefault(); save("save"); }}>
          <div className="editor-heading"><h2>{draft.id ? "编辑影视" : "新增影视"}</h2><button type="button" disabled={busy} onClick={() => openDraft({ ...blank })}><Plus size={16} />新建</button></div>
          <fieldset disabled={busy}><div className="admin-form-grid">
            <label>影视标题<input value={draft.title} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>原名<input value={draft.originalTitle ?? ""} onChange={(event) => setDraft({ ...draft, originalTitle: event.target.value })} /></label>
            <label>搜索别名<textarea aria-label="搜索别名" rows={3} maxLength={2000} value={(draft.aliases ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, aliases: event.target.value.split(/\r?\n/) })} /></label>
            <label>影视类型<select value={draft.mediaType} onChange={(event) => setDraft({ ...draft, mediaType: event.target.value as MediaItem["mediaType"] })}><option value="movie">电影</option><option value="tv">剧集</option></select></label>
            <label>TMDB ID<input type="number" min="1" value={draft.tmdbId ?? ""} onChange={(event) => setDraft({ ...draft, tmdbId: Number(event.target.value) || undefined })} /></label>
            <label>分类<select aria-label="分类" value={draft.categoryMode === "auto" ? autoCategory : draft.category} disabled={draft.categoryMode === "auto"} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{mediaCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <div className="editor-toggles"><label><input type="checkbox" checked={draft.categoryMode === "auto"} onChange={(event) => setDraft({ ...draft, categoryMode: event.target.checked ? "auto" : "manual", category: autoCategory })} />自动分类</label><label><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} />首页推荐</label></div>
            <label>地区<input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
            <label>年份<input type="number" min="1880" max="2200" value={draft.year ?? ""} onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) || undefined })} /></label>
            <label>评分<input type="number" min="0" max="10" step="0.1" value={draft.rating ?? ""} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) || undefined })} /></label>
            <label>状态<input value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} /></label>
            <label>默认链接权限<select value={draft.access === "免费" ? "免费" : "VIP"} onChange={(event) => setDraft({ ...draft, access: event.target.value as MediaItem["access"] })}><option value="VIP">VIP 查看</option><option value="免费">免费查看</option></select></label>
            <label>类型标签<input value={genres} onChange={(event) => setGenres(event.target.value)} placeholder="剧情，动画，纪录" /></label>
            <label>主演<input value={cast} onChange={(event) => setCast(event.target.value)} /></label>
            <label>海报地址<input value={draft.posterPath ?? ""} onChange={(event) => setDraft({ ...draft, posterPath: event.target.value })} /></label>
            <label>背景图地址<input value={draft.backdropPath ?? ""} onChange={(event) => setDraft({ ...draft, backdropPath: event.target.value })} /></label>
          </div>
          <label className="admin-wide-field">简介<textarea value={draft.overview} rows={5} onChange={(event) => setDraft({ ...draft, overview: event.target.value })} /></label>
          <h3 className="editor-resource-heading"><Download size={17} />下载资源</h3>
          <ResourceEditor resources={draft.resources ?? []} defaultAccess={draft.access === "免费" ? "free" : "vip"} onChange={(resources) => setDraft({ ...draft, resources })} /></fieldset>
          <div className="editor-footer"><span>{dirty ? "有未保存的修改" : draft.id ? "已保存" : ""}</span><button className="primary-action" type="submit" disabled={busy}><Save size={16} />{busy ? "处理中…" : "保存影视"}</button><button type="button" disabled={busy || !draft.tmdbId} onClick={() => save("collect")}><RefreshCcw size={16} />更新 TMDB 并保存</button></div>
        </form>
      </div> : null}

      {view === "users" ? <section>
        <div className="admin-toolbar"><label className="admin-search-field"><Search size={17} /><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="搜索用户名" aria-label="搜索用户名" /></label>
          <select value={userFilter} aria-label="会员筛选" onChange={(event) => setUserFilter(event.target.value)}>{["全部", "管理员", "VIP", "普通用户", "已到期"].map((filter) => <option key={filter}>{filter}</option>)}</select><span className="muted">{filteredUsers.length} 位用户</span><div className="toolbar-spacer" /><button className="primary-action" type="button" disabled={busy} onClick={() => { setAdminError(""); setAdminName(""); setAdminPassword(""); setAdminConfirm(""); setAdminOpen(true); }}><Plus size={16} />添加管理员</button></div>
        <div className="admin-user-list">{filteredUsers.map((user) => <div className="admin-user-row" key={user.username}><div className="admin-user-summary"><strong>{user.username}</strong><span className={user.vip ? "user-status vip" : "user-status"}>{vipText(user)}</span><small>注册于 {dateText(user.createdAt) || "—"}</small></div>
          {user.role === "admin" ? <span className="muted">{user.username === "admin" ? "内置管理员" : "管理员账号"}</span> : <div className="vip-controls">
            <button type="button" disabled={busy} onClick={() => extendVip(user, 30)}>+30天</button><button type="button" disabled={busy} onClick={() => extendVip(user, 90)}>+90天</button><button type="button" disabled={busy} onClick={() => extendVip(user, 365)}>+1年</button><button type="button" disabled={busy} onClick={() => updateVip(user, true, null)}>永久</button>
            <input type="date" aria-label={`${user.username} VIP 到期日`} value={vipDates[user.username] ?? ""} onChange={(event) => setVipDates((dates) => ({ ...dates, [user.username]: event.target.value }))} />
            <button type="button" disabled={busy || !vipDates[user.username]} onClick={() => updateVip(user, true, vipDates[user.username])}>设置到期日</button><button className="danger-action" type="button" disabled={busy || !user.vip} onClick={() => updateVip(user, false, null)}>取消 VIP</button>
            <button type="button" disabled={busy} onClick={() => { setResetUser(user); setResetNew(""); setResetConfirm(""); setResetError(""); }}><KeyRound size={16} />重置密码</button>
          </div>}</div>)}</div>{!filteredUsers.length ? <div className="admin-empty"><Users size={28} />没有匹配的用户</div> : null}
      </section> : null}

      {view === "settings" ? <form className="admin-settings-form" onSubmit={(event) => { event.preventDefault(); run(async () => { const next = await saveSettings(settings); setSettings(next); publishSettings(next); setSettingsBaseline(JSON.stringify(next)); setNotice({ text: "站点设置已保存，前台刷新后生效。", error: false }); }); }}>
        <fieldset disabled={busy || !settingsLoaded}>
          <h2><Image size={18} />网站外观</h2>
          <label className="admin-wide-field">网站名称<input maxLength={24} value={settings.branding.name} required onChange={(event) => setSettings({ ...settings, branding: { ...settings.branding, name: event.target.value } })} /></label>
          <div className="branding-controls"><div className="logo-preview">{settings.branding.logo ? <img src={settings.branding.logo} alt="Logo 预览" /> : <Film size={26} />}</div><div><button type="button" onClick={() => logoInput.current?.click()}><Upload size={16} />上传 Logo</button><button type="button" disabled={!settings.branding.logo} onClick={() => setSettings({ ...settings, branding: { ...settings.branding, logo: "" } })}><Trash2 size={16} />移除 Logo</button></div><input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传网站 Logo" hidden onChange={(event) => readLogo(event.target.files?.[0])} /></div>
          <div className="theme-picker" role="radiogroup" aria-label="网站背景主题">{themes.map((theme) => <label key={theme.value} className={settings.branding.theme === theme.value ? "selected" : ""}><span className="theme-swatch" style={{ background: theme.background }}><span style={{ background: theme.surface }} /></span><span>{theme.label}</span><input type="radio" name="site-theme" value={theme.value} checked={settings.branding.theme === theme.value} onChange={() => setSettings({ ...settings, branding: { ...settings.branding, theme: theme.value } })} /></label>)}</div>
          <h2 className="settings-section-heading"><Search size={18} />浏览器标题与介绍</h2>
          <label className="admin-wide-field">前台浏览器标题<input maxLength={80} value={settings.seo.title} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, title: event.target.value } })} /></label>
          <label className="admin-wide-field">后台浏览器标题<input maxLength={80} value={settings.seo.adminTitle} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, adminTitle: event.target.value } })} /></label>
          <label className="admin-wide-field">网站地址<input aria-label="网站地址" type="url" value={settings.seo.siteUrl || ""} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, siteUrl: event.target.value } })} /></label>
          <label className="admin-wide-field">网站介绍<textarea aria-label="网站介绍" rows={3} maxLength={240} value={settings.seo.description} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, description: event.target.value } })} /></label>
          <BulletinEditor items={settings.bulletins} onChange={(bulletins) => setSettings((settings) => ({ ...settings, bulletins }))} />
          <h2 className="settings-section-heading"><Bell size={18} />首页公告</h2>
          <label className="switch-field"><input type="checkbox" checked={settings.announcement.enabled} onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, enabled: event.target.checked } })} /><span>启用首页弹窗</span></label>
          <label className="admin-wide-field">公告标题<input maxLength={80} value={settings.announcement.title} required onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, title: event.target.value } })} /></label>
          <label className="admin-wide-field">公告正文<textarea aria-label="公告正文" rows={9} maxLength={3000} value={settings.announcement.content} required={settings.announcement.enabled} onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, content: event.target.value } })} /><small className="muted">{settings.announcement.content.length} / 3000</small></label>
          <label className="admin-wide-field">显示频率<select value={settings.announcement.frequency} onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, frequency: event.target.value as SiteSettings["announcement"]["frequency"] } })}><option value="session">每次浏览会话一次</option><option value="daily">每天一次</option><option value="always">每次打开首页</option></select></label>
        </fieldset>
        <div className="editor-footer"><span>{settingsDirty ? "有未保存的修改" : ""}</span><button type="button" disabled={!settingsLoaded || !settings.announcement.content.trim()} onClick={() => setPreview(true)}><Image size={16} />预览</button><button className="primary-action" type="submit" disabled={busy || !settingsLoaded}><Save size={16} />保存站点设置</button></div>
      </form> : null}
    </main>
    {preview ? <AnnouncementDialog announcement={settings.announcement} onClose={() => setPreview(false)} /> : null}
    {resetUser ? <Dialog title={`重置 ${resetUser.username} 的密码`} onClose={() => { if (!busy) { setResetUser(null); setResetNew(""); setResetConfirm(""); } }}><form className="auth-fields" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setResetError(""); if (resetNew !== resetConfirm) { setResetError("两次密码输入不一致。"); return; }
      setBusy(true); try { const user = await resetPassword(resetUser.username, resetNew); setUsers((items) => items.map((item) => item.username === user.username ? user : item)); setResetUser(null); setResetNew(""); setResetConfirm(""); setNotice({ text: `${user.username} 的密码已重置，旧登录会话已失效。`, error: false }); }
      catch (error) { setResetError(error instanceof Error ? error.message : "重置失败。"); } finally { setBusy(false); }
    }}><label>新密码<input type="password" required minLength={6} maxLength={128} autoComplete="new-password" value={resetNew} onChange={(event) => setResetNew(event.target.value)} disabled={busy} /></label><label>确认新密码<input type="password" required maxLength={128} autoComplete="new-password" value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} disabled={busy} /></label>{resetError ? <p className="form-error" role="alert">{resetError}</p> : null}<button type="submit" className="primary-action" disabled={busy}><KeyRound size={16} />{busy ? "重置中…" : "确认重置"}</button></form></Dialog> : null}
    {adminOpen ? <Dialog title="添加管理员" onClose={() => { if (!busy) { setAdminOpen(false); setAdminPassword(""); setAdminConfirm(""); } }}><form className="auth-fields" onSubmit={addAdmin}>
      <label>管理员用户名<input required minLength={3} maxLength={20} value={adminName} autoComplete="off" onChange={(event) => setAdminName(event.target.value)} disabled={busy} /></label>
      <label>管理员密码<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} disabled={busy} /></label>
      <label>确认管理员密码<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={adminConfirm} onChange={(event) => setAdminConfirm(event.target.value)} disabled={busy} /></label>
      {adminError ? <p className="form-error" role="alert">{adminError}</p> : null}<button type="submit" className="primary-action" disabled={busy}><ShieldCheck size={17} />{busy ? "正在创建…" : "创建管理员"}</button>
    </form></Dialog> : null}
    {confirmation ? <Dialog title={confirmation.title} onClose={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.text}</p><div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button className="danger-action" type="button" disabled={busy} onClick={() => run(async () => { await confirmation.run(); setConfirmation(null); })}><Trash2 size={16} />{busy ? "处理中…" : "确认删除"}</button></div></Dialog> : null}
  </div>;
}
