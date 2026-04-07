"use client";

import { useEffect, useState } from "react";
import { animateElementScrollTo, animateWindowScrollTo } from "@/lib/navigationScroll";

type BackToTopButtonProps = {
  scrollContainerRef?: { current: HTMLElement | null };
  threshold?: number;
  className?: string;
};

const defaultClassName =
  "fixed bottom-24 right-4 z-[120] inline-flex items-center gap-2 rounded-full border border-[#7ad6ff]/28 bg-[#0a1623]/92 px-4 py-3 text-sm font-semibold text-[#dff7ff] shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-md transition hover:border-[#7ad6ff]/48 hover:bg-[#102033] sm:bottom-6 sm:right-6";

export default function BackToTopButton({
  scrollContainerRef,
  threshold = 520,
  className,
}: BackToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef?.current ?? null;

    const updateVisibility = () => {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      setVisible(scrollTop > threshold);
    };

    updateVisibility();

    if (container) {
      container.addEventListener("scroll", updateVisibility, { passive: true });
      window.addEventListener("resize", updateVisibility);

      return () => {
        container.removeEventListener("scroll", updateVisibility);
        window.removeEventListener("resize", updateVisibility);
      };
    }

    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [scrollContainerRef, threshold]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const container = scrollContainerRef?.current ?? null;
        if (container) {
          animateElementScrollTo(container, 0);
          return;
        }

        animateWindowScrollTo(0);
      }}
      className={className ? `${defaultClassName} ${className}` : defaultClassName}
      aria-label="Back to top"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
      <span className="hidden sm:inline">Top</span>
    </button>
  );
}