"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MOBILE_BREAKPOINT = 960;
const FIELD_SELECTOR = "input, textarea, select";

function roundPixelValue(value: number) {
  return `${Math.max(0, Math.round(value))}px`;
}

function syncViewportMetrics() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight;
  const viewportHeight = viewport?.height ?? layoutHeight;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;
  const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
  const keyboardInset = Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);
  const mobileHeader = document.querySelector<HTMLElement>(".mobile-header");
  const mobileHeaderHeight = mobileHeader?.getBoundingClientRect().height ?? 0;

  root.style.setProperty("--app-viewport-height", roundPixelValue(viewportHeight));
  root.style.setProperty("--app-viewport-offset-top", roundPixelValue(viewportOffsetTop));
  root.style.setProperty("--app-viewport-offset-left", roundPixelValue(viewportOffsetLeft));
  root.style.setProperty("--app-keyboard-inset-bottom", roundPixelValue(keyboardInset));
  root.style.setProperty("--app-mobile-header-height", roundPixelValue(mobileHeaderHeight));
  root.dataset.mobileKeyboardOpen =
    window.innerWidth < MOBILE_BREAKPOINT && keyboardInset > 0 ? "true" : "false";
}

function revealActiveField() {
  if (typeof window === "undefined" || window.innerWidth >= MOBILE_BREAKPOINT) {
    return;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !activeElement.matches(FIELD_SELECTOR)) {
    return;
  }

  window.setTimeout(() => {
    activeElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, 180);
}

export default function ViewportInsetManager() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    let frameId = 0;

    const scheduleSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        syncViewportMetrics();
      });
    };

    const handleFocusIn = () => {
      scheduleSync();
      revealActiveField();
    };

    const handleViewportChange = () => {
      scheduleSync();
      revealActiveField();
    };

    scheduleSync();

    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    const viewport = window.visualViewport;
    const mobileHeader = document.querySelector<HTMLElement>(".mobile-header");
    const headerResizeObserver =
      isMobile && typeof ResizeObserver !== "undefined" && mobileHeader
        ? new ResizeObserver(() => {
            scheduleSync();
          })
        : null;

    if (headerResizeObserver && mobileHeader) {
      headerResizeObserver.observe(mobileHeader);
    }

    if (isMobile) {
      viewport?.addEventListener("resize", handleViewportChange);
      viewport?.addEventListener("scroll", handleViewportChange);
      document.addEventListener("focusin", handleFocusIn);
      document.addEventListener("focusout", scheduleSync);
    }
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    window.addEventListener("pageshow", scheduleSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      headerResizeObserver?.disconnect();
      if (isMobile) {
        viewport?.removeEventListener("resize", handleViewportChange);
        viewport?.removeEventListener("scroll", handleViewportChange);
        document.removeEventListener("focusin", handleFocusIn);
        document.removeEventListener("focusout", scheduleSync);
      }
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      window.removeEventListener("pageshow", scheduleSync);
    };
  }, [pathname]);

  return null;
}