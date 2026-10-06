import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  ChevronDown,
  CirclePlay,
  Clock3,
  Crown,
  Download,
  Film,
  Gamepad2,
  Grid2X2,
  History,
  Home,
  ListVideo,
  MonitorPlay,
  Play,
  Search,
  Settings,
  Sparkles,
  Star,
  Tv,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchCurrentUser, fetchMedia, fetchSettings, login, register, setAuthToken } from "./api";
import { copyText } from "./clipboard";
import { BrandMark, useSite } from "./SiteContext";
import Dialog from "./Dialog";
import AnnouncementDialog, { dismissAnnouncement, shouldShowAnnouncement } from "./AnnouncementDialog";

import type { DownloadResource, MediaItem, User, Announcement } from "./types";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";

const navItems = [
  { label: "首页", icon: Home },
  { label: "电视剧", icon: Tv },
  { label: "电影", icon: Film },
  { label: "综艺", icon: MonitorPlay },
  { label: "动漫", icon: BadgeCheck },
  { label: "少儿", icon: Sparkles },
  { label: "短剧", icon: ListVideo },
  { label: "纪录片", icon: CirclePlay },
  { label: "游戏", icon: Gamepad2 }
];

const tabs = ["热门", "最新上架", "高分好评"];
const genreFilters = ["全部", "爱情", "都市", "青春", "奇幻", "武侠", "古装", "科幻", "悬疑", "犯罪", "剧情", "冒险"];
const accessFilters = ["全部", "免费", "会员", "VIP"];
const regionFilters = ["全部", "内地", "中国香港", "中国台湾", "美国", "泰国", "英国", "韩国", "日本", "其他"];

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function PosterImage({ item }: { item: MediaItem }) {
  return (
    <div className="poster-frame">
      {item.posterPath ? <img src={item.posterPath} alt={item.title} loading="lazy" /> : null}
      <div className="poster-fallback">
        <Film size={28} />
        <span>{item.title}</span>
      </div>
      <span className="poster-year">{item.year ?? "TMDB"}</span>
      <span className={classNames("access-ribbon", item.access === "免费" && "free")}>{item.access}</span>
      <span className="episode-status">{item.status}</span>
    </div>
  );
}

function MediaCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  const resourceCount = item.resources?.length ?? 0;

  return (
    <button className="media-card" onClick={() => onSelect(item)} type="button">
      <div className="media-poster-wrap">
        <PosterImage item={item} />
        <span className={"media-resource-pill"}>
          {resourceCount > 0 ? `${resourceCount} 个资源` : "待补资源"}
        </span>
        <span className="media-hover-action">
          <Play size={15} fill="currentColor" />
          查看详情
        </span>
      </div>
      <span className="media-title">{item.title}</span>
      <span className="media-meta">{item.cast.slice(0, 3).join(" ") || item.originalTitle || "TMDB 元数据"}</span>
      <span className="media-chip">
        <Star size={12} />
        {item.rating ? `评分 ${item.rating}` : item.genres[0] ?? "待评分"}
      </span>
    </button>
  );
}

function FilterRow({
  label,
  values,
  active,
  onChange
}: {
  label: string;
  values: string[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="filter-row">
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button
            className={classNames("filter-button", active === value && "active")}
            key={value}
            onClick={() => onChange(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function Spotlight({
  item,
  onSelect
}: {
  item: MediaItem | undefined;
  onSelect: (item: MediaItem) => void;
}) {
  if (!item) return null;

  const resourceCount = item.resources?.length ?? 0;

  return (
    <section className="spotlight">
      {item.backdropPath ? <img src={item.backdropPath} alt="" /> : item.posterPath ? <img src={item.posterPath} alt="" /> : null}
      <div className="spotlight-shade" />
      <div className="spotlight-copy">
        <span className="spotlight-kicker">
          <Sparkles size={15} />
          精选推荐
        </span>
        <h1>{item.title}</h1>
        <p className="spotlight-meta">
          {item.year ?? "未知年份"} · {item.region} · {item.category} · {item.rating ? `TMDB ${item.rating}` : item.status}
        </p>
        <p className="spotlight-overview">{shortText(item.overview || "暂无简介。", 116)}</p>
        <div className="spotlight-actions">
          <button type="button" onClick={() => onSelect(item)}>
            <Play size={17} fill="currentColor" />
            查看详情
          </button>
          <span>{resourceCount ? `${resourceCount} 个下载资源` : "待补资源"}</span>
        </div>
      </div>
    </section>
  );
}

function Sidebar({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  const { settings } = useSite();
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onChange("首页")} type="button" title={settings.branding.name}>
        <BrandMark />
        <span>{settings.branding.name}</span>
      </button>
      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={classNames("nav-item", active === item.label && "active")}
              key={item.label}
              onClick={() => onChange(item.label)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>

            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function Topbar({ query, onQuery, onSearch, currentUser, onOpenAuth, onLogout, onNotice }: {
  query: string; onQuery: (value: string) => void; onSearch: (value: string) => void;
  currentUser: User | null; onOpenAuth: () => void; onLogout: () => void; onNotice?: () => void;
}) {
  const { settings } = useSite();
  return <header className="topbar">
    <a className="mobile-brand" href="/"><BrandMark /><span>{settings.branding.name}</span></a>
    <form className="search-box" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
      <input name="query" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索影视名" aria-label="搜索影视名" />
      <button type="submit" title="搜索" aria-label="搜索"><Search size={20} /></button>
    </form>
    <div className="top-actions">
      {onNotice ? <button type="button" title="站点公告" onClick={onNotice}><Bell size={18} /></button> : null}
      {currentUser ? <button type="button" title="退出登录" onClick={onLogout}><UserRound size={18} /><span>{currentUser.username} · {vipLabel(currentUser)}</span></button>
        : <button className="avatar" type="button" onClick={onOpenAuth} title="登录/注册" aria-label="登录/注册"><UserRound size={18} /></button>}
    </div>
  </header>;
}

function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage("");
    try {
      const result = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthed(result.user); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败。"); }
    finally { setLoading(false); }
  }
  return <Dialog title={mode === "login" ? "登录" : "注册"} onClose={onClose} className="auth-dialog">
    <form className="auth-fields" onSubmit={submit}>
      <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="输入用户名" required maxLength={20} /></label>
      <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 6 位" required minLength={6} /></label>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <button className="primary-action" type="submit" disabled={loading}>{loading ? "处理中…" : mode === "login" ? "登录" : "注册"}</button>
      <button className="auth-switch" type="button" disabled={loading} onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); setMessage(""); }}>
        {mode === "login" ? "没有账号？注册用户" : "已有账号？去登录"}
      </button>
    </form>
  </Dialog>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <MonitorPlay size={34} />
      <span>{text}</span>
    </div>
  );
}

function downloadLabel(resource: DownloadResource) {
  return resource.type === "magnet" ? "磁力下载" : "115网盘";
}

function downloadResourceCount(item: MediaItem) {
  return item.resources?.length ?? 0;
}

function shortText(value: string, max = 84) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function pickFeaturedItem(items: MediaItem[]) {
  return [...items]
    .sort((left, right) => {
      const rightScore = (right.backdropPath ? 8 : 0) + downloadResourceCount(right) * 3 + (right.featured ? 50 : 0) + (right.rating ?? 0);
      const leftScore = (left.backdropPath ? 8 : 0) + downloadResourceCount(left) * 3 + (left.featured ? 50 : 0) + (left.rating ?? 0);
      return rightScore - leftScore;
    })[0];
}

function pickRelatedItems(current: MediaItem, items: MediaItem[]) {
  const genres = new Set(current.genres);
  return items
    .filter((item) => item.id !== current.id)
    .map((item) => {
      const sharedGenres = item.genres.filter((genre) => genres.has(genre)).length;
      const score =
        (item.category === current.category ? 8 : 0) +
        (item.mediaType === current.mediaType ? 5 : 0) +
        (item.region === current.region ? 2 : 0) +
        sharedGenres * 4 +
        downloadResourceCount(item) * 2 +
        (item.rating ?? 0);
      return { item, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.item);
}

function vipLabel(user: User) {
  if (user.role === "admin") return "管理员";
  if (user.vip && user.vipUntil) return `VIP至${new Date(user.vipUntil).toISOString().slice(0, 10)}`;
  if (user.vip) return "VIP";
  if (user.vipUntil) return "VIP已过期";
  return "普通用户";
}

function DownloadLink({ resource }: { resource: DownloadResource }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    setError("");
    try { await copyText(resource.url); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); }
    catch (error) { setError(error instanceof Error ? error.message : "复制失败。"); }
  }
  return <div className="download-row resource-link-row">
    <div className="resource-link-info">
      <strong>{resource.title || downloadLabel(resource)}</strong>
      <span className={`resource-access ${resource.access === "free" ? "free" : "vip"}`}>{resource.access === "free" ? "免费" : "VIP"}</span>
      <small>{[resource.size, resource.note].filter(Boolean).join(" · ")}</small>
      {resource.code ? <small>提取码：{resource.code}</small> : null}
      <div className="resource-url-line">
        <a href={resource.url} target="_blank" rel="noreferrer" title={resource.url}>{resource.url}</a>
        <button type="button" className="copy-link-button" onClick={copy} title={copied ? "已复制" : "复制链接"} aria-label={copied ? "已复制链接" : "复制链接"}>
          {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      {error ? <small className="form-error" role="alert">{error}</small> : null}
    </div>
    <a className="resource-open-button" href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.type === "magnet" ? "磁力下载" : "打开网盘"}</a>
  </div>;
}

function DetailView({ item, currentUser, relatedItems, onOpenAuth, onBack, onSelectRelated }: {
  item: MediaItem; currentUser: User | null; relatedItems: MediaItem[]; onOpenAuth: () => void;
  onBack: () => void; onSelectRelated: (item: MediaItem) => void;
}) {
  const resources = item.resources ?? [];
  const [resourceType, setResourceType] = useState<"115" | "magnet">("115");
  useEffect(() => { setResourceType(resources.some((resource) => resource.type === "115") ? "115" : "magnet"); }, [item.id]);
  const visible = resources.filter((resource) => resource.type === resourceType);
  return <section className="detail-view">
    <button className="back-button" onClick={onBack} type="button"><ArrowLeft size={18} />返回</button>
    <div className="detail-hero">
      {item.backdropPath ? <img src={item.backdropPath} alt="" /> : null}<div className="detail-shade" />
      <div className="detail-info">
        <div className="detail-poster"><PosterImage item={item} /></div>
        <div className="detail-copy">
          <span className="detail-label">{item.category}</span><h1>{item.title}</h1>
          <p className="detail-subtitle">{item.originalTitle ? item.originalTitle + " · " : ""}{item.year ?? "未知年份"} · {item.region} · {item.status}</p>
          <div className="detail-tags">{item.rating ? <span>TMDB {item.rating}</span> : null}{item.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
          <p className="overview">{item.overview}</p>
          {item.cast.length ? <p className="cast-line">主演：{item.cast.join(" / ")}</p> : null}
          <div className="detail-metrics"><span><Download size={15} />{resources.length} 个下载资源</span></div>
        </div>
      </div>
    </div>
    <div className="watch-layout download-only-layout">
      <section className="download-panel">
        <div className="panel-title"><span>下载资源</span><small>{resources.length} 条</small></div>
        <div className="download-type-tabs" role="tablist" aria-label="下载方式">
          {(["115", "magnet"] as const).map((type) => <button key={type} type="button" role="tab" aria-selected={resourceType === type}
            className={classNames(resourceType === type && "active")} onClick={() => setResourceType(type)}>
            {type === "115" ? <Download size={16} /> : <Link2 size={16} />}{type === "115" ? "115网盘" : "磁力链接"}<span>{resources.filter((resource) => resource.type === type).length}</span>
          </button>)}
        </div>
        {visible.length ? <div className="download-list">{visible.map((resource) => resource.url ? <DownloadLink key={resource.id} resource={resource} /> : <div className="download-row locked-resource" key={resource.id}><div><strong>{resource.title || downloadLabel(resource)}</strong><span className="resource-access vip">VIP</span><small>{currentUser ? "VIP 会员可查看此链接" : "登录并开通 VIP 后可查看此链接"}</small></div>{!currentUser ? <button className="locked-action" type="button" onClick={onOpenAuth}>登录 / 注册</button> : <Crown size={22} />}</div>)}</div>
          : <div className="resource-empty"><Download size={26} /><span>暂无{resourceType === "115" ? "115网盘" : "磁力"}链接</span></div>}
      </section>
      <aside className="episode-panel">
        <div className="panel-title"><span>同类推荐</span><small>{relatedItems.length} 部</small></div>
        <div className="related-list">{relatedItems.map((related) => <button key={related.id} type="button" onClick={() => onSelectRelated(related)}>
          {related.posterPath ? <img src={related.posterPath} alt="" loading="lazy" /> : <span className="related-poster-fallback"><Film size={18} /></span>}
          <span><strong>{related.title}</strong><small>{related.year ?? "未知年份"} · {related.category}</small></span>
        </button>)}</div>
      </aside>
    </div>
  </section>;
}

function HomeView({
  items,
  loading,
  activeNav,
  activeTab,
  setActiveTab,
  filters,
  setFilters,
  onSelect,
  searchMode
}: {
  items: MediaItem[];
  loading: boolean;
  activeNav: string;
  activeTab: string;
  setActiveTab: (value: string) => void;
  filters: { genre: string; access: string; region: string };
  setFilters: (value: { genre: string; access: string; region: string }) => void;
  onSelect: (item: MediaItem) => void;
  searchMode: boolean;
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const featured = !loading && !searchMode ? pickFeaturedItem(items) : undefined;
  const downloadTotal = items.filter((item) => downloadResourceCount(item) > 0).length;
  const vipTotal = items.filter((item) => item.access !== "免费").length;

  return (
    <section className="home-view">
      <div className="content-head">
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              className={classNames("tab-button", activeTab === tab && "active")}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="expand-button" type="button" onClick={() => setFiltersExpanded(!filtersExpanded)} aria-expanded={filtersExpanded}>
          {filtersExpanded ? "收起筛选" : "展开筛选"}
          <ChevronDown size={16} />
        </button>
      </div>

      {filtersExpanded ? <div className="filters">
        <FilterRow label="类型" values={genreFilters} active={filters.genre} onChange={(genre) => setFilters({ ...filters, genre })} />
        <FilterRow label="资费" values={accessFilters} active={filters.access} onChange={(access) => setFilters({ ...filters, access })} />
        <FilterRow label="地区" values={regionFilters} active={filters.region} onChange={(region) => setFilters({ ...filters, region })} />
      </div> : null}

      <Spotlight item={featured} onSelect={onSelect} />

      <div className="section-title">
        <div>
          <h2>{searchMode ? "搜索结果" : activeNav === "首页" ? "精选影视" : activeNav}</h2>
          <p>{searchMode ? `找到 ${items.length} 部影视` : "115网盘 · 磁力下载"}</p>
        </div>
        <div className="section-stats">
          <span>
            <Grid2X2 size={16} />
            {items.length} 部
          </span>

          <span>
            <Crown size={16} />
            {vipTotal} 会员
          </span>
          <span>
            <Download size={16} />
            {downloadTotal} 下载
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading-grid">
          {Array.from({ length: 10 }).map((_, index) => (
            <div className="skeleton-card" key={index} />
          ))}
        </div>
      ) : items.length ? (
        <div className="media-grid">
          {items.map((item) => (
            <MediaCard item={item} key={item.id} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <EmptyState text="没有找到匹配的视频" />
      )}
    </section>
  );
}

export default function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [displayItems, setDisplayItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [activeNav, setActiveNav] = useState("首页");
  const [activeTab, setActiveTab] = useState("热门");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [filters, setFilters] = useState({ genre: "全部", access: "全部", region: "全部" });
  const searchRequest = useRef(0);

  async function refreshLibrary() {
    const media = await fetchMedia();
    setItems(media); setDisplayItems(media);
    setSelected((current) => current ? media.find((item) => item.id === current.id) ?? null : null);
    setSearchMode(false); setLoadError("");
  }
  useEffect(() => {
    refreshLibrary().catch((error) => setLoadError(error.message)).finally(() => setLoading(false));
    fetchCurrentUser().then(setCurrentUser).catch(() => undefined);
    fetchSettings().then(({ announcement }) => { setAnnouncement(announcement); setNoticeOpen(shouldShowAnnouncement(announcement)); }).catch(() => undefined);
  }, []);

  const filteredItems = useMemo(() => {
    let next = displayItems;
    if (!searchMode && activeNav !== "首页") next = next.filter((item) => item.category === activeNav);
    if (filters.genre !== "全部") next = next.filter((item) => item.genres.includes(filters.genre));
    if (filters.access !== "全部") next = next.filter((item) => item.access === filters.access);
    if (filters.region !== "全部") next = next.filter((item) => item.region === filters.region);
    if (activeTab === "高分好评") next = [...next].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (activeTab === "最新上架") next = [...next].sort((a, b) => (Date.parse(b.createdAt ?? "") || (b.year ?? 0)) - (Date.parse(a.createdAt ?? "") || (a.year ?? 0)));
    return next;
  }, [activeNav, activeTab, displayItems, filters, searchMode]);
  const relatedItems = useMemo(() => selected ? pickRelatedItems(selected, items) : [], [items, selected]);

  function handleNav(value: string) {
    searchRequest.current++; setLoading(false); setLoadError(""); setQuery("");
    setActiveNav(value); setSearchMode(false); setDisplayItems(items); setSelected(null);
    setFilters({ genre: "全部", access: "全部", region: "全部" });
  }
  async function handleSearch(value: string) {
    const term = value.trim(); const request = ++searchRequest.current;
    setQuery(term); setSelected(null); setLoadError("");
    setFilters({ genre: "全部", access: "全部", region: "全部" });
    if (!term) { setSearchMode(false); setDisplayItems(items); setLoading(false); return; }
    setLoading(true); setSearchMode(true);
    try { const result = await fetchMedia(term, true); if (request === searchRequest.current) setDisplayItems(result); }
    catch (error) { if (request === searchRequest.current) setLoadError(error instanceof Error ? error.message : "搜索失败。"); }
    finally { if (request === searchRequest.current) setLoading(false); }
  }
  return <div className="app-shell">
    <Sidebar active={activeNav} onChange={handleNav} />
    <main className="main-shell">
      <Topbar query={query} onQuery={setQuery} onSearch={handleSearch} currentUser={currentUser} onOpenAuth={() => setAuthOpen(true)}
        onNotice={announcement?.enabled ? () => setNoticeOpen(true) : undefined}
        onLogout={() => { setAuthToken(""); setCurrentUser(null); setSelected(null); refreshLibrary().catch((error) => setLoadError(error.message)); }} />
      {loadError ? <div className="admin-message" role="alert"><span>{loadError}</span><button type="button" onClick={() => refreshLibrary().catch((error) => setLoadError(error.message))}>重试</button></div> : null}
      {selected ? <DetailView item={selected} currentUser={currentUser} relatedItems={relatedItems} onOpenAuth={() => setAuthOpen(true)} onBack={() => setSelected(null)}
        onSelectRelated={(item) => { setSelected(item); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        : <HomeView items={filteredItems} loading={loading} activeNav={activeNav} activeTab={activeTab} setActiveTab={setActiveTab} filters={filters} setFilters={setFilters} onSelect={setSelected} searchMode={searchMode} />}
    </main>
    <div className="mobile-tabbar">{navItems.slice(0, 5).map((item) => { const Icon = item.icon; return <button className={classNames(activeNav === item.label && "active")} key={item.label} onClick={() => handleNav(item.label)} type="button"><Icon size={18} /><span>{item.label}</span></button>; })}</div>
    {authOpen ? <AuthModal onClose={() => setAuthOpen(false)} onAuthed={(user) => { setCurrentUser(user); refreshLibrary().catch((error) => setLoadError(error.message)); }} /> : null}
    {announcement && noticeOpen && !selected && !authOpen ? <AnnouncementDialog announcement={announcement} onClose={() => { dismissAnnouncement(announcement); setNoticeOpen(false); }} /> : null}
  </div>;
}
