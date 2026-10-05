import type { DownloadResource } from "./types";

const videoExtensions = new Set([".mp4", ".m4v", ".mkv", ".webm", ".mov", ".ts", ".m2ts", ".flv", ".avi"]);

export class WatchUnavailableError extends Error {
  status = 424;

  constructor(message: string) {
    super(message);
    this.name = "WatchUnavailableError";
  }
}

function alistBaseUrl() {
  return process.env.ALIST_BASE_URL?.replace(/\/+$/, "");
}

function encodePath(path: string) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function normalizeAListPath(path: string) {
  const trimmed = path.trim() || "/";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
}

function joinAListPath(parent: string, name: string) {
  const base = normalizeAListPath(parent);
  return `${base === "/" ? "" : base}/${name}`.replace(/\/{2,}/g, "/");
}

function parentAListPath(path: string) {
  const normalized = normalizeAListPath(path);
  if (normalized === "/") return "";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function extensionOf(name: string) {
  const cleanName = name.split("?")[0]?.toLowerCase() ?? "";
  const dot = cleanName.lastIndexOf(".");
  return dot >= 0 ? cleanName.slice(dot) : "";
}

export function isAListVideoName(name: string) {
  return videoExtensions.has(extensionOf(name));
}

async function resolveAlistPath(path: string) {
  const baseUrl = alistBaseUrl();
  if (!baseUrl) {
    throw new WatchUnavailableError("在线观看需要配置 ALIST_BASE_URL，并在后台把 115 资源地址填写为 AList 路径。");
  }

  const response = await fetch(`${baseUrl}/api/fs/get`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.ALIST_TOKEN ? { authorization: process.env.ALIST_TOKEN } : {})
    },
    body: JSON.stringify({ path: normalizeAListPath(path) })
  });

  if (!response.ok) {
    throw new WatchUnavailableError(`AList 解析失败：${response.status}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: {
      raw_url?: string;
      sign?: string;
    };
  };

  if (payload.code && payload.code !== 200) {
    throw new WatchUnavailableError(payload.message ?? "AList 未返回有效播放地址。");
  }

  if (payload.data?.raw_url) return payload.data.raw_url;

  const signed = payload.data?.sign ? `?sign=${encodeURIComponent(payload.data.sign)}` : "";
  return `${baseUrl}/d${encodePath(normalizeAListPath(path))}${signed}`;
}

export async function listAListDirectory(path: string) {
  const baseUrl = alistBaseUrl();
  if (!baseUrl) {
    throw new WatchUnavailableError("请先在 .env 配置 ALIST_BASE_URL。");
  }

  const currentPath = normalizeAListPath(path);
  const response = await fetch(`${baseUrl}/api/fs/list`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.ALIST_TOKEN ? { authorization: process.env.ALIST_TOKEN } : {})
    },
    body: JSON.stringify({
      path: currentPath,
      page: 1,
      per_page: 300,
      refresh: false
    })
  });

  if (!response.ok) {
    throw new WatchUnavailableError(`AList 目录读取失败：${response.status}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: {
      content?: Array<{
        name?: string;
        size?: number;
        is_dir?: boolean;
        modified?: string;
        type?: number;
      }> | null;
    };
  };

  if (payload.code && payload.code !== 200) {
    throw new WatchUnavailableError(payload.message ?? "AList 未返回目录列表。");
  }

  const entries = (payload.data?.content ?? [])
    .filter((entry) => entry?.name)
    .map((entry) => {
      const name = String(entry.name);
      const isDir = Boolean(entry.is_dir);
      return {
        name,
        path: joinAListPath(currentPath, name),
        isDir,
        size: Number.isFinite(entry.size) ? entry.size : undefined,
        modified: entry.modified,
        isVideo: !isDir && isAListVideoName(name)
      };
    })
    .sort((left, right) => {
      if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true });
    });

  return {
    path: currentPath,
    parentPath: parentAListPath(currentPath),
    entries
  };
}

export async function resolveWatchUrl(resource: DownloadResource | undefined) {
  if (!resource || resource.type !== "115") {
    throw new WatchUnavailableError("没有可在线观看的 115 资源。");
  }

  const url = resource.url.trim();
  if (!url) {
    throw new WatchUnavailableError("115 资源地址为空。");
  }

  if (url.startsWith("/")) {
    return resolveAlistPath(url);
  }

  const baseUrl = alistBaseUrl();
  if (baseUrl && url.startsWith(`${baseUrl}/`)) {
    return url;
  }

  throw new WatchUnavailableError("在线观看不能直接打开 115 分享链接，请在后台填写 AList 文件路径，例如 /电影/片名.mkv。");
}
