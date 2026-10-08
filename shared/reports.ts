export const reportReasons = ["链接失效", "提取码错误", "资源不符", "其他"] as const;
export interface ResourceReport {
  id: string; mediaId: string; mediaTitle: string; resourceId: string; resourceTitle: string;
  reason: typeof reportReasons[number]; note: string; reporter: string; status: "pending" | "resolved" | "dismissed";
  reply: string; createdAt: string; updatedAt: string;
}
