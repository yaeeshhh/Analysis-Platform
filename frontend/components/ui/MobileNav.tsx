"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type NavMetric = {
  left: number;
  top: number;
  width: number;
  height: number;
  center: number;
};

type LiquidDragState = {
  active: boolean;
  startIndex: number;
  targetIndex: number;
  startX: number;
  currentX: number;
};

type LiquidGlideState = {
  active: boolean;
  fromIndex: number;
  targetIndex: number;
  progress: number;
};

type LiquidSnapshot = {
  visible: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  center: number;
  distortion: number;
  drift: number;
  focus: number;
};

const NAV_DRAG_THRESHOLD = 12;
const NAV_CLICK_GLIDE_BASE_MS = 156;
const NAV_CLICK_GLIDE_STEP_MS = 44;
const NAV_CLICK_GLIDE_MAX_MS = 284;

function createIdleDragState(): LiquidDragState {
  return {
    active: false,
    startIndex: -1,
    targetIndex: -1,
    startX: 0,
    currentX: 0,
  };
}

function createIdleGlideState(): LiquidGlideState {
  return {
    active: false,
    fromIndex: -1,
    targetIndex: -1,
    progress: 0,
  };
}

function isItemActive(pathname: string, match: string) {
  return pathname === match || pathname.startsWith(`${match}/`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolateNumber(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function easeInOutCubic(value: number) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getClickGlideDuration(fromIndex: number, targetIndex: number) {
  const steps = Math.max(1, Math.abs(targetIndex - fromIndex));
  return Math.min(
    NAV_CLICK_GLIDE_MAX_MS,
    NAV_CLICK_GLIDE_BASE_MS + (steps - 1) * NAV_CLICK_GLIDE_STEP_MS
  );
}

function getMetric(
  metrics: Array<NavMetric | null>,
  index: number,
  fallbackMetric: NavMetric
) {
  return (index >= 0 ? metrics[index] : null) ?? fallbackMetric;
}

function buildLiquidBlobStyle({
  left,
  top,
  width,
  height,
  distortion,
  drift,
  focus,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  distortion: number;
  drift: number;
  focus: number;
}): CSSProperties {
  const scale = 1.012 + distortion * 0.05 + focus * 0.01;
  const baseRadius = Math.max(height * 0.48, 18);
  const topLeft = baseRadius + distortion * 8 + Math.max(-drift, 0) * 4;
  const topRight = baseRadius + distortion * 8 + Math.max(drift, 0) * 4;
  const bottomRight = baseRadius + distortion * 5 + Math.max(-drift, 0) * 3;
  const bottomLeft = baseRadius + distortion * 5 + Math.max(drift, 0) * 3;
  const verticalTop = Math.max(baseRadius - distortion * 1.5, 16);
  const verticalBottom = Math.max(baseRadius - distortion * 3.5, 14);

  return {
    transform: `translate3d(${left}px, ${top}px, 0) scale(${scale.toFixed(3)})`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: 1,
    borderRadius: `${topLeft.toFixed(1)}px ${topRight.toFixed(1)}px ${bottomRight.toFixed(1)}px ${bottomLeft.toFixed(1)}px / ${verticalTop.toFixed(1)}px ${verticalTop.toFixed(1)}px ${verticalBottom.toFixed(1)}px ${verticalBottom.toFixed(1)}px`,
    ["--liquid-sheen-x" as string]: `${50 + drift * 18}%`,
    ["--liquid-distortion" as string]: distortion.toFixed(3),
    ["--liquid-drift" as string]: drift.toFixed(3),
    ["--liquid-focus" as string]: focus.toFixed(3),
    ["--liquid-blur" as string]: `${(6 + distortion * 4).toFixed(2)}px`,
    ["--liquid-highlight-opacity" as string]: `${(0.24 + focus * 0.26).toFixed(3)}`,
    ["--liquid-translate-x" as string]: `${(drift * 7).toFixed(2)}px`,
    ["--liquid-scale-x" as string]: (1 + distortion * 0.08).toFixed(3),
    ["--liquid-scale-y" as string]: (1 - distortion * 0.04).toFixed(3),
    ["--liquid-edge-wave" as string]: `${(0.8 + distortion * 2.4).toFixed(2)}px`,
    ["--liquid-edge-opacity" as string]: `${(0.055 + distortion * 0.09).toFixed(3)}`,
  };
}

function getLiquidSnapshot(
  metrics: Array<NavMetric | null>,
  activeIndex: number,
  dragState: LiquidDragState,
  glideState: LiquidGlideState
): LiquidSnapshot | null {
  const fallbackMetric =
    (activeIndex >= 0 ? metrics[activeIndex] : null) ??
    metrics.find((metric): metric is NavMetric => metric !== null);

  if (!fallbackMetric) {
    return null;
  }

  const measuredMetrics = metrics.filter((metric): metric is NavMetric => metric !== null);

  if (dragState.active) {
    const targetMetric = getMetric(metrics, dragState.targetIndex, fallbackMetric);
    const minLeft = measuredMetrics.length
      ? Math.min(...measuredMetrics.map((metric) => metric.left))
      : targetMetric.left;
    const maxRight = measuredMetrics.length
      ? Math.max(...measuredMetrics.map((metric) => metric.left + metric.width))
      : targetMetric.left + targetMetric.width;
    const pointerCenter = clamp(
      dragState.currentX,
      minLeft + targetMetric.width / 2,
      maxRight - targetMetric.width / 2
    );
    const distortion = Math.min(
      1,
      Math.abs(dragState.currentX - dragState.startX) /
        Math.max(targetMetric.width * 0.85, 1)
    );
    const drift = clamp(
      (pointerCenter - targetMetric.center) / Math.max(targetMetric.width * 0.55, 1),
      -1,
      1
    );
    const width = targetMetric.width;
    const height = targetMetric.height + 4;
    const left = clamp(pointerCenter - width / 2, minLeft, maxRight - width);
    const top = targetMetric.top - 2;

    return {
      visible: true,
      left,
      top,
      width,
      height,
      center: left + width / 2,
      distortion,
      drift,
      focus: 0.84 + distortion * 0.16,
    };
  }

  if (glideState.active) {
    const fromMetric = getMetric(metrics, glideState.fromIndex, fallbackMetric);
    const targetMetric = getMetric(metrics, glideState.targetIndex, fallbackMetric);
    const progress = glideState.progress;
    const midPulse = Math.sin(Math.PI * progress);
    const width = interpolateNumber(fromMetric.width, targetMetric.width, progress);
    const height = interpolateNumber(fromMetric.height, targetMetric.height, progress) + 4;
    const left = interpolateNumber(fromMetric.left, targetMetric.left, progress);
    const top = interpolateNumber(fromMetric.top, targetMetric.top, progress) - 2;
    const travel = Math.abs(targetMetric.center - fromMetric.center);
    const distortion = Math.min(
      0.76,
      0.14 + travel / Math.max(fromMetric.width + targetMetric.width, 1) / 5 + midPulse * 0.24
    );
    const drift =
      clamp(
        (targetMetric.center - fromMetric.center) / Math.max(width * 1.08, 1),
        -1,
        1
      ) * (0.56 + midPulse * 0.44);

    return {
      visible: true,
      left,
      top,
      width,
      height,
      center: left + width / 2,
      distortion,
      drift,
      focus: 0.66 + midPulse * 0.34,
    };
  }

  return {
    visible: false,
    left: fallbackMetric.left,
    top: fallbackMetric.top - 2,
    width: fallbackMetric.width,
    height: fallbackMetric.height + 4,
    center: fallbackMetric.center,
    distortion: 0,
    drift: 0,
    focus: 0,
  };
}

function getLiquidBlobStyle(snapshot: LiquidSnapshot | null): CSSProperties {
  if (!snapshot || !snapshot.visible) {
    return {
      opacity: 0,
      ["--liquid-focus" as string]: "0",
      ["--liquid-blur" as string]: "0px",
      ["--liquid-highlight-opacity" as string]: "0",
      ["--liquid-translate-x" as string]: "0px",
      ["--liquid-scale-x" as string]: "1",
      ["--liquid-scale-y" as string]: "1",
      ["--liquid-sheen-x" as string]: "50%",
      ["--liquid-distortion" as string]: "0",
      ["--liquid-drift" as string]: "0",
      ["--liquid-edge-wave" as string]: "0px",
      ["--liquid-edge-opacity" as string]: "0",
    };
  }

  return buildLiquidBlobStyle({
    left: snapshot.left,
    top: snapshot.top,
    width: snapshot.width,
    height: snapshot.height,
    distortion: snapshot.distortion,
    drift: snapshot.drift,
    focus: snapshot.focus,
  });
}

function getLiquidSurfaceStyle(snapshot: LiquidSnapshot | null): CSSProperties {
  if (!snapshot || !snapshot.visible) {
    return {
      ["--nav-lens-center-x" as string]: "50%",
      ["--nav-lens-underlay-opacity" as string]: "0",
      ["--nav-lens-shadow-opacity" as string]: "0",
      ["--nav-lens-highlight-opacity" as string]: "0",
      ["--nav-lens-blur" as string]: "0px",
      ["--nav-lens-offset-x" as string]: "0px",
      ["--nav-lens-ripple-opacity" as string]: "0",
    };
  }

  return {
    ["--nav-lens-center-x" as string]: `${snapshot.center}px`,
    ["--nav-lens-underlay-opacity" as string]: `${(0.18 + snapshot.focus * 0.48).toFixed(3)}`,
    ["--nav-lens-shadow-opacity" as string]: `${(0.1 + snapshot.distortion * 0.28).toFixed(3)}`,
    ["--nav-lens-highlight-opacity" as string]: `${(0.08 + snapshot.focus * 0.22).toFixed(3)}`,
    ["--nav-lens-blur" as string]: `${(6 + snapshot.distortion * 9).toFixed(2)}px`,
    ["--nav-lens-offset-x" as string]: `${(snapshot.drift * 10).toFixed(2)}px`,
    ["--nav-lens-ripple-opacity" as string]: `${(0.05 + snapshot.distortion * 0.1).toFixed(3)}`,
  };
}

function getItemLensFactor(
  metric: NavMetric | null,
  snapshot: LiquidSnapshot | null,
  active: boolean
) {
  const activeBase = active ? 0.16 : 0;

  if (!metric) {
    return activeBase;
  }

  if (!snapshot || !snapshot.visible) {
    return activeBase;
  }

  const reach = Math.max(
    metric.width * 0.88,
    snapshot.width * (0.82 + snapshot.distortion * 0.24)
  );
  const distance = Math.abs(metric.center - snapshot.center);
  const normalized = clamp(1 - distance / Math.max(reach, 1), 0, 1);
  const magnification = Math.pow(normalized, 1.45) * (0.68 + snapshot.focus * 0.32);

  return clamp(Math.max(activeBase, magnification), 0, 1);
}

function getNavItemStyle(
  metric: NavMetric | null,
  snapshot: LiquidSnapshot | null,
  active: boolean
): CSSProperties {
  const lensFactor = getItemLensFactor(metric, snapshot, active);

  return {
    ["--nav-item-lens" as string]: lensFactor.toFixed(3),
    ["--nav-item-scale" as string]: (1 + lensFactor * 0.16).toFixed(3),
    ["--nav-item-shift-y" as string]: `${(-1.4 * lensFactor).toFixed(2)}px`,
    ["--nav-item-brightness" as string]: (0.94 + lensFactor * 0.16).toFixed(3),
    ["--nav-item-saturate" as string]: (1 + lensFactor * 0.2).toFixed(3),
    ["--nav-item-shell-opacity" as string]: `${(active ? 0.18 + lensFactor * 0.22 : lensFactor * 0.5).toFixed(3)}`,
    ["--nav-item-shadow-opacity" as string]: `${(active ? 0.1 + lensFactor * 0.18 : lensFactor * 0.14).toFixed(3)}`,
  };
}

const navItems = [
  {
    href: "/dashboard",
    match: "/dashboard",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/batch",
    match: "/batch",
    label: "Uploads",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    href: "/analysis",
    match: "/analysis",
    label: "Analysis",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: "/history",
    match: "/history",
    label: "History",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    href: "/account",
    match: "/account",
    label: "Account",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const suppressClickRef = useRef(false);
  const clickGlideFrameRef = useRef<number | null>(null);
  const dragStateRef = useRef<LiquidDragState>(createIdleDragState());
  const [appMode, setAppMode] = useState(false);
  const [itemMetrics, setItemMetrics] = useState<Array<NavMetric | null>>([]);
  const [dragState, setDragState] = useState<LiquidDragState>(createIdleDragState());
  const [glideState, setGlideState] = useState<LiquidGlideState>(createIdleGlideState());

  const activeIndex = navItems.findIndex((item) => isItemActive(pathname, item.match));

  function updateDragState(nextState: LiquidDragState) {
    dragStateRef.current = nextState;
    setDragState(nextState);
  }

  function clearClickGlide() {
    if (clickGlideFrameRef.current !== null) {
      window.cancelAnimationFrame(clickGlideFrameRef.current);
      clickGlideFrameRef.current = null;
    }

    setGlideState(createIdleGlideState());
  }

  function measureItemMetrics() {
    const navElement = navRef.current;
    if (!navElement) {
      return;
    }

    const navRect = navElement.getBoundingClientRect();
    setItemMetrics(
      navItems.map((_, index) => {
        const item = itemRefs.current[index];
        if (!item) {
          return null;
        }

        const rect = item.getBoundingClientRect();
        return {
          left: rect.left - navRect.left,
          top: rect.top - navRect.top,
          width: rect.width,
          height: rect.height,
          center: rect.left - navRect.left + rect.width / 2,
        };
      })
    );
  }

  function getRelativePointerX(clientX: number) {
    const navRect = navRef.current?.getBoundingClientRect();
    if (!navRect) {
      return 0;
    }

    return clamp(clientX - navRect.left, 0, navRect.width);
  }

  function getNearestItemIndex(pointerX: number) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    itemMetrics.forEach((metric, index) => {
      if (!metric) {
        return;
      }

      const distance = Math.abs(metric.center - pointerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  function handleAppNavPointerDown(index: number) {
    return (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      clearClickGlide();
      suppressClickRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);

      const pointerX = getRelativePointerX(event.clientX);
      updateDragState({
        active: true,
        startIndex: index,
        targetIndex: index,
        startX: pointerX,
        currentX: pointerX,
      });
    };
  }

  function handleAppNavPointerMove(event: PointerEvent<HTMLElement>) {
    const currentState = dragStateRef.current;
    if (!currentState.active) {
      return;
    }

    const pointerX = getRelativePointerX(event.clientX);
    updateDragState({
      ...currentState,
      currentX: pointerX,
      targetIndex: getNearestItemIndex(pointerX),
    });
  }

  function handleAppNavPointerEnd() {
    const currentState = dragStateRef.current;
    if (!currentState.active) {
      return;
    }

    updateDragState(createIdleDragState());

    const travel = Math.abs(currentState.currentX - currentState.startX);
    const targetIndex =
      currentState.targetIndex >= 0 ? currentState.targetIndex : currentState.startIndex;

    if (
      travel > NAV_DRAG_THRESHOLD &&
      targetIndex >= 0 &&
      targetIndex !== currentState.startIndex
    ) {
      suppressClickRef.current = true;
      if (!isItemActive(pathname, navItems[targetIndex].match)) {
        router.push(navItems[targetIndex].href);
      }
    }
  }

  function handleAppNavClick(index: number, href: string) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }

      if (isItemActive(pathname, navItems[index].match)) {
        return;
      }

      if (!appMode || activeIndex < 0 || !itemMetrics[activeIndex] || !itemMetrics[index]) {
        router.push(href);
        return;
      }

      event.preventDefault();
      clearClickGlide();

      const duration = getClickGlideDuration(activeIndex, index);
      const startTime = window.performance.now();

      const animateGlide = (frameTime: number) => {
        const progress = clamp((frameTime - startTime) / duration, 0, 1);
        const easedProgress = easeInOutCubic(progress);

        setGlideState({
          active: true,
          fromIndex: activeIndex,
          targetIndex: index,
          progress: easedProgress,
        });

        if (progress < 1) {
          clickGlideFrameRef.current = window.requestAnimationFrame(animateGlide);
          return;
        }

        clickGlideFrameRef.current = null;
        setGlideState(createIdleGlideState());
        router.push(href);
      };

      setGlideState({
        active: true,
        fromIndex: activeIndex,
        targetIndex: index,
        progress: 0,
      });

      clickGlideFrameRef.current = window.requestAnimationFrame(animateGlide);
    };
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQueries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: minimal-ui)"),
      window.matchMedia("(display-mode: fullscreen)"),
    ];

    const syncAppMode = () => {
      const standaloneNavigator = window.navigator as NavigatorWithStandalone;
      const isStandalone =
        mediaQueries.some((query) => query.matches) ||
        Boolean(standaloneNavigator.standalone);
      setAppMode(isStandalone);
    };

    syncAppMode();
    mediaQueries.forEach((query) => query.addEventListener("change", syncAppMode));
    window.addEventListener("appinstalled", syncAppMode);
    window.addEventListener("focus", syncAppMode);

    return () => {
      mediaQueries.forEach((query) => query.removeEventListener("change", syncAppMode));
      window.removeEventListener("appinstalled", syncAppMode);
      window.removeEventListener("focus", syncAppMode);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clickGlideFrameRef.current !== null) {
        window.cancelAnimationFrame(clickGlideFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!appMode) {
      return;
    }

    let frameId = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        measureItemMetrics();
      });
    };

    scheduleMeasure();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    if (resizeObserver) {
      if (navRef.current) {
        resizeObserver.observe(navRef.current);
      }
      itemRefs.current.forEach((item) => {
        if (item) {
          resizeObserver.observe(item);
        }
      });
    }

    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, [appMode, pathname]);

  const liquidSnapshot = getLiquidSnapshot(itemMetrics, activeIndex, dragState, glideState);
  const liquidBlobStyle = getLiquidBlobStyle(liquidSnapshot);
  const navSurfaceStyle = getLiquidSurfaceStyle(liquidSnapshot);
  const currentLensIndex = liquidSnapshot ? getNearestItemIndex(liquidSnapshot.center) : -1;
  const navInteractionClass = dragState.active
    ? "mobile-bottom-nav-app-dragging"
    : glideState.active
      ? "mobile-bottom-nav-app-gliding"
      : "";

  return (
    <nav
      ref={navRef}
      className={`mobile-bottom-nav phone-only ${appMode ? "mobile-bottom-nav-app" : ""} ${navInteractionClass}`}
      style={appMode ? navSurfaceStyle : undefined}
      onPointerMove={appMode ? handleAppNavPointerMove : undefined}
      onPointerUp={appMode ? handleAppNavPointerEnd : undefined}
      onPointerCancel={appMode ? handleAppNavPointerEnd : undefined}
    >
      {appMode ? (
        <span
          aria-hidden="true"
          className="mobile-bottom-nav-liquid-blob"
          style={liquidBlobStyle}
        />
      ) : null}

      {navItems.map((item, index) => {
        const active = isItemActive(pathname, item.match);
        const dragTarget = dragState.active && currentLensIndex === index;
        const glideTarget = glideState.active && currentLensIndex === index;
        const itemStyle = appMode
          ? getNavItemStyle(itemMetrics[index] ?? null, liquidSnapshot, active)
          : undefined;

        if (appMode) {
          return (
            <button
              key={item.href}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`mobile-bottom-nav-item ${active ? "mobile-bottom-nav-item-active" : ""} ${dragTarget ? "mobile-bottom-nav-item-drag-target" : ""} ${glideTarget ? "mobile-bottom-nav-item-glide-target" : ""}`}
              style={itemStyle}
              onClick={handleAppNavClick(index, item.href)}
              onPointerDown={handleAppNavPointerDown(index)}
            >
              {item.icon}
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-bottom-nav-item ${active ? "mobile-bottom-nav-item-active" : ""}`}
          >
            {item.icon}
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
