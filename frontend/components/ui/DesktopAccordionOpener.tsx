"use client";

import { useEffect } from "react";

/** Programmatically adds `open` to all .mobile-accordion <details> on desktop.
 *  CSS overrides for ::details-content are unreliable in Chrome 120+ when
 *  content-visibility is also applied. Setting the attribute directly is
 *  the only cross-browser-safe way to guarantee content stays visible. */
export default function DesktopAccordionOpener() {
  useEffect(() => {
    const BREAKPOINT = 600;

    const update = () => {
      const isDesktop = window.innerWidth >= BREAKPOINT;
      document.querySelectorAll<HTMLDetailsElement>("details.mobile-accordion").forEach((el) => {
        if (isDesktop) {
          el.open = true;
        } else if (!el.dataset.userOpened) {
          el.open = false;
        }
      });
    };

    // Track user-initiated opens on mobile so resize doesn't stomp them
    const handleToggle = (event: Event) => {
      const el = event.target as HTMLDetailsElement;
      if (window.innerWidth < BREAKPOINT) {
        if (el.open) {
          el.dataset.userOpened = "1";
        } else {
          delete el.dataset.userOpened;
        }
      }
    };

    document.addEventListener("toggle", handleToggle, { capture: true });

    update();

    const mq = window.matchMedia(`(min-width: ${BREAKPOINT}px)`);
    mq.addEventListener("change", update);

    return () => {
      mq.removeEventListener("change", update);
      document.removeEventListener("toggle", handleToggle, { capture: true });
    };
  }, []);

  return null;
}
