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
import { fetchCurrentUser, fetchMedia, login, register, setAuthToken, watchUrl } from "./api";
import AdminPanel from "./AdminPanel";
import type { DownloadResource, MediaItem, User } from "./types";

const navItems = [
  { label: "首页", icon: Home },
  { label: "VIP会员", icon: Crown, badge: "618" },
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
  const playCount = playableResourceCount(item);
  const resourceCount = item.resources?.length ?? 0;

  return (
    <button className="media-card" onClick={() => onSelect(item)} type="button">
      <div className="media-poster-wrap">
        <PosterImage item={item} />
        <span className={classNames("media-resource-pill", playCount > 0 && "playable")}>
          {playCount > 0 ? `${playCount} 个可播` : resourceCount > 0 ? `${resourceCount} 个资源` : "待补资源"}
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

  const playCount = playableResourceCount(item);
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
          <span>{playCount ? `${playCount} 个在线播放源` : resourceCount ? `${resourceCount} 个下载资源` : "等待后台补充资源"}</span>
        </div>
      </div>
    </section>
  );
}

function Sidebar({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onChange("首页")} type="button" title="Alum4K">
        <span className="brand-mark">
          <Play size={16} fill="currentColor" />
        </span>
        <span>Alum4K</span>
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
              {item.badge ? <em>{item.badge}</em> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function Topbar({
  query,
  onQuery,
  onSearch,
  currentUser,
  onOpenAuth,
  onOpenAdmin,
  onLogout
}: {
  query: string;
  onQuery: (value: string) => void;
  onSearch: (value: string) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== query) {
      inputRef.current.value = query;
    }
  }, [query]);

  function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const value = inputRef.current?.value ?? "";
    onQuery(value);
    onSearch(value);
  }

  return (
    <header className="topbar">
      <form className="search-box" onSubmit={submitSearch}>
        <input
          name="query"
          ref={inputRef}
          defaultValue={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="精确搜索片名 / TMDB ID"
        />
        <button type="submit" title="精确搜索">
          <Search size={20} />
        </button>
      </form>
      <div className="top-actions">
        <button type="button" title="会员专区">
          <Crown size={18} />
          <span>会员专区</span>
        </button>
        <button type="button" title="下载客户端">
          <Download size={18} />
          <span>下载客户端</span>
        </button>
        <button type="button" title="观看历史">
          <History size={18} />
        </button>
        <button type="button" title="通知">
          <Bell size={18} />
        </button>
        {currentUser?.role === "admin" ? (
          <button type="button" onClick={onOpenAdmin} title="后台管理">
            <Settings size={18} />
            <span>后台管理</span>
          </button>
        ) : null}
        {currentUser ? (
          <button type="button" onClick={onLogout} title="退出登录">
            <UserRound size={18} />
            <span>{currentUser.username} · {vipLabel(currentUser)}</span>
          </button>
        ) : (
          <button className="avatar" type="button" onClick={onOpenAuth} title="登录/注册">
            <UserRound size={18} />
          </button>
        )}
      </div>
    </header>
  );
}

function AuthModal({
  onClose,
  onAuthed
}: {
  onClose: () => void;
  onAuthed: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState(mode === "login" ? "admin" : "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthed(result.user);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-backdrop">
      <form className="auth-modal" onSubmit={submit}>
        <div className="auth-head">
          <strong>{mode === "login" ? "登录" : "注册"}</strong>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="至少 6 位" />
        </label>
        {message ? <p>{message}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
        </button>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setUsername(mode === "login" ? "" : "admin");
            setPassword("");
            setMessage("");
          }}
        >
          {mode === "login" ? "没有账号？注册用户" : "已有账号？去登录"}
        </button>
      </form>
    </div>
  );
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

function isAListWatchResource(resource: DownloadResource | undefined) {
  const url = resource?.url.trim() ?? "";
  if (!resource || resource.type !== "115" || !url) return false;
  if (url.startsWith("/")) return true;
  return /^https?:\/\//i.test(url) && !/115\.com/i.test(url);
}

function playableResourceCount(item: MediaItem) {
  return item.resources?.filter(isAListWatchResource).length ?? 0;
}

function downloadResourceCount(item: MediaItem) {
  return item.resources?.filter((resource) => !isAListWatchResource(resource)).length ?? 0;
}

function shortText(value: string, max = 84) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function pickFeaturedItem(items: MediaItem[]) {
  return [...items]
    .sort((left, right) => {
      const rightScore = (right.backdropPath ? 8 : 0) + playableResourceCount(right) * 3 + (right.rating ?? 0);
      const leftScore = (left.backdropPath ? 8 : 0) + playableResourceCount(left) * 3 + (left.rating ?? 0);
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
        playableResourceCount(item) * 2 +
        (item.rating ?? 0);
      return { item, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.item);
}

function hasVipAccess(user: User | null) {
  return Boolean(user?.vip || user?.role === "admin");
}

function vipLabel(user: User) {
  if (user.role === "admin") return "管理员";
  if (user.vip && user.vipUntil) return `VIP至${new Date(user.vipUntil).toISOString().slice(0, 10)}`;
  if (user.vip) return "VIP";
  if (user.vipUntil) return "VIP已过期";
  return "普通用户";
}

function absoluteUrl(path: string) {
  return `${window.location.origin}${path}`;
}

function DetailView({
  item,
  currentUser,
  relatedItems,
  onOpenAuth,
  onBack,
  onSelectRelated
}: {
  item: MediaItem;
  currentUser: User | null;
  relatedItems: MediaItem[];
  onOpenAuth: () => void;
  onBack: () => void;
  onSelectRelated: (item: MediaItem) => void;
}) {
  const resources = useMemo(() => item.resources ?? [], [item.resources]);
  const vip = hasVipAccess(currentUser);
  const playableResources = useMemo(() => resources.filter(isAListWatchResource), [resources]);
  const downloadCount = downloadResourceCount(item);
  const fallbackResource = resources.find((resource) => resource.type === "115");
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerNotice, setPlayerNotice] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const selectedPlayableResource = playableResources.find((resource) => resource.id === selectedResourceId) ?? playableResources[0];
  const playableResource = selectedPlayableResource ?? fallbackResource;
  const canWatchOnline = vip && Boolean(selectedPlayableResource);
  const playerSrc = selectedPlayableResource ? watchUrl(item.id, selectedPlayableResource.id) : "";

  useEffect(() => {
    setShowPlayer(false);
    setPlayerNotice("");
    setSelectedResourceId(playableResources[0]?.id ?? "");
  }, [item.id, currentUser?.role, currentUser?.vip, playableResources]);

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
  }

  return (
    <section className="detail-view">
      <button className="back-button" onClick={onBack} type="button">
        <ArrowLeft size={18} />
        返回
      </button>
      <div className="detail-hero">
        {item.backdropPath ? <img src={item.backdropPath} alt="" /> : null}
        <div className="detail-shade" />
        <div className="detail-info">
          <div className="detail-poster">
            <PosterImage item={item} />
          </div>
          <div className="detail-copy">
            <span className="detail-label">
              <Crown size={15} />
              {item.access} · {item.category}
            </span>
            <h1>{item.title}</h1>
            <p className="detail-subtitle">
              {item.originalTitle ? `${item.originalTitle} · ` : ""}
              {item.year ?? "未知年份"} · {item.region} · {item.status}
            </p>
            <div className="detail-tags">
              {item.rating ? <span>TMDB {item.rating}</span> : null}
              {item.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            <p className="overview">{item.overview}</p>
            <p className="cast-line">{item.cast.length ? `主演：${item.cast.join(" / ")}` : "TMDB 条目暂未绑定演员信息"}</p>
            <div className="detail-metrics">
              <span>
                <Play size={15} />
                {playableResources.length} 个在线播放源
              </span>
              <span>
                <Download size={15} />
                {downloadCount} 个下载入口
              </span>
              <span>
                <Crown size={15} />
                {vip ? "当前可观看" : "VIP可观看"}
              </span>
            </div>
            {playableResource ? (
              <div className="detail-actions">
                <button
                  className="play-now-button"
                  type="button"
                  onClick={() => {
                    if (!vip) {
                      onOpenAuth();
                      return;
                    }
                    if (!canWatchOnline) {
                      setShowPlayer(false);
                      setPlayerNotice("在线观看需要在后台把 115 资源地址填写为 AList 路径，例如 /电影/片名.mkv。普通 115 分享链接仅作为下载入口。");
                      return;
                    }
                    setPlayerNotice("");
                    setShowPlayer(true);
                  }}
                >
                  <Play size={18} fill="currentColor" />
                  {!vip ? "VIP登录后播放" : canWatchOnline ? "立即播放" : "配置AList后播放"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="watch-layout">
        <div className="download-panel">
          <div className="panel-title">
            <span>{showPlayer && canWatchOnline ? "在线观看" : "下载资源"}</span>
            <small>{resources.length} 条</small>
          </div>
          {playerNotice ? <div className="player-notice">{playerNotice}</div> : null}
          {vip && playableResources.length > 1 ? (
            <div className="watch-resource-grid">
              {playableResources.map((resource, index) => (
                <button
                  className={classNames("episode-button", selectedPlayableResource?.id === resource.id && "active")}
                  key={resource.id}
                  type="button"
                  onClick={() => {
                    setSelectedResourceId(resource.id);
                    setPlayerNotice("");
                    setShowPlayer(true);
                  }}
                >
                  <span>{resource.title || `第${index + 1}集`}</span>
                  <small>{resource.size || resource.note || "AList在线播放"}</small>
                </button>
              ))}
            </div>
          ) : null}
          {showPlayer && selectedPlayableResource && canWatchOnline ? (
            <div className="online-player">
              <video
                key={selectedPlayableResource.id}
                controls
                autoPlay
                src={playerSrc}
                poster={item.backdropPath}
                onError={() => setPlayerNotice("视频已经解析成功，但当前浏览器无法解码这个文件。此片源是 H.265/HEVC，网页播放不稳定；建议换 H.264/AAC 版本，或复制播放地址用 PotPlayer/VLC 打开。")}
              />
              <div className="stream-actions">
                <button type="button" onClick={() => copy(absoluteUrl(playerSrc))}>复制播放地址</button>
                <a href={playerSrc} download>
                  下载原片
                </a>
              </div>
              <p>网页播放器最稳的是 H.264/AAC MP4；H.265/HEVC、部分 4K 或特殊封装建议转码后再在线播放。</p>
            </div>
          ) : !vip ? (
            <div className="player-placeholder">
              <Crown size={36} />
              <span>VIP会员才可以查看 115 网盘链接、磁力下载链接和在线播放。</span>
              <button className="locked-action" type="button" onClick={onOpenAuth}>登录 / 注册</button>
            </div>
          ) : resources.length ? (
            <div className="download-list">
              {resources.map((resource) => (
                <div className="download-row" key={resource.id}>
                  <div>
                    <strong>{resource.title || downloadLabel(resource)}</strong>
                    <small>
                      {downloadLabel(resource)}
                      {resource.size ? ` · ${resource.size}` : ""}
                      {resource.note ? ` · ${resource.note}` : ""}
                    </small>
                    {resource.code ? <small>提取码：{resource.code}</small> : null}
                  </div>
                  <div className="download-actions">
                    <button type="button" onClick={() => copy(resource.url)}>复制</button>
                    <a href={resource.url} target="_blank" rel="noreferrer">
                      下载
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="player-placeholder">
              <Settings size={36} />
              <span>这个条目还没有添加 115 网盘或磁力下载链接</span>
            </div>
          )}
        </div>

        <aside className="episode-panel">
          <div className="panel-title">
            <span>资源说明</span>
            <small>下载</small>
          </div>
          <div className="download-help">
            <p>VIP会员可在线观看，播放地址由服务端通过 AList/OpenList 解析 115 文件路径生成。</p>
            <p>VIP会员也可查看 115 网盘和磁力下载入口。</p>
          </div>
          <div className="resource-summary">
            <div>
              <strong>{playableResources.length}</strong>
              <span>在线播放</span>
            </div>
            <div>
              <strong>{downloadCount}</strong>
              <span>下载入口</span>
            </div>
            <div>
              <strong>{item.episodes?.length ?? 0}</strong>
              <span>集数资料</span>
            </div>
          </div>
          {relatedItems.length ? (
            <div className="related-block">
              <div className="panel-title">
                <span>同类推荐</span>
                <small>{relatedItems.length} 部</small>
              </div>
              <div className="related-list">
                {relatedItems.map((related) => (
                  <button key={related.id} type="button" onClick={() => onSelectRelated(related)}>
                    {related.posterPath ? <img src={related.posterPath} alt="" /> : <span className="related-poster-fallback"><Film size={18} /></span>}
                    <span>
                      <strong>{related.title}</strong>
                      <small>
                        {related.year ?? "未知年份"} · {related.category} · {related.rating ? `TMDB ${related.rating}` : related.status}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
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
  const featured = !loading && !searchMode ? pickFeaturedItem(items) : undefined;
  const playableTotal = items.filter((item) => playableResourceCount(item) > 0).length;
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
        <button className="expand-button" type="button">
          展开
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="filters">
        <FilterRow label="类型" values={genreFilters} active={filters.genre} onChange={(genre) => setFilters({ ...filters, genre })} />
        <FilterRow label="资费" values={accessFilters} active={filters.access} onChange={(access) => setFilters({ ...filters, access })} />
        <FilterRow label="地区" values={regionFilters} active={filters.region} onChange={(region) => setFilters({ ...filters, region })} />
      </div>

      <Spotlight item={featured} onSelect={onSelect} />

      <div className="section-title">
        <div>
          <h2>{searchMode ? "精确搜索结果" : activeNav === "首页" ? "正在热播" : activeNav}</h2>
          <p>{searchMode ? "仅匹配准确片名、原名或 TMDB ID" : "TMDB 元数据 · 115网盘下载 · 磁力链接 · 本地媒体库"}</p>
        </div>
        <div className="section-stats">
          <span>
            <Grid2X2 size={16} />
            {items.length} 部
          </span>
          <span>
            <Play size={16} />
            {playableTotal} 可播
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
  const [activeNav, setActiveNav] = useState("电视剧");
  const [activeTab, setActiveTab] = useState("热门");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [filters, setFilters] = useState({ genre: "全部", access: "全部", region: "全部" });

  async function refreshLibrary() {
    const media = await fetchMedia();
    setItems(media);
    if (!searchMode) setDisplayItems(media);
  }

  useEffect(() => {
    refreshLibrary().finally(() => setLoading(false));
    fetchCurrentUser().then(setCurrentUser);
  }, []);

  const filteredItems = useMemo(() => {
    let next = displayItems;

    if (!searchMode && activeNav !== "首页" && activeNav !== "VIP会员") {
      next = next.filter((item) => item.category === activeNav);
    }

    if (!searchMode && activeNav === "VIP会员") {
      next = next.filter((item) => item.access !== "免费");
    }

    if (filters.genre !== "全部") {
      next = next.filter((item) => item.genres.includes(filters.genre));
    }
    if (filters.access !== "全部") {
      next = next.filter((item) => item.access === filters.access);
    }
    if (filters.region !== "全部") {
      next = next.filter((item) => item.region === filters.region);
    }

    if (activeTab === "高分好评") {
      next = [...next].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    if (activeTab === "最新上架") {
      next = [...next].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    }

    return next;
  }, [activeNav, activeTab, displayItems, filters, searchMode]);

  const relatedItems = useMemo(() => (selected ? pickRelatedItems(selected, items) : []), [items, selected]);

  function handleNav(value: string) {
    setAdminMode(false);
    setActiveNav(value);
    setSearchMode(false);
    setDisplayItems(items);
    setSelected(null);
  }

  async function handleSearch(value: string) {
    const term = value.trim();
    setQuery(term);
    setSelected(null);

    if (!term) {
      setSearchMode(false);
      setDisplayItems(items);
      return;
    }

    setLoading(true);
    setSearchMode(true);
    try {
      const result = await fetchMedia(term, true);
      setDisplayItems(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar active={activeNav} onChange={handleNav} />
      <main className="main-shell">
        <Topbar
          query={query}
          onQuery={setQuery}
          onSearch={handleSearch}
          currentUser={currentUser}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenAdmin={() => {
            setAdminMode(true);
            setSelected(null);
            setSearchMode(false);
          }}
          onLogout={() => {
            setAuthToken("");
            setCurrentUser(null);
            setAdminMode(false);
          }}
        />
        {adminMode ? (
          <AdminPanel
            library={items}
            currentUser={currentUser}
            onOpenAuth={() => setAuthOpen(true)}
            onLibraryChange={refreshLibrary}
          />
        ) : selected ? (
          <DetailView
            item={selected}
            currentUser={currentUser}
            relatedItems={relatedItems}
            onOpenAuth={() => setAuthOpen(true)}
            onBack={() => setSelected(null)}
            onSelectRelated={(item) => {
              setSelected(item);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : (
          <HomeView
            items={filteredItems}
            loading={loading}
            activeNav={activeNav}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            filters={filters}
            setFilters={setFilters}
            onSelect={setSelected}
            searchMode={searchMode}
          />
        )}
      </main>
      <div className="mobile-tabbar">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={classNames(activeNav === item.label && "active")}
              key={item.label}
              onClick={() => handleNav(item.label)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {authOpen ? (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onAuthed={(user) => {
            setCurrentUser(user);
            refreshLibrary();
          }}
        />
      ) : null}
    </div>
  );
}
