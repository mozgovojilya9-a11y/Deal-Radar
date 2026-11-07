"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Adds the `in` class to `.rv` elements as they scroll into view. One observer per page. */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".rv:not(.in)"));
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((el) => el.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
