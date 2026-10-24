export const postKinds = ["文章", "问答", "视频", "资料"] as const;
export type PostKind = typeof postKinds[number];
export type ReviewStatus = "pending" | "published" | "rejected";
export interface ChipPost {
  id: string; title: string; content: string; category: string; kind: PostKind;
  tags: string[]; cover: string; link: string; author: string; authorName: string;
  createdAt: string; updatedAt: string; status: ReviewStatus; reviewNote: string;
  pinned: boolean; featured: boolean; locked: boolean; likes: string[]; saves: string[];
}
export interface ChipComment { id: string; postId: string; author: string; authorName: string; content: string; createdAt: string; status: ReviewStatus; }
export interface ChipSettings { name: string; description: string; announcement: string; guidelines: string; categories: string[]; reviewPosts: boolean; reviewComments: boolean; }
export interface ChipStore { revision: number; settings: ChipSettings; posts: ChipPost[]; comments: ChipComment[]; }
export interface PublicChipPost extends Omit<ChipPost, "likes" | "saves" | "reviewNote"> { likeCount: number; saved: boolean; liked: boolean; commentCount: number; reviewNote?: string; }
export interface ChipFeed { settings: ChipSettings; items: PublicChipPost[]; total: number; page: number; pages: number; hot: PublicChipPost[]; stats: { posts: number; comments: number; contributors: number }; }
export function chipHref(value: string) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } }
