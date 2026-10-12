export const tmdbImageSizes = ["w92", "w185", "w300", "w342", "w500", "w780", "w1280"] as const;
export type TmdbImageSize = typeof tmdbImageSizes[number];
export function validTmdbImage(size: string, file: string) {
  return tmdbImageSizes.includes(size as TmdbImageSize) && /^[A-Za-z0-9_-]{1,100}\.(?:jpg|jpeg|png|webp)$/.test(file);
}
export function tmdbImageFile(source: string) {
  try {
    const url = new URL(source);
    if (url.origin !== "https://image.tmdb.org" || url.username || url.password || url.search || url.hash) return;
    const match = /^\/t\/p\/(?:w[0-9]+|original)\/([^/]+)$/.exec(url.pathname);
    if (match && validTmdbImage("w342", match[1])) return match[1];
  } catch { /* Custom and relative image addresses remain unchanged. */ }
}
export function tmdbImageSource(source: string, size: TmdbImageSize, direct = false) {
  const file = tmdbImageFile(source);
  return file ? `${direct ? "https://image.tmdb.org/t/p" : "/api/images/tmdb"}/${size}/${file}` : source;
}
