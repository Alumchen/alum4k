export const mediaBase = "/yingshi";
export const mediaAdmin = "/yingshi/admin";
export function isMediaHome(path: string) { return path === mediaBase || path === mediaBase + "/"; }
export function isMediaArea(path: string) { return isMediaHome(path) || path.startsWith(mediaBase + "/"); }
