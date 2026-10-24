import type { PluginManifest } from "../../shared/plugins";

export default {
  schemaVersion: 1, id: "alum4k", version: "1.0.0", name: "Alum4K",
  description: "影视资料检索、115 网盘与磁力资源管理。", category: "影视资源",
  entry: "/yingshi", adminEntry: "/yingshi/admin", icon: "film", logo: "/brand.svg"
} satisfies PluginManifest;
