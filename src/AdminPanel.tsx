import {
  CheckCircle2,
  Database,
  Download,
  FileVideo,
  FilePlus2,
  FolderOpen,
  FolderUp,
  ListPlus,
  Loader2,
  Pencil,
  RefreshCcw,
  Search,
  ShieldAlert,
  TestTube2,
  Users,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { checkResource, collectTmdb, deleteMedia, fetchTmdbDetail, fetchUsers, listAList, saveMedia, searchTmdb, setUserVip } from "./api";
import type { AListEntry, AListListResult, DownloadResource, MediaItem, MediaType, ResourceCheckResult, User } from "./types";

const emptyDraft: MediaItem = {
  id: "",
  mediaType: "tv",
  title: "",
  originalTitle: "",
  year: undefined,
  category: "电视剧",
  region: "美国",
  access: "会员",
  status: "待更新",
  rating: undefined,
  genres: [],
  cast: [],
  overview: "",
  posterPath: "",
  backdropPath: "",
  resources: [],
  episodes: []
};

function splitList(value: string) {
  return value
    .split(/[,\n，]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinList(value: string[] | undefined) {
  return value?.join("，") ?? "";
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitParts(value: string) {
  return value.split("|").map((part) => part.trim());
}

function fileNameFromPath(path: string) {
  const cleanPath = path.split("?")[0] ?? path;
  const fileName = cleanPath.split("/").filter(Boolean).pop() ?? cleanPath;
  return decodeURIComponent(fileName).replace(/\.[^.]+$/, "");
}

function resourceTitleFromPath(path: string, index: number, total: number) {
  const fileName = fileNameFromPath(path);
  const episodeMatch = fileName.match(/第\s*0*(\d{1,4})\s*[集话]/) ?? fileName.match(/\b(?:e|ep)\s*0*(\d{1,4})\b/i);
  if (episodeMatch?.[1]) return `第${String(Number(episodeMatch[1])).padStart(2, "0")}集`;
  if (total === 1) return "正片";
  return fileName || `第${String(index + 1).padStart(2, "0")}集`;
}

function parentPathFrom(path: string) {
  const cleanPath = path.split("|")[0]?.trim().split("?")[0] ?? "";
  if (!cleanPath || cleanPath === "/") return "/115网盘";
  const normalized = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function formatBytes(bytes: number | undefined) {
  if (!bytes || !Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function addVipDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function vipStatusText(user: User) {
  if (user.role === "admin") return "管理员 · 永久VIP";
  if (user.vip && user.vipUntil) return `VIP会员 · 至 ${dateInputValue(user.vipUntil)}`;
  if (user.vip) return "VIP会员 · 永久";
  if (user.vipUntil) return `VIP已过期 · ${dateInputValue(user.vipUntil)}`;
  return "非VIP";
}

function isAListResource(resource: DownloadResource) {
  const url = resource.url.trim();
  if (resource.type !== "115" || !url) return false;
  if (url.startsWith("/")) return true;
  return /^https?:\/\//i.test(url) && !/115\.com/i.test(url);
}

function aListText(resources: DownloadResource[] | undefined) {
  return resources?.filter(isAListResource).map((resource) => resource.url).join("\n") ?? "";
}

function pan115Text(resources: DownloadResource[] | undefined) {
  return (
    resources
      ?.filter((resource) => resource.type === "115" && !isAListResource(resource))
      .map((resource) => [resource.url, resource.code ?? "", resource.size ?? "", resource.note ?? ""].join(" | ").replace(/( \| )+$/g, ""))
      .join("\n") ?? ""
  );
}

function magnetText(resources: DownloadResource[] | undefined) {
  return (
    resources
      ?.filter((resource) => resource.type === "magnet")
      .map((resource) => [resource.url, resource.size ?? "", resource.note ?? ""].join(" | ").replace(/( \| )+$/g, ""))
      .join("\n") ?? ""
  );
}

function collectResources(aListPaths: string, pan115Links: string, magnetLinks: string): DownloadResource[] {
  const aListLines = splitLines(aListPaths);
  const aListResources = aListLines.map((line, index) => {
    const [url, size, note] = splitParts(line);
    return {
      id: `alist-${String(index + 1).padStart(2, "0")}`,
      type: "115" as const,
      title: resourceTitleFromPath(url, index, aListLines.length),
      url,
      size,
      note: note || (aListLines.length > 1 ? "AList多集路径" : "AList路径")
    };
  });

  const pan115Resources = splitLines(pan115Links).map((line, index) => {
    const [url, code, size, note] = splitParts(line);
    return {
      id: `pan115-${String(index + 1).padStart(2, "0")}`,
      type: "115" as const,
      title: "115网盘",
      url,
      code,
      size,
      note: note || "115分享链接"
    };
  });

  const magnetResources = splitLines(magnetLinks).map((line, index) => {
    const [url, size, note] = splitParts(line);
    return {
      id: `magnet-${String(index + 1).padStart(2, "0")}`,
      type: "magnet" as const,
      title: "磁力下载",
      url,
      size,
      note
    };
  });

  return [...aListResources, ...pan115Resources, ...magnetResources].filter((resource) => resource.url);
}

function defaultAListResourceFor(item: MediaItem): DownloadResource[] {
  const title = item.title || item.originalTitle;
  if (!title) return [];
  const category = item.category || (item.mediaType === "movie" ? "电影" : "电视剧");
  return [
    {
      id: "alist-default",
      type: "115",
      title: "115网盘",
      url: `/${category}/${title}.mkv`,
      note: "默认AList路径"
    }
  ];
}

function defaultResourcesFor(item: MediaItem) {
  return item.resources?.length ? item.resources : defaultAListResourceFor(item);
}

function toDraft(item: MediaItem): MediaItem {
  return {
    ...emptyDraft,
    ...item,
    genres: item.genres ?? [],
    cast: item.cast ?? [],
    resources: defaultResourcesFor(item),
    episodes: item.episodes ?? []
  };
}

export default function AdminPanel({
  library,
  currentUser,
  onOpenAuth,
  onLibraryChange
}: {
  library: MediaItem[];
  currentUser: User | null;
  onOpenAuth: () => void;
  onLibraryChange: () => Promise<void>;
}) {
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<MediaItem[]>([]);
  const [draft, setDraft] = useState<MediaItem>(emptyDraft);
  const [genreText, setGenreText] = useState("");
  const [castText, setCastText] = useState("");
  const [aListPathInput, setAListPathInput] = useState("");
  const [pan115Input, setPan115Input] = useState("");
  const [magnetInput, setMagnetInput] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [vipDateDrafts, setVipDateDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [resourceCheck, setResourceCheck] = useState<ResourceCheckResult | null>(null);
  const [alistBrowserPath, setAlistBrowserPath] = useState("/115网盘");
  const [alistDirectory, setAlistDirectory] = useState<AListListResult | null>(null);
  const [alistMessage, setAlistMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingResource, setCheckingResource] = useState(false);
  const [loadingAList, setLoadingAList] = useState(false);
  const [fallbackSearch, setFallbackSearch] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  async function refreshUsers() {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    const nextUsers = await fetchUsers();
    setUsers(nextUsers);
    setVipDateDrafts(
      Object.fromEntries(nextUsers.map((user) => [user.username, dateInputValue(user.vipUntil)]))
    );
  }

  useEffect(() => {
    refreshUsers().catch(() => setUsers([]));
  }, [isAdmin]);

  function applyDraft(item: MediaItem) {
    const next = toDraft(item);
    setDraft(next);
    setGenreText(joinList(next.genres));
    setCastText(joinList(next.cast));
    setAListPathInput(aListText(next.resources));
    setPan115Input(pan115Text(next.resources));
    setMagnetInput(magnetText(next.resources));
    setAlistBrowserPath(parentPathFrom(aListText(next.resources).split("\n")[0] ?? ""));
    setAlistDirectory(null);
    setAlistMessage("");
    setResourceCheck(null);
    setMessage(`已载入：${next.title}`);
  }

  async function handleTmdbSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = tmdbQuery.trim();
    if (!query) return;

    setLoading(true);
    setMessage("");
    try {
      const result = await searchTmdb(query);
      setTmdbResults(result.items);
      setFallbackSearch(Boolean(result.fallback));
      setMessage(result.fallback ? "未配置 TMDB Token，当前展示本地匹配结果。" : `找到 ${result.items.length} 个 TMDB 结果。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TMDB 搜索失败。");
    } finally {
      setLoading(false);
    }
  }

  async function importTmdb(item: MediaItem) {
    setLoading(true);
    setMessage("");
    try {
      const detail = item.tmdbId ? await fetchTmdbDetail(item.mediaType, item.tmdbId) : item;
      applyDraft({
        ...detail,
        access: draft.access,
        resources: collectResources(aListPathInput, pan115Input, magnetInput)
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "采集 TMDB 详情失败。");
    } finally {
      setLoading(false);
    }
  }

  function payloadFromDraft(): MediaItem {
    return {
      ...draft,
      genres: splitList(genreText),
      cast: splitList(castText),
      resources: collectResources(aListPathInput, pan115Input, magnetInput)
    };
  }

  async function handleSave(mode: "save" | "collect") {
    if (!isAdmin) {
      setMessage("请使用管理员账号 admin 登录后再保存。");
      onOpenAuth();
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const payload = payloadFromDraft();
      const item = mode === "collect" && payload.tmdbId ? await collectTmdb(payload) : await saveMedia(payload, payload.id || undefined);
      applyDraft(item);
      await onLibraryChange();
      setMessage(`已保存：${item.title}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      setMessage("请使用管理员账号 admin 登录后再删除。");
      onOpenAuth();
      return;
    }
    if (!window.confirm("确认删除这个条目？")) return;

    setLoading(true);
    try {
      await deleteMedia(id);
      await onLibraryChange();
      if (draft.id === id) applyDraft(emptyDraft);
      setMessage("已删除媒体条目。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setLoading(false);
    }
  }

  async function updateVip(user: User, vip: boolean, vipUntil?: string | null) {
    setLoading(true);
    setMessage("");
    try {
      const updated = await setUserVip(user.username, vip, vipUntil);
      setUsers((nextUsers) => nextUsers.map((entry) => (entry.username === updated.username ? updated : entry)));
      setVipDateDrafts((drafts) => ({ ...drafts, [updated.username]: dateInputValue(updated.vipUntil) }));
      setMessage(`${updated.username} 已更新为：${vipStatusText(updated)}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新 VIP 失败。");
    } finally {
      setLoading(false);
    }
  }

  function setVipForDays(user: User, days: number) {
    updateVip(user, true, addVipDays(days));
  }

  function setVipForever(user: User) {
    updateVip(user, true, null);
  }

  function setVipCustomDate(user: User) {
    const date = vipDateDrafts[user.username];
    if (!date) {
      setMessage("请先选择 VIP 到期日期。");
      return;
    }
    updateVip(user, true, date);
  }

  async function handleCheckPlayable() {
    if (!isAdmin) {
      setMessage("请使用管理员账号 admin 登录后再检测资源。");
      onOpenAuth();
      return;
    }

    const [url, size, note] = splitParts(splitLines(aListPathInput)[0] ?? "");
    if (!url) {
      setResourceCheck({
        ok: false,
        playable: false,
        message: "请先填写 AList 路径。",
        warnings: []
      });
      return;
    }

    setCheckingResource(true);
    setResourceCheck(null);
    try {
      const result = await checkResource({
        id: "check-alist",
        type: "115",
        title: "AList在线播放",
        url,
        size,
        note
      });
      setResourceCheck(result);
    } catch (error) {
      setResourceCheck({
        ok: false,
        playable: false,
        message: error instanceof Error ? error.message : "资源检测失败。",
        warnings: []
      });
    } finally {
      setCheckingResource(false);
    }
  }

  function appendAListPaths(paths: string[]) {
    const cleanPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (!cleanPaths.length) return;

    const lines = splitLines(aListPathInput);
    const existing = new Set(lines.map((line) => splitParts(line)[0]));
    const additions = cleanPaths.filter((path) => !existing.has(path));
    if (!additions.length) {
      setAlistMessage("这些视频路径已经在 AList 输入框里了。");
      return;
    }

    setAListPathInput([...lines, ...additions].join("\n"));
    setResourceCheck(null);
    setAlistMessage(`已加入 ${additions.length} 条 AList 视频路径。`);
  }

  async function loadAListDirectory(path = alistBrowserPath) {
    if (!isAdmin) {
      setMessage("请使用管理员账号 admin 登录后再读取 AList 目录。");
      onOpenAuth();
      return;
    }

    const targetPath = path.trim() || "/";
    setLoadingAList(true);
    setAlistMessage("");
    try {
      const result = await listAList(targetPath);
      setAlistDirectory(result);
      setAlistBrowserPath(result.path);
      setAlistMessage(`已读取 ${result.entries.length} 个项目。`);
    } catch (error) {
      setAlistMessage(error instanceof Error ? error.message : "AList 目录读取失败。");
    } finally {
      setLoadingAList(false);
    }
  }

  function handleAListEntry(entry: AListEntry) {
    if (entry.isDir) {
      loadAListDirectory(entry.path);
      return;
    }
    if (entry.isVideo) appendAListPaths([entry.path]);
  }

  function importCurrentDirectoryVideos() {
    const paths = alistDirectory?.entries.filter((entry) => entry.isVideo && !entry.isDir).map((entry) => entry.path) ?? [];
    if (!paths.length) {
      setAlistMessage("当前目录没有可导入的视频文件。");
      return;
    }
    appendAListPaths(paths);
  }

  return (
    <section className="admin-view">
      <div className="admin-title">
        <div>
          <h1>后台管理</h1>
          <p>TMDB 采集 · 媒体库维护 · 115网盘与磁力下载</p>
        </div>
        <button className="admin-icon-button" type="button" onClick={() => onLibraryChange()} title="刷新媒体库">
          <RefreshCcw size={18} />
        </button>
      </div>

      {!isAdmin ? (
        <div className="admin-message warning">
          <ShieldAlert size={17} />
          <span>当前未以管理员登录。后台保存、删除需要使用用户名 admin 登录。</span>
          <button type="button" onClick={onOpenAuth}>登录</button>
        </div>
      ) : null}

      {message ? (
        <div className="admin-message">
          <CheckCircle2 size={17} />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="admin-layout">
        <div className="admin-column">
          <section className="admin-section">
            <div className="admin-section-head">
              <Search size={18} />
              <span>TMDB 采集</span>
            </div>
            <form className="admin-search" onSubmit={handleTmdbSearch}>
              <input value={tmdbQuery} onChange={(event) => setTmdbQuery(event.target.value)} placeholder="输入片名，例如 三体" />
              <button type="submit" disabled={loading}>
                {loading ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
                搜索
              </button>
            </form>
            {fallbackSearch ? <p className="admin-note">配置 `.env` 的 `TMDB_BEARER_TOKEN` 后可采集真实 TMDB 详情。</p> : null}
            <div className="tmdb-results">
              {tmdbResults.map((item) => (
                <button className="tmdb-result" key={item.id} type="button" onClick={() => importTmdb(item)}>
                  {item.posterPath ? <img src={item.posterPath} alt={item.title} /> : <span className="mini-poster" />}
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.mediaType === "movie" ? "电影" : "剧集"} · {item.year ?? "未知年份"} · TMDB {item.rating ?? "-"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head">
              <Database size={18} />
              <span>媒体库</span>
            </div>
            <div className="library-list">
              {library.map((item) => (
                <div className="library-row" key={item.id}>
                  <button type="button" onClick={() => applyDraft(item)}>
                    <strong>{item.title}</strong>
                    <small>
                      {item.category} · {item.region} · {item.resources?.length ?? 0} 个下载资源
                    </small>
                  </button>
                  <div>
                    <button type="button" onClick={() => applyDraft(item)} title="编辑">
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} title="删除">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head">
              <Users size={18} />
              <span>用户 / VIP</span>
            </div>
            {isAdmin ? (
              <div className="user-list">
                {users.map((user) => (
                  <div className="user-row vip-row" key={user.username}>
                    <div className="user-summary">
                      <strong>{user.username}</strong>
                      <small>
                        {vipStatusText(user)}
                        {user.createdAt ? ` · 注册 ${dateInputValue(user.createdAt)}` : ""}
                      </small>
                    </div>
                    {user.role === "admin" ? (
                      <span className="vip-badge">内置管理员</span>
                    ) : (
                      <div className="vip-controls">
                        <button type="button" onClick={() => setVipForDays(user, 30)} disabled={loading}>30天</button>
                        <button type="button" onClick={() => setVipForDays(user, 90)} disabled={loading}>90天</button>
                        <button type="button" onClick={() => setVipForDays(user, 365)} disabled={loading}>1年</button>
                        <button type="button" onClick={() => setVipForever(user)} disabled={loading}>永久</button>
                        <label>
                          到期日
                          <input
                            value={vipDateDrafts[user.username] ?? ""}
                            onChange={(event) => setVipDateDrafts((drafts) => ({ ...drafts, [user.username]: event.target.value }))}
                            type="date"
                          />
                        </label>
                        <button type="button" onClick={() => setVipCustomDate(user)} disabled={loading}>设到期日</button>
                        <button className="danger-action" type="button" onClick={() => updateVip(user, false, null)} disabled={loading || !user.vip}>
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-note">管理员登录后可管理已注册用户的 VIP 状态。</p>
            )}
          </section>
        </div>

        <form className="admin-editor" onSubmit={(event) => event.preventDefault()}>
          <div className="admin-section-head">
            <FilePlus2 size={18} />
            <span>影视条目</span>
          </div>

          <div className="admin-form-grid">
            <label>
              标题
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              原名
              <input value={draft.originalTitle ?? ""} onChange={(event) => setDraft({ ...draft, originalTitle: event.target.value })} />
            </label>
            <label>
              TMDB ID
              <input value={draft.tmdbId ?? ""} onChange={(event) => setDraft({ ...draft, tmdbId: Number(event.target.value) || undefined })} />
            </label>
            <label>
              类型
              <select
                value={draft.mediaType}
                onChange={(event) => {
                  const mediaType = event.target.value as MediaType;
                  setDraft({ ...draft, mediaType, category: mediaType === "movie" ? "电影" : "电视剧" });
                }}
              >
                <option value="tv">剧集</option>
                <option value="movie">电影</option>
              </select>
            </label>
            <label>
              分类
              <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            </label>
            <label>
              地区
              <input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} />
            </label>
            <label>
              资费
              <select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value as MediaItem["access"] })}>
                <option value="免费">免费</option>
                <option value="会员">会员</option>
                <option value="VIP">VIP</option>
              </select>
            </label>
            <label>
              状态
              <input value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} />
            </label>
            <label>
              年份
              <input value={draft.year ?? ""} onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) || undefined })} />
            </label>
            <label>
              评分
              <input value={draft.rating ?? ""} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) || undefined })} />
            </label>
          </div>

          <label className="admin-wide-field">
            简介
            <textarea value={draft.overview} onChange={(event) => setDraft({ ...draft, overview: event.target.value })} rows={4} />
          </label>

          <div className="admin-form-grid">
            <label>
              类型标签
              <input value={genreText} onChange={(event) => setGenreText(event.target.value)} placeholder="剧情，科幻，悬疑" />
            </label>
            <label>
              主演
              <input value={castText} onChange={(event) => setCastText(event.target.value)} placeholder="演员1，演员2" />
            </label>
            <label>
              海报
              <input value={draft.posterPath ?? ""} onChange={(event) => setDraft({ ...draft, posterPath: event.target.value })} />
            </label>
            <label>
              背景图
              <input value={draft.backdropPath ?? ""} onChange={(event) => setDraft({ ...draft, backdropPath: event.target.value })} />
            </label>
          </div>

          <div className="source-editor">
            <div className="admin-section-head">
              <Download size={18} />
              <span>下载资源</span>
            </div>
            <div className="admin-resource-grid">
              <label className="resource-field">
                AList 路径
                <textarea
                  value={aListPathInput}
                  onChange={(event) => setAListPathInput(event.target.value)}
                  rows={3}
                  placeholder="/115网盘/电影/片名/片名.mp4"
                />
              </label>
              <label className="resource-field">
                115 网盘链接
                <textarea
                  value={pan115Input}
                  onChange={(event) => setPan115Input(event.target.value)}
                  rows={3}
                  placeholder="https://115.com/s/xxxx | 提取码 | 4K/20GB | 备注"
                />
              </label>
              <label className="resource-field">
                磁力链接
                <textarea
                  value={magnetInput}
                  onChange={(event) => setMagnetInput(event.target.value)}
                  rows={3}
                  placeholder="magnet:?xt=urn:btih:... | 大小 | 备注"
                />
              </label>
            </div>
            <p className="admin-note">AList 路径用于 VIP 在线播放；115 网盘链接和磁力链接仅作为下载入口。每个输入框可一行填一条资源。</p>
            <div className="alist-browser">
              <div className="alist-browser-title">
                <span>
                  <FolderOpen size={17} />
                  AList 文件选择器
                </span>
                <small>点击视频加入路径，或批量导入当前目录视频</small>
              </div>
              <div className="alist-path-row">
                <input
                  value={alistBrowserPath}
                  onChange={(event) => setAlistBrowserPath(event.target.value)}
                  placeholder="/115网盘/电影/片名"
                />
                <button type="button" onClick={() => loadAListDirectory()} disabled={loadingAList || !isAdmin}>
                  {loadingAList ? <Loader2 className="spin" size={15} /> : <FolderOpen size={15} />}
                  打开目录
                </button>
                <button
                  type="button"
                  onClick={() => alistDirectory?.parentPath && loadAListDirectory(alistDirectory.parentPath)}
                  disabled={loadingAList || !alistDirectory?.parentPath || !isAdmin}
                >
                  <FolderUp size={15} />
                  上一级
                </button>
                <button type="button" onClick={importCurrentDirectoryVideos} disabled={loadingAList || !alistDirectory || !isAdmin}>
                  <ListPlus size={15} />
                  批量导入
                </button>
              </div>
              {alistMessage ? <div className="alist-message">{alistMessage}</div> : null}
              {alistDirectory ? (
                <div className="alist-entry-list">
                  {alistDirectory.entries.length ? (
                    alistDirectory.entries.map((entry) => (
                      <button
                        className={entry.isDir ? "alist-entry dir" : entry.isVideo ? "alist-entry video" : "alist-entry muted"}
                        key={entry.path}
                        type="button"
                        onClick={() => handleAListEntry(entry)}
                        disabled={!entry.isDir && !entry.isVideo}
                        title={entry.path}
                      >
                        {entry.isDir ? <FolderOpen size={17} /> : <FileVideo size={17} />}
                        <span>
                          <strong>{entry.name}</strong>
                          <small>
                            {entry.isDir ? "目录" : entry.isVideo ? "视频文件" : "非视频文件"}
                            {entry.size ? ` · ${formatBytes(entry.size)}` : ""}
                            {entry.modified ? ` · ${new Date(entry.modified).toLocaleString()}` : ""}
                          </small>
                        </span>
                        <em>{entry.isDir ? "打开" : entry.isVideo ? "加入" : "跳过"}</em>
                      </button>
                    ))
                  ) : (
                    <div className="alist-empty">当前目录为空。</div>
                  )}
                </div>
              ) : null}
            </div>
            {resourceCheck ? (
              <div className={resourceCheck.playable ? "resource-check good" : resourceCheck.ok ? "resource-check warning" : "resource-check bad"}>
                <strong>{resourceCheck.message}</strong>
                <span>
                  {resourceCheck.status ? `HTTP ${resourceCheck.status}` : ""}
                  {resourceCheck.contentType ? ` · ${resourceCheck.contentType}` : ""}
                  {resourceCheck.size ? ` · ${resourceCheck.size}` : ""}
                  {resourceCheck.codecHint ? ` · ${resourceCheck.codecHint}` : ""}
                  {resourceCheck.containerHint ? ` · ${resourceCheck.containerHint}` : ""}
                </span>
                {resourceCheck.warnings.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </div>
            ) : null}
            <div className="admin-actions">
              <button type="button" onClick={() => setAListPathInput(`${aListPathInput}${aListPathInput ? "\n" : ""}/${draft.category || "电影"}/${draft.title || "片名"}.mp4`)}>
                加AList路径
              </button>
              <button type="button" onClick={() => setPan115Input(`${pan115Input}${pan115Input ? "\n" : ""}https://115.com/s/xxxx | 提取码 |  | `)}>
                加115链接
              </button>
              <button type="button" onClick={() => setMagnetInput(`${magnetInput}${magnetInput ? "\n" : ""}magnet:?xt=urn:btih: |  | `)}>
                加磁力链接
              </button>
              <button type="button" onClick={handleCheckPlayable} disabled={checkingResource || loading || !isAdmin}>
                {checkingResource ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
                检测播放资源
              </button>
              <button type="button" onClick={() => handleSave("save")} disabled={loading || !isAdmin}>
                保存
              </button>
              <button type="button" onClick={() => handleSave("collect")} disabled={loading || !draft.tmdbId || !isAdmin}>
                采集并保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
