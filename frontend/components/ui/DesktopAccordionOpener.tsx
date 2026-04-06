"use client";

import { useEffect } from "react";

/** Ensures all .mobile-accordion <details> elements have `open` on desktop.
 *  Uses a MutationObserver so elements added after the initial render
 *  (async data, client-side navigation, Suspense boundaries) are also handled. */
export default function DesktopAccordionOpener() {
  useEffect(() => {
    const BREAKPOINT = 600;
    const isDesktop = () => window.innerWidth >= BREAKPOINT;

    const openAll = () => {
      if (!isDesktop()) return;
      document.querySelectorAll<HTMLDetailsElement>("details.mobile-accordion").forEach((el) => {
        el.open = true;
      });
    };

    // Open everything currently in the DOM
    openAll();

    // Watch for new details elements added after initial render
    const observer = new MutationObserver((mutations) => {
      if (!isDesktop()) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLDetailsElement && node.classList.contains("mobile-accordion")) {
            node.open = true;
          } else if (node instanceof Element) {
            node.querySelectorAll<HTMLDetailsElement>("details.mobile-accordion").forEach((el) => {
              el.open = true;
            });
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Handle viewport resize crossing the breakpoint
    const mq = window.matchMedia(`(min-width: ${BREAKPOINT}px)`);
    mq.addEventListener("change", openAll);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", openAll);
    };
  }, []);

  return null;
}
