export interface Invitation {
  code: string;
  createdAt: string;
  createdBy: string;
  disabled: boolean;
  usedAt?: string;
  usedBy?: string;
}
export const requestStatuses = ["pending", "processing", "fulfilled", "rejected"] as const;
export type RequestStatus = typeof requestStatuses[number];
export const requestStatusLabels: Record<RequestStatus, string> = { pending: "待处理", processing: "处理中", fulfilled: "已上架", rejected: "未采纳" };
export interface FilmRequest {
  id: string;
  username: string;
  title: string;
  mediaType: "movie" | "tv";
  year?: number;
  note: string;
  status: RequestStatus;
  reply: string;
  createdAt: string;
  updatedAt: string;
  handledBy?: string;
}
