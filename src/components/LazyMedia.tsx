import { useEffect, useRef, useState } from "react";
import { getPrefetchStatus, prefetchCompletedBefore } from "@/lib/media-prefetch";
import { trackEvent } from "@/lib/analytics";

/**
 * Lazy media renderer for the intro overlay.
 *
 * - Uses IntersectionObserver so the browser only starts fetching the
 *   asset when its scene actually reaches the viewport.
 * - Adds native `loading="lazy"` / `decoding="async"` hints for images.
 * - Uses `preload="none"` on <video> and only sets `src` after intersection,
 *   so no bytes are transferred until the scene is visible.
 * - Shows an animated shimmer skeleton until the asset finishes loading,
 *   so scenes never flash with an empty box.
 */

const SKELETON_CLASS =
  "absolute inset-0 rounded-[inherit] overflow-hidden bg-white/[0.06] " +
  "before:absolute before:inset-0 before:-translate-x-full " +
  "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent " +
  "before:animate-[shimmer_1.4s_infinite]";

function Skeleton({ rounded = "rounded-lg" }: { rounded?: string }) {
  return <span aria-hidden="true" className={`${SKELETON_CLASS} ${rounded}`} />;
}

type LazyImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  eager?: boolean;
  rounded?: string;
  onError?: () => void;
};

export function LazyImage({
  src,
  alt,
  className,
  width,
  height,
  eager,
  rounded = "rounded-lg",
  onError,
}: LazyImageProps) {
  const ref = useRef<HTMLImageElement | null>(null);
  const mountedAt = useRef<number>(performance.now());
  const [ready, setReady] = useState(!!eager);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (eager || ready) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setReady(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, ready]);

  const handleLoad = () => {
    setLoaded(true);
    const now = performance.now();
    const status = getPrefetchStatus(src);
    trackEvent("intro_media_load", {
      kind: "image",
      url: src,
      display_ms: Math.round(now - mountedAt.current),
      prefetched: !!status,
      prefetch_completed_before_mount: prefetchCompletedBefore(src, mountedAt.current),
      prefetch_duration_ms: status?.completedAt
        ? Math.round(status.completedAt - status.startedAt)
        : null,
    });
  };

  return (
    <span className={`relative inline-block ${className ?? ""}`} style={{ width, height }}>
      {!loaded && !failed && <Skeleton rounded={rounded} />}
      <img
        ref={ref}
        src={ready ? src : undefined}
        alt={alt}
        className={`${className ?? ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        onLoad={handleLoad}
        onError={() => {
          setFailed(true);
          trackEvent("intro_media_error", { kind: "image", url: src });
          onError?.();
        }}
      />
    </span>
  );
}

type LazyVideoProps = {
  src: string;
  poster?: string;
  className?: string;
  width?: number;
  height?: number;
  rounded?: string;
};

export function LazyVideo({
  src,
  poster,
  className,
  width,
  height,
  rounded = "rounded-lg",
}: LazyVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const mountedAt = useRef<number>(performance.now());
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = () => {
    setLoaded(true);
    const now = performance.now();
    const status = getPrefetchStatus(src);
    trackEvent("intro_media_load", {
      kind: "video",
      url: src,
      display_ms: Math.round(now - mountedAt.current),
      prefetched: !!status,
      prefetch_completed_before_mount: prefetchCompletedBefore(src, mountedAt.current),
      prefetch_duration_ms: status?.completedAt
        ? Math.round(status.completedAt - status.startedAt)
        : null,
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setReady(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span className={`relative inline-block ${className ?? ""}`} style={{ width, height }}>
      {!loaded && <Skeleton rounded={rounded} />}
      <video
        ref={ref}
        className={`${className ?? ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        width={width}
        height={height}
        poster={poster}
        preload={ready ? "metadata" : "none"}
        muted
        playsInline
        autoPlay={ready}
        loop
        onLoadedData={handleLoad}
      >
        {ready ? <source src={src} /> : null}
      </video>
    </span>
  );
}
