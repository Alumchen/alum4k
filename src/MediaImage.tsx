import { useState, type ImgHTMLAttributes } from "react";
import { tmdbImageFile, tmdbImageSource, type TmdbImageSize } from "../shared/tmdb-images";

type Kind = "poster" | "backdrop" | "thumbnail";
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "onError"> & { src: string; fallbackSrc?: string; kind?: Kind; eager?: boolean };
const variants: Record<Kind, { sizes: TmdbImageSize[]; defaultSize: TmdbImageSize; display: string }> = {
  poster: { sizes: ["w185", "w342", "w500"], defaultSize: "w342", display: "(max-width: 560px) calc((100vw - 44px) / 2), 220px" },
  backdrop: { sizes: ["w300", "w780", "w1280"], defaultSize: "w780", display: "(max-width: 560px) 100vw, (min-width: 2100px) 1880px, calc(100vw - 280px)" },
  thumbnail: { sizes: ["w92", "w185"], defaultSize: "w92", display: "60px" }
};
function ImageLoader({ src, fallbackSrc, kind = "poster", eager = false, sizes, loading, decoding, fetchPriority, ...props }: Props) {
  const sources = [...new Set([src, fallbackSrc].filter((value): value is string => Boolean(value)))];
  const attempts = sources.flatMap((source) => tmdbImageFile(source) ? [{ source, direct: false }, { source, direct: true }] : [{ source, direct: false }]);
  const [attempt, setAttempt] = useState(0);
  const candidate = attempts[attempt];
  if (!candidate) return null;
  const variant = variants[kind];
  const optimized = Boolean(tmdbImageFile(candidate.source));
  return <img {...props} src={tmdbImageSource(candidate.source, variant.defaultSize, candidate.direct)}
    srcSet={optimized ? variant.sizes.map((size) => `${tmdbImageSource(candidate.source, size, candidate.direct)} ${size.slice(1)}w`).join(", ") : undefined}
    sizes={optimized ? sizes || variant.display : undefined} loading={loading || (eager ? "eager" : "lazy")} decoding={decoding || "async"} fetchPriority={fetchPriority || "auto"}
    onError={() => setAttempt((index) => index + 1)} />;
}
export default function MediaImage(props: Props) { return <ImageLoader key={`${props.src}|${props.fallbackSrc}|${props.kind}`} {...props} />; }
