import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

interface ParallaxImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Max vertical drift as a % of the frame height. Kept small on purpose. */
  strength?: number;
}

/**
 * Image inside a fixed-ratio frame that drifts slightly as the frame crosses
 * the viewport. Transform-only (no layout work), rAF-throttled, only listens
 * while on screen, and stays completely still under prefers-reduced-motion.
 */
export function ParallaxImage({ src, alt, className, strength = 6 }: ParallaxImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || typeof IntersectionObserver === "undefined") return;

    let raf = 0;
    let active = false;

    const update = () => {
      raf = 0;
      const rect = frame.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // -1 when the frame is entering at the bottom, +1 when leaving at the top.
      const progress = Math.max(-1, Math.min(1, (vh / 2 - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2)));
      img.style.transform = `translate3d(0, ${(-progress * strength).toFixed(2)}%, 0) scale(1.14)`;
    };
    const onScroll = () => {
      if (active && !raf) raf = requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver((entries) => {
      active = entries.some((e) => e.isIntersecting);
      if (active) onScroll();
    });
    observer.observe(frame);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      img.style.transform = "";
    };
  }, [strength]);

  return (
    <div ref={frameRef} className={cn("relative overflow-hidden bg-tf-navy", className)}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover will-change-transform motion-reduce:!transform-none"
        style={{ transform: "scale(1.14)" }}
      />
    </div>
  );
}
