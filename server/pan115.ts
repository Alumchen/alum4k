import type { MediaSource, ResolvedSource } from "./types";

class SourceUnavailableError extends Error {
  status = 424;

  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

export function isSourceConfigured(source: MediaSource | undefined) {
  if (!source) return false;
  if (source.type === "direct" && source.directUrl) return true;
  if (source.type === "alist" && process.env.ALIST_BASE_URL) return true;
  return Boolean(process.env.PAN115_RESOLVER_URL);
}

async function resolveWithBridge(source: MediaSource): Promise<ResolvedSource> {
  const resolverUrl = process.env.PAN115_RESOLVER_URL?.trim();
  if (!resolverUrl) {
    throw new SourceUnavailableError("115 解析服务未配置。");
  }

  const response = await fetch(resolverUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PAN115_RESOLVER_TOKEN
        ? { authorization: `Bearer ${process.env.PAN115_RESOLVER_TOKEN}` }
        : {})
    },
    body: JSON.stringify(source)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new SourceUnavailableError(`115 解析失败：${response.status} ${detail}`);
  }

  const payload = (await response.json()) as Partial<ResolvedSource>;
  if (!payload.playUrl) {
    throw new SourceUnavailableError("115 解析服务没有返回 playUrl。");
  }

  return { playUrl: payload.playUrl, expiresAt: payload.expiresAt };
}

async function resolveWithAlist(source: MediaSource): Promise<ResolvedSource> {
  const baseUrl = process.env.ALIST_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.ALIST_TOKEN;
  if (!baseUrl || !source.path) {
    throw new SourceUnavailableError("AList 115 挂载未配置。");
  }

  const response = await fetch(`${baseUrl}/api/fs/get`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: token } : {})
    },
    body: JSON.stringify({ path: source.path })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new SourceUnavailableError(`AList 请求失败：${response.status} ${detail}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: {
      raw_url?: string;
      sign?: string;
      name?: string;
    };
  };

  if (payload.code && payload.code !== 200) {
    throw new SourceUnavailableError(payload.message ?? "AList 未返回有效视频地址。");
  }

  if (payload.data?.raw_url) {
    return { playUrl: payload.data.raw_url };
  }

  const encodedPath = source.path.split("/").map(encodeURIComponent).join("/");
  const signed = payload.data?.sign ? `?sign=${encodeURIComponent(payload.data.sign)}` : "";
  return { playUrl: `${baseUrl}/d${encodedPath}${signed}` };
}

export async function resolveSource(source: MediaSource | undefined): Promise<ResolvedSource> {
  if (!source) {
    throw new SourceUnavailableError("这个条目还没有绑定 115 视频源。");
  }

  if (source.type === "direct" && source.directUrl) {
    return { playUrl: source.directUrl };
  }

  if (source.type === "alist") {
    return resolveWithAlist(source);
  }

  return resolveWithBridge(source);
}

export { SourceUnavailableError };
