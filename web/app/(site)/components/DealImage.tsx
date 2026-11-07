"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Listing photo from Marktplaats' image CDN. Plain <img> on purpose: the URLs are already sized
 * by Marktplaats and change with every scan, so routing them through the image optimiser would
 * only spend its quota. Falls back to a category icon when the photo is gone.
 */
export function DealImage({ src, alt, icon, eager = false }: { src: string | null; alt: string; icon: IconName; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError on the client — check once.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (!src || failed) {
    return <div className="ph" role="img" aria-label={alt}><Icon name={icon} size={28} /></div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} className="img-cover" src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async"
      referrerPolicy="no-referrer" width={400} height={300} onError={() => setFailed(true)} />
  );
}
