"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const NAVIGATION_SCROLL_KEY = "app:navigation-scroll-intent";
const INTENT_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_NAVIGATION_SCROLL_DELAY_MS = 80;
const DEFAULT_SCROLL_ANIMATION_DURATION_MS = 460;

type NavigationScrollIntent = {
  pathname: string;
  targetId: string | null;
  delay: number;
  startAtTop: boolean;
  createdAt: number;
};

const DEFAULT_SCROLL_TARGETS: Record<string, string | null> = {
  "/dashboard": null,
  "/batch": "batch-primary-section",
  "/analysis": "analysis-workspace-navigation",
  "/history": "history-first-block",
  "/account": "account-first-block",
};

export function getDefaultNavigationTarget(pathname: string): string | null {
  return DEFAULT_SCROLL_TARGETS[pathname] ?? null;
}

function readNavigationScrollIntent(): NavigationScrollIntent | null {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(NAVIGATION_SCROLL_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NavigationScrollIntent>;
    const pathname = typeof parsed.pathname === "string" ? parsed.pathname : "";
    const targetId = typeof parsed.targetId === "string" ? parsed.targetId : null;
    const delay =
      typeof parsed.delay === "number" && Number.isFinite(parsed.delay)
        ? parsed.delay
        : DEFAULT_NAVIGATION_SCROLL_DELAY_MS;
    const startAtTop = parsed.startAtTop === true;
    const createdAt =
      typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : 0;

    if (!pathname || Date.now() - createdAt > INTENT_MAX_AGE_MS) {
      sessionStorage.removeItem(NAVIGATION_SCROLL_KEY);
      return null;
    }

    return { pathname, targetId, delay, startAtTop, createdAt };
  } catch {
    sessionStorage.removeItem(NAVIGATION_SCROLL_KEY);
    return null;
  }
}

export function queueNavigationScroll(
  pathname: string,
  targetId?: string | null,
  delay = DEFAULT_NAVIGATION_SCROLL_DELAY_MS,
  startAtTop = false
): void {
  if (typeof window === "undefined") return;

  const payload: NavigationScrollIntent = {
    pathname,
    targetId: targetId === undefined ? getDefaultNavigationTarget(pathname) : targetId,
    delay,
    startAtTop,
    createdAt: Date.now(),
  };

  sessionStorage.setItem(NAVIGATION_SCROLL_KEY, JSON.stringify(payload));
}

export function clearNavigationScroll(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(NAVIGATION_SCROLL_KEY);
}

function getPendingNavigationScroll(
  pathname: string
): NavigationScrollIntent | null {
  const intent = readNavigationScrollIntent();
  if (!intent) return null;
  return intent.pathname === pathname ? intent : null;
}

function easeInOutQuad(progress: number) {
  if (progress < 0.5) {
    return 2 * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

export function animateWindowScrollTo(
  targetTop: number,
  duration = DEFAULT_SCROLL_ANIMATION_DURATION_MS
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const startingTop = window.scrollY;
  const clampedTarget = Math.max(0, targetTop);
  const distance = clampedTarget - startingTop;

  if (Math.abs(distance) < 2 || duration <= 0) {
    window.scrollTo({ top: clampedTarget, left: 0, behavior: "auto" });
    return () => {};
  }

  let frameId = 0;
  const startTime = window.performance.now();

  const step = (now: number) => {
    const elapsed = Math.min(1, (now - startTime) / duration);
    const easedProgress = easeInOutQuad(elapsed);
    window.scrollTo({
      top: startingTop + distance * easedProgress,
      left: 0,
      behavior: "auto",
    });

    if (elapsed < 1) {
      frameId = window.requestAnimationFrame(step);
    }
  };

  frameId = window.requestAnimationFrame(step);

  return () => {
    window.cancelAnimationFrame(frameId);
  };
}

export function animateElementScrollTo(
  element: HTMLElement,
  targetTop: number,
  duration = DEFAULT_SCROLL_ANIMATION_DURATION_MS
): () => void {
  const startingTop = element.scrollTop;
  const clampedTarget = Math.max(0, targetTop);
  const distance = clampedTarget - startingTop;

  if (Math.abs(distance) < 2 || duration <= 0) {
    element.scrollTo({ top: clampedTarget, behavior: "auto" });
    return () => {};
  }

  let frameId = 0;
  const startTime = window.performance.now();

  const step = (now: number) => {
    const elapsed = Math.min(1, (now - startTime) / duration);
    const easedProgress = easeInOutQuad(elapsed);
    element.scrollTo({
      top: startingTop + distance * easedProgress,
      behavior: "auto",
    });

    if (elapsed < 1) {
      frameId = window.requestAnimationFrame(step);
    }
  };

  frameId = window.requestAnimationFrame(step);

  return () => {
    window.cancelAnimationFrame(frameId);
  };
}

export function triggerElementNavigationScroll(
  container: HTMLElement,
  targetId?: string | null,
  delay = DEFAULT_NAVIGATION_SCROLL_DELAY_MS
): () => void {
  if (!targetId) {
    return animateElementScrollTo(container, 0);
  }

  let intervalId: number | null = null;
  let cancelAnimation = () => {};

  const tryScrollToTarget = () => {
    const element = document.getElementById(targetId);
    if (!element || !container.contains(element)) {
      return false;
    }

    const scrollMarginTop = Number.parseFloat(
      window.getComputedStyle(element).scrollMarginTop || "0"
    );
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const nextTop =
      container.scrollTop +
      (elementRect.top - containerRect.top) -
      (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0);

    cancelAnimation();
    cancelAnimation = animateElementScrollTo(container, nextTop);
    return true;
  };

  const timeoutId = window.setTimeout(() => {
    if (tryScrollToTarget()) {
      return;
    }

    let attempts = 0;
    intervalId = window.setInterval(() => {
      attempts += 1;
      if (tryScrollToTarget() || attempts >= 12) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    }, 120);
  }, delay);

  return () => {
    window.clearTimeout(timeoutId);
    cancelAnimation();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  };
}

export function triggerNavigationScroll(
  targetId?: string | null,
  delay = DEFAULT_NAVIGATION_SCROLL_DELAY_MS,
  startAtTop = false
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (startAtTop) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  if (!targetId) {
    if (startAtTop) {
      return () => {};
    }

    return animateWindowScrollTo(0);
  }

  let intervalId: number | null = null;
  let cancelAnimation = () => {};

  const getTargetTop = (element: HTMLElement) => {
    const scrollMarginTop = Number.parseFloat(
      window.getComputedStyle(element).scrollMarginTop || "0"
    );

    return Math.max(
      0,
      window.scrollY + element.getBoundingClientRect().top - (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0)
    );
  };

  const tryScrollToTarget = () => {
    const element = document.getElementById(targetId);
    if (!element) return false;

    cancelAnimation();
    cancelAnimation = animateWindowScrollTo(getTargetTop(element));
    return true;
  };

  const timeoutId = window.setTimeout(() => {
    if (tryScrollToTarget()) {
      return;
    }

    let attempts = 0;
    intervalId = window.setInterval(() => {
      attempts += 1;
      if (tryScrollToTarget() || attempts >= 12) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    }, 120);
  }, delay);

  return () => {
    window.clearTimeout(timeoutId);
    cancelAnimation();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  };
}

export function useApplyNavigationScroll(pathname: string, ready = true): void {
  const appliedIntentRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!ready) return;

    const intent = getPendingNavigationScroll(pathname);
    if (!intent) return;

    const signature = `${intent.pathname}:${intent.targetId || "top"}:${intent.startAtTop ? "reset" : "preserve"}:${intent.createdAt}`;
    if (appliedIntentRef.current === signature) {
      return;
    }

    appliedIntentRef.current = signature;
    clearNavigationScroll();
    return triggerNavigationScroll(intent.targetId, intent.delay, intent.startAtTop);
  }, [pathname, ready]);

  useEffect(() => {
    appliedIntentRef.current = null;
  }, [pathname]);
}