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
  LogOut,
  MonitorPlay,
  Moon,
  Play,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
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
import ProfileDialog from "./ProfileDialog";
import RequestsDialog from "./RequestsDialog";
import { BoardDialog } from "./NoticeBoard";

import type { DownloadResource, MediaItem, User, Announcement } from "./types";
import { Link2, Share2 } from "lucide-react";
import DownloadLink, { ResourceSummary } from "./ResourceDownloads";
import SearchBox from "./SearchBox";
import HotCarousel from "./HotCarousel";
import usePageSeo from "./usePageSeo";
import { catalogPath, defaultFilters, filterCatalog, latestCategoryItems, mediaPath, parseDetailPath, readCatalogUrl, type CatalogFilters } from "../shared/catalog";
import { getSeasons, isSeasonNumber, resourcesForSeason, seasonLabel, seasonStatus, selectedSeasonNumber } from "../shared/seasons";
import { genreOptions, genreTaxonomy } from "../shared/genres";

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
const accessFilters = ["全部", "免费", "VIP"];
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
  return (
    <a className="media-card" href={mediaPath(item)} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(item); }}>
      <div className="media-poster-wrap">
        <PosterImage item={item} />
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
    </a>
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
              aria-current={active === item.label ? "page" : undefined}
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

function Topbar({ query, onQuery, onSearch, currentUser, onOpenAuth, onLogout, onNotice, onProfile, onRequests, items, onSelect }: {
  query: string; onQuery: (value: string) => void; onSearch: (value: string) => void;
  currentUser: User | null; onOpenAuth: () => void; onLogout: () => void; onNotice?: () => void;
  onProfile: () => void; onRequests: () => void; items: MediaItem[]; onSelect: (item: MediaItem) => void;
}) {
  const { settings, theme, toggleTheme } = useSite();
  return <header className="topbar">
    <a className="mobile-brand" href="/"><BrandMark /><span>{settings.branding.name}</span></a>
    <SearchBox items={items} query={query} onQuery={onQuery} onSearch={onSearch} onSelect={onSelect} />
    <div className="top-actions">
      <button type="button" title="求片" aria-label="求片" onClick={onRequests}><Film size={18} /><span>求片</span></button>
      <button type="button" className="theme-toggle" title={theme === "light" ? "切换深色背景" : "切换浅色背景"} aria-label={theme === "light" ? "切换深色背景" : "切换浅色背景"} onClick={toggleTheme}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
      {onNotice ? <button type="button" title="站点公告" onClick={onNotice}><Bell size={18} /></button> : null}
      {currentUser ? <><button type="button" title="个人信息" aria-label="个人信息" onClick={onProfile}>{currentUser.avatar ? <img className="topbar-avatar" src={currentUser.avatar} alt="" /> : <UserRound size={18} />}<span>{currentUser.displayName || currentUser.username} · {vipLabel(currentUser)}</span></button><button type="button" title="退出登录" aria-label="退出登录" onClick={onLogout}><LogOut size={18} /></button></>
        : <button className="avatar" type="button" onClick={onOpenAuth} title="登录/注册" aria-label="登录/注册"><UserRound size={18} /></button>}
    </div>
  </header>;
}

function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: User) => void }) {
  const { settings } = useSite();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage("");
    try {
      const result = mode === "login" ? await login(username, password) : await register(username, password, invitationCode);
      onAuthed(result.user); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败。"); }
    finally { setLoading(false); }
  }
  return <Dialog title={mode === "login" ? "登录" : "注册"} onClose={onClose} className="auth-dialog">
    <form className="auth-fields" onSubmit={submit}>
      {mode === "register" && settings.registration.hint ? <p className="registration-hint">{settings.registration.hint}</p> : null}
      <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="输入用户名" required maxLength={20} /></label>
      <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 6 位" required minLength={6} maxLength={128} /></label>
      {mode === "register" && settings.registration.requireInvitation !== false ? <label>邀请码<input required inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.replace(/\D/g, ""))} autoComplete="off" /></label> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <button className="primary-action" type="submit" disabled={loading}>{loading ? "处理中…" : mode === "login" ? "登录" : "注册"}</button>
      <button className="auth-switch" type="button" disabled={loading} onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); setMessage(""); }}>
        {mode === "login" ? "没有账号？注册用户" : "已有账号？去登录"}
      </button>
    </form>
  </Dialog>;
}

function SiteFooter() {
  const { settings } = useSite();
  const content = settings.disclaimer ?? "";
  return content.trim() ? <footer className="site-footer"><section className="site-disclaimer" aria-label="免责声明"><h2>免责声明</h2><p>{content}</p></section></footer> : null;
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

function DetailView({ item, currentUser, relatedItems, onOpenAuth, onBack, onSelectRelated }: {
  item: MediaItem; currentUser: User | null; relatedItems: MediaItem[]; onOpenAuth: () => void;
  onBack: () => void; onSelectRelated: (item: MediaItem) => void;
}) {
  const seasons = getSeasons(item);
  const [seasonChoice, setSeasonChoice] = useState(() => {
    const query = new URLSearchParams(location.search).get("season");
    const number = query === null ? undefined : Number(query);
    return isSeasonNumber(number) && seasons.some((season) => season.number === number) ? number : selectedSeasonNumber(item);
  });
  const seasonNumber = seasons.some((season) => season.number === seasonChoice) ? seasonChoice : selectedSeasonNumber(item);
  const season = seasons.find((entry) => entry.number === seasonNumber);
  const status = season ? seasonStatus(season, seasonNumber === item.selectedSeason ? item.status : "待更新") : item.status;
  const resources = resourcesForSeason(item.resources ?? [], seasonNumber);
  const [shareMessage, setShareMessage] = useState("");
  const [resourceType, setResourceType] = useState<"115" | "magnet">("115");
  function chooseSeason(number: number) {
    setSeasonChoice(number);
    const url = new URL(location.href); url.searchParams.set("season", String(number));
    history.replaceState(history.state, "", url);
    const next = resourcesForSeason(item.resources ?? [], number);
    if (!next.some((resource) => resource.type === resourceType)) setResourceType(next.some((resource) => resource.type === "115") ? "115" : "magnet");
  }
  useEffect(() => { setResourceType(resources.some((resource) => resource.type === "115") ? "115" : "magnet"); }, [item.id]);
  const visible = resources.filter((resource) => resource.type === resourceType);
  return <section className="detail-view">
    <div className="detail-toolbar"><button className="back-button" onClick={onBack} type="button"><ArrowLeft size={18} />返回</button><button type="button" className="share-film" title="复制影视网址" onClick={async () => { try { const url = new URL(mediaPath(item), location.origin); if (seasonNumber !== undefined) url.searchParams.set("season", String(seasonNumber)); await copyText(url.href); setShareMessage("影视网址已复制"); } catch (error) { setShareMessage(error instanceof Error ? error.message : "复制失败。"); } }}><Share2 size={16} />分享</button>{shareMessage ? <span role="status">{shareMessage}</span> : null}</div>
    <div className="detail-hero">
      {item.backdropPath ? <img src={item.backdropPath} alt="" /> : null}<div className="detail-shade" />
      <div className="detail-info">
        <div className="detail-poster"><PosterImage item={{ ...item, status, posterPath: season?.posterPath || item.posterPath }} /></div>
        <div className="detail-copy">
          <span className="detail-label">{item.category}</span><h1>{item.title}</h1>
          <p className="detail-subtitle">{item.originalTitle ? item.originalTitle + " · " : ""}{item.year ?? "未知年份"} · {item.region} · {seasonNumber !== undefined ? seasonLabel(seasonNumber) + " · " : ""}{status}</p>
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
        {seasons.length ? <div className="detail-season-bar"><label>选择季<select aria-label="选择季" value={seasonNumber} onChange={(event) => chooseSeason(Number(event.target.value))}>{seasons.map((entry) => <option key={entry.number} value={entry.number}>{seasonLabel(entry.number)}{entry.episodeCount ? ` · ${entry.episodeCount}集` : ""}</option>)}</select></label><span>{status}</span></div> : null}
        <div className="download-type-tabs" role="tablist" aria-label="下载方式">
          {(["115", "magnet"] as const).map((type) => <button key={type} type="button" role="tab" aria-selected={resourceType === type}
            className={classNames(resourceType === type && "active")} onClick={() => setResourceType(type)}>
            {type === "115" ? <Download size={16} /> : <Link2 size={16} />}{type === "115" ? "115网盘" : "磁力链接"}<span>{resources.filter((resource) => resource.type === type).length}</span>
          </button>)}
        </div>
        {visible.length ? <div className="download-list">{visible.map((resource) => resource.url ? <DownloadLink key={resource.id} resource={resource} mediaId={item.id} /> : <div className="download-row locked-resource" key={resource.id}><div><strong>{resource.title || downloadLabel(resource)}</strong><span className="resource-access vip">VIP</span><ResourceSummary resource={resource} /><small>{currentUser ? "VIP 会员可查看此链接" : "登录并开通 VIP 后可查看此链接"}</small></div>{!currentUser ? <button className="locked-action" type="button" onClick={onOpenAuth}>登录 / 注册</button> : <Crown size={22} />}</div>)}</div>
          : <div className="resource-empty"><Download size={26} /><span>暂无{resourceType === "115" ? "115网盘" : "磁力"}链接</span></div>}
      </section>
      <aside className="episode-panel">
        <div className="panel-title"><span>同类推荐</span><small>{relatedItems.length} 部</small></div>
        <div className="related-list">{relatedItems.map((related) => <a key={related.id} href={mediaPath(related)} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelectRelated(related); }}>
          {related.posterPath ? <img src={related.posterPath} alt="" loading="lazy" /> : <span className="related-poster-fallback"><Film size={18} /></span>}
          <span><strong>{related.title}</strong><small>{related.year ?? "未知年份"} · {related.category}</small></span>
        </a>)}</div>
      </aside>
    </div>
  </section>;
}

function LatestHome({ items, loading, onSelect, onCategory }: { items: MediaItem[]; loading: boolean; onSelect: (item: MediaItem) => void; onCategory: (category: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const promoted = useMemo(() => items.filter((item) => item.featured).sort((left, right) => (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "")), [items]);
  const [columns, setColumns] = useState(2);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const gap = width < 560 ? 12 : 24;
      setColumns(Math.max(2, Math.min(10, Math.floor((width + gap) / (width < 560 ? 152 : 196)))));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div className="latest-home" ref={container}><HotCarousel items={promoted} onSelect={onSelect} />{["电视剧", "电影", "综艺", "动漫"].map((category) => {
    const latest = latestCategoryItems(items, category, columns * 2);
    return <section className="latest-category" key={category} aria-label={`${category}最新更新`}>
      <header className="latest-category-head"><h2>{category}</h2><button type="button" onClick={() => onCategory(category)}>更多<ChevronDown size={16} /></button></header>
      {loading ? <div className="loading-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns * 2 }).map((_, index) => <div className="skeleton-card" key={index} />)}</div>
        : latest.length ? <div className="media-grid latest-media-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{latest.map((item) => <MediaCard item={item} key={item.id} onSelect={onSelect} />)}</div>
          : <p className="latest-empty">暂无{category}</p>}
    </section>;
  })}</div>;
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
  searchMode, searchTerm, years, onRequest, onReset, genreValues
}: {
  items: MediaItem[];
  loading: boolean;
  activeNav: string;
  activeTab: string;
  setActiveTab: (value: string) => void;
  filters: CatalogFilters;
  setFilters: (value: CatalogFilters) => void;
  onSelect: (item: MediaItem) => void;
  searchMode: boolean; searchTerm: string; years: number[]; onRequest: () => void; onReset: () => void;
  genreValues: string[];
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
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
        <FilterRow label={genreTaxonomy(activeNav).label} values={genreValues} active={filters.genre} onChange={(genre) => setFilters({ ...filters, genre })} />
        <FilterRow label="资费" values={accessFilters} active={filters.access} onChange={(access) => setFilters({ ...filters, access })} />
        <FilterRow label="地区" values={regionFilters} active={filters.region} onChange={(region) => setFilters({ ...filters, region })} />
        <div className="catalog-extra-filters">
          <label>年份<select aria-label="年份筛选" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}><option>全部</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
          <label>评分<select aria-label="评分筛选" value={filters.rating} onChange={(event) => setFilters({ ...filters, rating: event.target.value })}><option value="全部">全部</option><option value="7">7 分以上</option><option value="8">8 分以上</option><option value="9">9 分以上</option></select></label>
          <label>资源<select aria-label="资源状态筛选" value={filters.resources} onChange={(event) => setFilters({ ...filters, resources: event.target.value })}>{["全部", "有资源", "待补资源"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <button type="button" onClick={onReset}>重置筛选</button>
        </div>
      </div> : null}


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
        <div className="catalog-empty"><EmptyState text="没有找到匹配的视频" />{searchMode ? <button type="button" className="primary-action" onClick={onRequest}><Film size={16} />求片：{searchTerm}</button> : <button type="button" onClick={onReset}>重置筛选</button>}</div>
      )}
    </section>
  );
}

export default function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pathname, setPathname] = useState(location.pathname);
  const [catalog, setCatalog] = useState(() => readCatalogUrl(new URL(location.href)));
  const [query, setQuery] = useState(catalog.query);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestAfterLogin, setRequestAfterLogin] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const libraryRequest = useRef(0);
  const detailRoute = parseDetailPath(pathname);
  const selected = detailRoute ? items.find((item) => item.id === detailRoute.id && item.mediaType === detailRoute.mediaType) : undefined;
  const missing = !loading && !loadError && (pathname !== "/" && !selected);
  usePageSeo(selected, missing, Boolean(catalog.query && !selected));

  async function refreshLibrary() {
    const request = ++libraryRequest.current; setLoading(true); setLoadError("");
    try { const media = await fetchMedia(); if (request === libraryRequest.current) setItems(media); }
    catch (error) { if (request === libraryRequest.current) setLoadError(error instanceof Error ? error.message : "加载失败。"); }
    finally { if (request === libraryRequest.current) setLoading(false); }
  }
  function applyLocation() {
    setPathname(location.pathname);
    if (location.pathname === "/") { const next = readCatalogUrl(new URL(location.href)); setCatalog(next); setQuery(next.query); }
  }
  function navigate(path: string) {
    history.replaceState({ ...history.state, alum4k: true, scroll: window.scrollY }, "", location.href);
    history.pushState({ alum4k: true, internal: true, scroll: 0 }, "", path);
    applyLocation(); window.scrollTo(0, 0);
  }
  function openFilm(item: MediaItem) { if (pathname !== mediaPath(item)) navigate(mediaPath(item)); }
  function back() { if (history.state?.alum4k && history.state.internal) history.back(); else navigate(catalogPath(catalog.filters, catalog.query)); }
  useEffect(() => {
    const previous = history.scrollRestoration; history.scrollRestoration = "manual";
    function pop() { applyLocation(); const scroll = history.state?.scroll ?? 0; requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scroll))); }
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("popstate", pop); history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    refreshLibrary();
    fetchCurrentUser().then(setCurrentUser).catch(() => undefined);
    fetchSettings().then(({ announcement }) => { setAnnouncement(announcement); setNoticeOpen(shouldShowAnnouncement(announcement)); }).catch(() => undefined);
  }, []);
  function clearSession() { libraryRequest.current++; setItems([]); setCurrentUser(null); setProfileOpen(false); setRequestsOpen(false); refreshLibrary(); }
  useEffect(() => {
    function expire() { clearSession(); setAuthOpen(true); }
    window.addEventListener("alum4k:session-expired", expire);
    return () => window.removeEventListener("alum4k:session-expired", expire);
  }, []);
  const filteredItems = useMemo(() => filterCatalog(items, catalog.filters, catalog.query), [items, catalog]);
  const relatedItems = useMemo(() => selected ? pickRelatedItems(selected, items) : [], [items, selected]);
  const years = useMemo(() => [...new Set(items.map((item) => item.year).filter((year): year is number => Boolean(year)))].sort((a, b) => b - a), [items]);
  function setFilters(filters: CatalogFilters) { navigate(catalogPath(filters, catalog.query)); }
  function handleNav(category: string) { navigate(catalogPath({ ...defaultFilters, category }, "")); }
  function handleSearch(value: string) { navigate(catalogPath(catalog.filters, value.trim())); }
  function requestFilm(title = "") { setRequestTitle(title); if (currentUser) setRequestsOpen(true); else { setRequestAfterLogin(true); setAuthOpen(true); } }

  return <div className="app-shell">
    <Sidebar active={catalog.filters.category} onChange={handleNav} />
    <main className="main-shell public-main">
      <Topbar query={query} onQuery={setQuery} onSearch={handleSearch} currentUser={currentUser} onOpenAuth={() => setAuthOpen(true)} items={items} onSelect={openFilm}
        onNotice={() => setBoardOpen(true)} onProfile={() => setProfileOpen(true)} onRequests={() => requestFilm()}
        onLogout={() => { setAuthToken(""); clearSession(); }} />
      {loadError ? <div className="admin-message" role="alert"><span>{loadError}</span><button type="button" onClick={refreshLibrary}>重试</button></div> : null}
      {selected ? <DetailView key={selected.id} item={selected} currentUser={currentUser} relatedItems={relatedItems} onOpenAuth={() => setAuthOpen(true)} onBack={back} onSelectRelated={openFilm} />
        : missing ? <section className="catalog-not-found"><h1>影视不存在</h1><p>该影视不存在或已经删除。</p><button type="button" className="primary-action" onClick={() => handleNav("首页")}><Home size={16} />返回首页</button></section>
        : loading && pathname !== "/" ? <div className="empty-state">正在读取影视详情…</div>
        : catalog.filters.category === "首页" && !catalog.query ? <LatestHome items={items} loading={loading} onSelect={openFilm} onCategory={handleNav} />
        : <HomeView items={filteredItems} loading={loading} activeNav={catalog.filters.category} activeTab={catalog.filters.sort} setActiveTab={(sort) => setFilters({ ...catalog.filters, sort })}
            genreValues={genreOptions(catalog.filters.category, items, catalog.filters.genre)}
            filters={catalog.filters} setFilters={setFilters} onSelect={openFilm} searchMode={Boolean(catalog.query)} searchTerm={catalog.query} years={years}
            onReset={() => setFilters({ ...defaultFilters, category: catalog.filters.category })} onRequest={() => requestFilm(catalog.query)} />}
      <SiteFooter />
    </main>
    <div className="mobile-tabbar">{navItems.slice(0, 5).map((item) => { const Icon = item.icon; return <button className={classNames(catalog.filters.category === item.label && "active")} key={item.label} onClick={() => handleNav(item.label)} type="button"><Icon size={18} /><span>{item.label}</span></button>; })}</div>
    {authOpen ? <AuthModal onClose={() => { setAuthOpen(false); setRequestAfterLogin(false); }} onAuthed={(user) => { setCurrentUser(user); refreshLibrary(); if (requestAfterLogin) { setRequestsOpen(true); setRequestAfterLogin(false); } }} /> : null}
    {currentUser && profileOpen ? <ProfileDialog user={currentUser} onChange={setCurrentUser} onClose={() => setProfileOpen(false)} /> : null}
    {currentUser && requestsOpen ? <RequestsDialog initialTitle={requestTitle} onClose={() => setRequestsOpen(false)} /> : null}
    {boardOpen ? <BoardDialog onClose={() => setBoardOpen(false)} /> : null}
    {announcement && noticeOpen && pathname === "/" && !authOpen && !profileOpen && !requestsOpen && !boardOpen ? <AnnouncementDialog announcement={announcement} onClose={() => { dismissAnnouncement(announcement); setNoticeOpen(false); }} /> : null}
  </div>;
}
