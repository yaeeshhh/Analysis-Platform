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

const NAV_DRAG_THRESHOLD = 12;

function createIdleDragState(): LiquidDragState {
  return {
    active: false,
    startIndex: -1,
    targetIndex: -1,
    startX: 0,
    currentX: 0,
  };
}

function isItemActive(pathname: string, match: string) {
  return pathname === match || pathname.startsWith(`${match}/`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLiquidBlobStyle(
  metrics: Array<NavMetric | null>,
  activeIndex: number,
  dragState: LiquidDragState
): CSSProperties {
  const fallbackMetric =
    (activeIndex >= 0 ? metrics[activeIndex] : null) ??
    metrics.find((metric): metric is NavMetric => metric !== null);

  if (!fallbackMetric) {
    return { opacity: 0 };
  }

  if (!dragState.active) {
    return {
      opacity: 0,
      ["--liquid-sheen-x" as string]: "50%",
      ["--liquid-distortion" as string]: "0",
      ["--liquid-drift" as string]: "0",
    };
  }

  const targetMetric =
    (dragState.targetIndex >= 0 ? metrics[dragState.targetIndex] : null) ??
    (dragState.startIndex >= 0 ? metrics[dragState.startIndex] : null) ??
    fallbackMetric;
  const measuredMetrics = metrics.filter((metric): metric is NavMetric => metric !== null);
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
  const scale = (1.018 + distortion * 0.04).toFixed(3);
  const width = targetMetric.width;
  const height = targetMetric.height + 4;
  const left = clamp(pointerCenter - width / 2, minLeft, maxRight - width);
  const top = targetMetric.top - 2;

  return {
    transform: `translate3d(${left}px, ${top}px, 0) scale(${scale})`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: 1,
    ["--liquid-sheen-x" as string]: `${50 + drift * 18}%`,
    ["--liquid-distortion" as string]: distortion.toFixed(3),
    ["--liquid-drift" as string]: drift.toFixed(3),
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
  const dragStateRef = useRef<LiquidDragState>(createIdleDragState());
  const [appMode, setAppMode] = useState(false);
  const [itemMetrics, setItemMetrics] = useState<Array<NavMetric | null>>([]);
  const [dragState, setDragState] = useState<LiquidDragState>(createIdleDragState());

  const activeIndex = navItems.findIndex((item) => isItemActive(pathname, item.match));

  function updateDragState(nextState: LiquidDragState) {
    dragStateRef.current = nextState;
    setDragState(nextState);
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

      if (!isItemActive(pathname, navItems[index].match)) {
        router.push(href);
      }
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

  const liquidBlobStyle = getLiquidBlobStyle(itemMetrics, activeIndex, dragState);

  return (
    <nav
      ref={navRef}
      className={`mobile-bottom-nav phone-only ${appMode ? "mobile-bottom-nav-app" : ""} ${dragState.active ? "mobile-bottom-nav-app-dragging" : ""}`}
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
        const dragTarget = dragState.active && dragState.targetIndex === index;

        if (appMode) {
          return (
            <button
              key={item.href}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`mobile-bottom-nav-item ${active ? "mobile-bottom-nav-item-active" : ""} ${dragTarget ? "mobile-bottom-nav-item-drag-target" : ""}`}
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
