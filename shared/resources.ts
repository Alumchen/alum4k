export const resolutions = ["2160p / 4K", "1080p", "720p", "480p", "其他"] as const;
export const dynamicRanges = ["SDR", "HDR10", "HDR10+", "Dolby Vision", "HLG"] as const;
export const videoCodecs = ["H.264 / AVC", "H.265 / HEVC", "AV1", "其他"] as const;
export const availabilityLabels = { unknown: "未核验", available: "管理员确认可用", invalid: "已失效" };
export interface ResourceDetails {
  seasonNumber?: number;
  resolution?: string;
  dynamicRange?: string;
  videoCodec?: string;
  subtitles?: string;
  audio?: string;
  availability?: keyof typeof availabilityLabels;
  updatedAt?: string;
  verifiedAt?: string;
}
export function normalizeResourceDetails(input: ResourceDetails): ResourceDetails {
  const option = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value) ? value : "";
  const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 160) : "";
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
  return { resolution: option(input.resolution, resolutions), dynamicRange: option(input.dynamicRange, dynamicRanges), videoCodec: option(input.videoCodec, videoCodecs),
    subtitles: text(input.subtitles), audio: text(input.audio), availability: input.availability === "available" || input.availability === "invalid" ? input.availability : "unknown",
    updatedAt: date(input.updatedAt), verifiedAt: date(input.verifiedAt) };
}
export function resourceBadges(resource: ResourceDetails) {
  return [resource.resolution, resource.dynamicRange, resource.videoCodec, resource.subtitles ? `字幕：${resource.subtitles}` : "", resource.audio ? `音轨：${resource.audio}` : ""].filter(Boolean) as string[];
}

export function resourceDisplayMetadata(resource: ResourceDetails & { size?: string }) {
  const date = resource.updatedAt ? new Date(resource.updatedAt) : undefined;
  return {
    size: resource.size?.trim() || "大小未填写",
    quality: [resource.resolution, resource.dynamicRange, resource.videoCodec].filter(Boolean).join(" / ") || "画质未填写",
    updated: date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "更新时间未记录"
  };
}
